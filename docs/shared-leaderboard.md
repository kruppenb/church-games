# Shared Leaderboard: Runbook

Implemented 2026-08-23. The weekly arcade leaderboard is backed by a small
Azure Functions API + Azure Table Storage, with the original device-local
`localStorage` store kept as an automatic offline fallback. This document is
the operational reference; `docs/shared-leaderboard-handoff.md` is the
original design doc that started this work.

## 1. Architecture

```
site/ (GitHub Pages, static)          api/ (Azure Functions, consumption plan)
  leaderboard-store.ts  ──fetch──►      functions/*.ts
    │  async facade                       │
    ▼                                     ▼
  leaderboard-local.ts               Azure Table Storage
  (localStorage fallback,              table: leaderboard
   used when the API is                 PartitionKey = {weekKey}_{gameId}
   unset/unreachable/slow)              RowKey = {invertedScore}_{ts}
```

- The site stays on GitHub Pages — nothing about hosting changed.
- The API is a standalone Azure Functions app (Node 22, Functions v4, Linux
  consumption plan), deployed independently via its own GitHub Actions
  workflow.
- Data model: **one Table Storage entity per leaderboard entry** (not one row
  per board), so two simultaneous submissions never race on a read-modify-write.
- A weekly timer function prunes weeks older than the newest 6; reads also
  lazily hide any week outside that retained set as a backstop.
- The client (`site/src/lib/leaderboard-store.ts`) is an async facade: when
  `VITE_LEADERBOARD_API` is set it calls the API and falls back to the local
  store on any failure or timeout; when unset it is pure-local (same as
  before this feature — dev, tests, and offline demos need zero setup). See
  §7 "Offline behavior" below.

## 2. API contract

Base URL: `https://church-games-api.azurewebsites.net/api` (prod). All
responses are JSON with `Cache-Control: no-store`. Error bodies are
`{ error: string }`.

| Method & route | Behavior |
|---|---|
| `GET /api/weeks` | `200 { weeks: string[], currentWeekKey: string }` — distinct stored week keys, newest first, max 6. `currentWeekKey` is the server-computed current Sunday in `LEADERBOARD_TIMEZONE`. |
| `GET /api/board/{weekKey}` | `weekKey` is `current` or `YYYY-MM-DD` (`400` on any other format). `200 { weekKey, boards: { [gameId]: Entry[] } }` — every game with ≥1 entry that week, best-first, max 10 each. A week outside the retained newest-6 set (or unknown) returns `boards: {}`. |
| `POST /api/score/{gameId}` body `{ initials, score, difficulty }` | Validates `gameId` (one of 9 catalog ids), `initials` (uppercased, `/^[A-Z]{3}$/`, not blocklisted), `score` (integer, `> 0`, `<=` the per-game cap), `difficulty` (`little-kids`/`big-kids`). `400` on any validation failure. `429` (with `Retry-After`) when rate-limited — 30 POSTs per 60 s per IP by default, see `LEADERBOARD_RATE_LIMIT_PER_MINUTE` in §4. Always writes to the **current** week — server clock + timezone, never the client's `ts`. Non-qualifying score ⇒ `200 { rank: -1, weekKey, board }` (not an error). Otherwise inserts, trims the partition back to 10, responds `200 { rank, weekKey, board }`. |
| `DELETE /api/entry/{weekKey}/{gameId}/{rowKey}` | Moderation. `401` if `MODERATION_KEY` is unset, the `x-moderation-key` header is missing, or it doesn't match (timing-safe compare). `400` on malformed params, `404` if the entity is gone, `204` on success. |
| `OPTIONS` (every route) | `204`. CORS headers included only when `Origin` is on the allow-list. |
| Timer `retention` | `0 0 10 * * 1` (Mon 10:00 UTC ≈ Mon 03:00 Pacific). Deletes every entity in a week outside the newest 6. Logs the count deleted. |

CORS is enforced **in application code**, not the Functions platform config
(provisioning clears the platform CORS list — see §5). Allowed origins:
`https://kruppenb.github.io`, `http://localhost:5173`, `http://localhost:4174`,
`http://127.0.0.1:5173`, `http://127.0.0.1:4174`, plus any comma-separated
extras in the `LEADERBOARD_ALLOWED_ORIGINS` app setting.

Entry shape (wire and client):
`{ initials: string; score: number; difficulty: "little-kids" | "big-kids"; ts: number; rowKey?: string }`
— `rowKey` is present in API responses (needed for moderation deletes), never
required from the client.

## 3. Data model (Azure Table Storage)

Table `leaderboard`, one entity per leaderboard entry:

- `PartitionKey = "{weekKey}_{gameId}"` (e.g. `2026-08-23_survivors`)
- `RowKey = "{paddedInvertedScore}_{paddedTs}"` where
  `paddedInvertedScore = String(9_999_999 - score).padStart(7, "0")` and
  `paddedTs = String(ts).padStart(13, "0")`. Table Storage returns rows
  RowKey-ascending within a partition, so a partition scan is already
  **best-first, earlier-ts-wins-ties** — no sorting needed in code.
- Properties: `initials` (string), `score` (number), `difficulty` (string),
  `ts` (string — kept as a string to avoid Int32/Int64 ambiguity in the SDK).
- On a RowKey collision (409, same score + same millisecond), the write is
  retried once with `ts + 1`.
- Week-scoped queries use `PartitionKey ge '{weekKey}_' and PartitionKey lt '{weekKey}\`'`
  (backtick is the character after `_`). Distinct weeks are found by listing
  `PartitionKey` values, taking the first 10 characters, deduping, and
  sorting descending.

## 4. App settings / environment variables

Azure Function App (`church-games-api`) settings:

| Setting | Purpose |
|---|---|
| `AzureWebJobsStorage` | Set automatically by `az functionapp create --storage-account`. |
| `LEADERBOARD_STORAGE_CONNECTION` | Optional override for where leaderboard data lives; falls back to `AzureWebJobsStorage` when unset. |
| `LEADERBOARD_TIMEZONE` | IANA timezone used to compute the Sunday week key (`America/Los_Angeles` by default). Invalid/unset ⇒ falls back to `America/Los_Angeles` with a one-time warning log. |
| `MODERATION_KEY` | Secret compared (timing-safe) against the `x-moderation-key` header on `DELETE`. Generated once by `infra/provision.sh` — see §5. |
| `LEADERBOARD_ALLOWED_ORIGINS` | Optional comma-separated list of extra allowed CORS origins, appended to the fixed list in §2. |
| `LEADERBOARD_RATE_LIMIT_PER_MINUTE` | Optional POST budget per IP per 60 s (default `30`). Must be a positive integer; blank/`0`/fractional/non-numeric values are ignored and the default applies. |

The rate limit is **per IP, not per kid** — church wifi NATs the whole classroom
behind one public address, and the limiter runs before validation (it is the
cheap check), so validation-rejected POSTs spend budget too. 30/min fits a class
finishing a round together plus retries. Raise the setting if a room ever hits
it; the counter is in-memory and per Function instance either way.

Site build (`site/`):

| Variable | Purpose |
|---|---|
| `VITE_LEADERBOARD_API` | Base URL of the API, including `/api` (e.g. `https://church-games-api.azurewebsites.net/api`). Unset ⇒ the client runs pure-local, same as before this feature. Set via the `VITE_LEADERBOARD_API` GitHub Actions repo **variable**, consumed by `.github/workflows/deploy.yml`'s Build step. Locally, add it to `site/.env` (see `site/.env.example`) or leave it unset for local-only boards. |

## 5. Provisioning

`infra/provision.sh` creates/updates everything needed to run and deploy the
API. It is idempotent — safe to re-run — and supports `--dry-run` to preview
the mutating commands without changing anything. All values are overridable
via environment variables; defaults match §1 of the design spec:

```bash
cd infra
./provision.sh --dry-run   # preview
./provision.sh             # run for real (requires az login + gh auth login)
```

What it does, in order:

1. Resource group `ChurchGames` (region `westus2`, tag `project=church-games`).
2. Storage account `churchgamesfunc` (Standard_LRS, StorageV2, TLS 1.2 min,
   public blob access disabled, HTTPS-only). Storage account names are
   globally unique across Azure — the script checks name availability before
   creating and fails fast with a clear message if it's taken.
3. Table `leaderboard` in that storage account.
4. Function App `church-games-api` (Linux consumption/Y1, Node 22,
   Functions v4), then hardened (`httpsOnly=true`, min TLS 1.2).
5. App settings `LEADERBOARD_TIMEZONE` and `MODERATION_KEY`. The moderation
   key is generated with `openssl rand -hex 24` and **printed exactly once**
   — store it in a password manager immediately, the script will not show it
   again. Re-running the script leaves an existing key alone; pass
   `MODERATION_KEY=<value>` explicitly to rotate it on purpose.
6. Clears the platform CORS allow-list (the API enforces CORS in code — see
   §2 — so a platform-level allow-list would only add a second, redundant
   place for origins to go stale).
7. GitHub OIDC app registration `github-deploy-church-games`: app
   registration, service principal, a federated credential for
   `repo:kruppenb/church-games:ref:refs/heads/main` (issuer
   `https://token.actions.githubusercontent.com`, audience
   `api://AzureADTokenExchange`), and a Contributor role assignment scoped to
   the `ChurchGames` resource group.
8. Sets GitHub Actions repo **variables** (not secrets — OIDC needs no client
   secret, and `VITE_LEADERBOARD_API` ends up in the public JS bundle anyway)
   on `kruppenb/church-games`: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
   `AZURE_SUBSCRIPTION_ID`, `VITE_LEADERBOARD_API`.
9. Prints a summary (Function App URL, next steps).

After provisioning:

1. Push to `main` (or `gh workflow run deploy-api.yml`) to deploy the API —
   see §6.
2. Push to `main` (or `gh workflow run deploy.yml`) to rebuild the site with
   `VITE_LEADERBOARD_API` baked in.
3. Smoke test: `curl https://church-games-api.azurewebsites.net/api/weeks`.

## 6. CI

Two independent GitHub Actions workflows:

- **`.github/workflows/deploy-api.yml`** ("Deploy Leaderboard API") — triggers
  on push to `main` touching `api/**` (or itself), plus manual dispatch.
  Checks out, installs, runs `npm test`, builds, prunes dev dependencies,
  logs in to Azure via OIDC (`azure/login@v2` using the
  `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID` repo
  variables), then deploys with `Azure/functions-action@v1` to
  `church-games-api`. No publish-profile secret is used — OIDC federated
  credentials only, mirroring the sibling `baseball-coach-helper` repo's
  convention.
- **`.github/workflows/deploy.yml`** ("Deploy to GitHub Pages") — unchanged
  except the Build step's `env` now also passes
  `VITE_LEADERBOARD_API: ${{ vars.VITE_LEADERBOARD_API }}` so the production
  site bundle points at the live API.

Both workflows read the same four repo variables that
`infra/provision.sh` sets in step 8 above. If you ever need to set them by
hand instead: `gh variable set NAME --body VALUE --repo kruppenb/church-games`.

## 7. Local development

**API** (`api/`), against [Azurite](https://github.com/Azure/Azurite) (the
local Azure Storage emulator) instead of a real storage account:

```bash
npm install -g azurite            # once
azurite --silent &                # or run in its own terminal

cd api
cp local.settings.example.json local.settings.json
# local.settings.json: set AzureWebJobsStorage to "UseDevelopmentStorage=true"
# for Azurite, and set LEADERBOARD_TIMEZONE / MODERATION_KEY for local testing.
npm install
npm start   # requires Azure Functions Core Tools (`npm install -g azure-functions-core-tools@4`)
```

`npm start` runs `prestart` (`tsc` build) first. The table is created
automatically on first use if it doesn't exist.

**Site** (`site/`): leave `VITE_LEADERBOARD_API` unset in `site/.env` to run
pure-local (no API needed), or point it at `http://localhost:7071/api` (the
default Functions Core Tools port) to exercise the real client/API path
end-to-end. See `site/.env.example`.

## 8. Moderation

There is no in-app moderation UI in v1 — delete a rude/mistaken entry with
`curl`. RowKeys are visible in `GET /api/board/{weekKey}` responses (each
entry's `rowKey` field); look up the entry there first:

```bash
# 1. Find the entry to remove — note its rowKey
curl -s https://church-games-api.azurewebsites.net/api/board/current \
  | jq '.boards["quiz-showdown"]'

# 2. Delete it, using the weekKey/gameId/rowKey from step 1
curl -i -X DELETE \
  "https://church-games-api.azurewebsites.net/api/entry/2026-08-23/quiz-showdown/0009950_1755912345678" \
  -H "x-moderation-key: <MODERATION_KEY from the Function App's settings>"
```

A `204` means it was deleted. `401` means the header is missing/wrong or
`MODERATION_KEY` isn't set on the Function App. `404` means that entry is
already gone. The moderation key lives only in the Function App's app
settings — it is never part of the client build (unlike
`VITE_TEACHER_TOKEN`, which is baked into the public JS bundle and must
never be reused for this).

## 9. Live smoke test

A tagged Playwright spec (`site/e2e/leaderboard-live.spec.ts`) exercises the
**deployed** API read-only (no real score is ever written): weeks/board shape
checks, rude-initials rejection, over-cap rejection, zero-score rejection,
and an unauthenticated `DELETE` returning `401`. It's skipped unless
`LEADERBOARD_LIVE_API` is set:

```bash
cd site
LEADERBOARD_LIVE_API=https://church-games-api.azurewebsites.net/api npm run test:e2e:live
```

## 10. Offline behavior of the client

`site/src/lib/leaderboard-store.ts` never throws and never blocks a game from
finishing. Every result carries a `source` field:

| `source` | Meaning | Note shown to the kid? |
|---|---|---|
| `"shared"` | Came from the live API. | No. |
| `"local"` | `VITE_LEADERBOARD_API` is unset — pure device-local by design (dev, tests, offline demos). | No — this is the normal/expected mode, not a failure. |
| `"offline"` | The API **is** configured but unreachable or timed out (3 s) — the device-local store was used as a fallback. | Yes — a small "Offline — score saved on this device" note in `HighScoreFlow`'s board phase and on `#/leaderboard`. |

A score the server actively rejects (over the cap, rude initials, rate
limited) is **not** written to the local fallback and is **not** treated as
offline — the client shows the server's `rank: -1` response as-is
(`source: "shared"`), since the server made a real decision about it.

## 11. Out of scope

- Migrating existing per-device `localStorage` boards into the shared store.
- Accounts, profiles, or any identity beyond 3-letter initials.
- Anti-cheat beyond the server-side per-game score caps — scores are
  client-claimed, which is acceptable for this audience.
- Realtime push updates — the client polls/refetches on page view, which is
  plenty for a Sunday classroom.
- An in-app moderation UI — v1 is curl-only (see §8).
