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
| `GET /api/moderation/check` | Verifies the teacher passphrase. `401` if `MODERATION_KEY` is unset, the `x-moderation-key` header is missing, or it doesn't match (timing-safe compare) — never distinguishes the two. `429` (with `Retry-After`) when the wrong-passphrase throttle has been tripped. `204` on a correct match. No body either way; no storage access. |
| `DELETE /api/entry/{weekKey}/{gameId}/{rowKey}` | Moderation. `401` if `MODERATION_KEY` is unset, the `x-moderation-key` header is missing, or it doesn't match (timing-safe compare). `429` (with `Retry-After`) when the wrong-passphrase throttle has been tripped. `400` on malformed params, `404` if the entity is gone, `204` on success. |
| `OPTIONS` (every route) | `204`. CORS headers included only when `Origin` is on the allow-list. |
| Timer `retention` | `0 0 10 * * 1` (Mon 10:00 UTC ≈ Mon 03:00 Pacific). Deletes every entity in a week outside the newest 6. Logs the count deleted. |

**Wrong-passphrase throttle**: `GET /moderation/check` and `DELETE /entry/...`
share one budget — 10 wrong-passphrase attempts per client IP per 15 minutes
(sliding window). Only failures count, so a room of teachers using the right
phrase never trips it; a NATed classroom guessing wrong 10 times locks that IP
out of both routes for the remainder of the window. The counter is in-memory
and per Function instance, same caveat as the POST rate limiter above.
Override with `LEADERBOARD_AUTH_FAILURES_PER_15MIN` (§4).

CORS lives in **two places that must agree**. In Azure the Functions host
answers browser preflights (`OPTIONS` + `Origin`) from the **platform**
allow-list before any function code runs (with an empty list it returns 204
with no `Access-Control-Allow-Origin` and the browser blocks the call);
actual responses get their CORS headers from the **API code**
(`api/src/lib/cors.ts`). `infra/provision.sh` sets the platform list to the
same origins. Allowed origins: `https://kruppenb.github.io`,
`http://localhost:5173`, `http://localhost:4174`, `http://127.0.0.1:5173`,
`http://127.0.0.1:4174`. To add one: add it to the `LEADERBOARD_ALLOWED_ORIGINS`
app setting (comma-separated) **and** `az functionapp cors add … --allowed-origins <origin>`
(or re-run provisioning with `ALLOWED_ORIGINS="…"`).

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
| `MODERATION_KEY` | The teacher passphrase (a memorable phrase Nicholas picks). Compared timing-safe against `x-moderation-key` on `GET /moderation/check` and `DELETE`. **Stored as the Key Vault secret `moderation-key` in the vault `church-games-kv`** — the Function App setting holds only a versionless `@Microsoft.KeyVault(SecretUri=…)` reference, resolved at runtime by the app's system-assigned managed identity (role *Key Vault Secrets User*). So the passphrase is readable neither in this repo nor by the GitHub OIDC deploy principal: its Contributor role on the resource group grants no Key Vault data-plane rights on an RBAC-authorized vault. Rotation is unchanged: `MODERATION_KEY='…' ./provision.sh` writes a new secret version and restarts the app — see §5/§8. |
| `LEADERBOARD_ALLOWED_ORIGINS` | Optional comma-separated list of extra allowed CORS origins, appended to the fixed list in §2. |
| `LEADERBOARD_RATE_LIMIT_PER_MINUTE` | Optional POST budget per IP per 60 s (default `30`). Must be a positive integer; blank/`0`/fractional/non-numeric values are ignored and the default applies. |
| `LEADERBOARD_AUTH_FAILURES_PER_15MIN` | Optional wrong-passphrase budget per IP per 15 min, shared by `GET /moderation/check` and `DELETE` (default `10`). Must be a positive integer; blank/`0`/fractional/non-numeric values are ignored and the default applies. |

The rate limit is **per IP, not per kid** — church wifi NATs the whole classroom
behind one public address, and the limiter runs before validation (it is the
cheap check), so validation-rejected POSTs spend budget too. 30/min fits a class
finishing a round together plus retries. Raise the setting if a room ever hits
it; the counter is in-memory and per Function instance either way — if the
consumption plan ever scales out to N instances, the effective budget is
N × 30/min per IP (requests are spread across instances). Acceptable at
classroom scale; documented here so nobody expects a strict global cap.

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
5. Key Vault `church-games-kv` (RBAC authorization, not access policies), plus
   the two role assignments it needs on the vault scope: *Key Vault Secrets
   Officer* for the signed-in operator (so this script can write the secret)
   and *Key Vault Secrets User* for the Function App's system-assigned managed
   identity, which is enabled here if it isn't already (so the app can read it
   at runtime). If a **soft-deleted** vault of that name exists the script
   fails fast with the `az keyvault recover` hint — Key Vault names stay
   reserved while soft-deleted.
6. App settings `LEADERBOARD_TIMEZONE` and `MODERATION_KEY` (the teacher
   passphrase). The passphrase goes into the Key Vault secret `moderation-key`;
   the app setting is set to the versionless reference
   `@Microsoft.KeyVault(SecretUri=https://church-games-kv.vault.azure.net/secrets/moderation-key/)`.
   The first-run value is generated with `openssl rand -hex 24` and **printed
   exactly once** — store it in a password manager immediately, the script will
   not show it again. It's a random placeholder, meant to be rotated to a
   memorable phrase teachers can actually say out loud (e.g.
   `moses-parts-the-sea`): `MODERATION_KEY='moses-parts-the-sea' ./provision.sh`.
   Re-running the script otherwise leaves an existing secret alone; pass
   `MODERATION_KEY=<value>` explicitly to rotate it on purpose (a new secret
   version). A plaintext passphrase left over from a pre-Key-Vault deployment is
   migrated into the vault unchanged. Whenever the secret is written or the app
   setting is switched to the reference, the script restarts the Function App —
   a versionless reference is re-resolved on restart, otherwise the host can
   serve the previously resolved value for up to ~a day.
7. Sets the platform CORS allow-list to the same origins the API code allows
   (see §2 — the Functions host answers preflights from this list, so it is
   not optional). Idempotent: only missing origins are added.
8. GitHub OIDC app registration `github-deploy-church-games`: app
   registration, service principal, a federated credential for
   `repo:kruppenb/church-games:ref:refs/heads/main` (issuer
   `https://token.actions.githubusercontent.com`, audience
   `api://AzureADTokenExchange`), and a Contributor role assignment scoped to
   the `ChurchGames` resource group. Deliberately **not** granted any Key Vault
   data-plane role — the deploy principal cannot read the passphrase.
9. Sets GitHub Actions repo **variables** (not secrets — OIDC needs no client
   secret, and `VITE_LEADERBOARD_API` ends up in the public JS bundle anyway)
   on `kruppenb/church-games`: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
   `AZURE_SUBSCRIPTION_ID`, `VITE_LEADERBOARD_API`.
10. Prints a summary (Function App URL, Key Vault, next steps).

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
`infra/provision.sh` sets in step 9 above. If you ever need to set them by
hand instead: `gh variable set NAME --body VALUE --repo kruppenb/church-games`.

## 7. Local development

**API** (`api/`), against [Azurite](https://github.com/Azure/Azurite) (the
local Azure Storage emulator) instead of a real storage account. `azurite` and
`azure-functions-core-tools` are `api/` devDependencies — `npm install` pulls
both, no global install needed. Two terminals:

```bash
cd api
npm install

# terminal 1 — storage emulator
npm run dev:storage      # azurite --silent --location .azurite

# terminal 2 — the API itself
cp local.settings.example.json local.settings.json
# local.settings.json: set AzureWebJobsStorage to "UseDevelopmentStorage=true"
# for Azurite, and set LEADERBOARD_TIMEZONE / MODERATION_KEY for local testing.
npm run dev               # build + func start
```

The retention timer trigger needs Azurite's full emulator (queue + table +
blob), not the lighter table-only mode — `dev:storage` already starts the
full thing. The table is created automatically on first use if it doesn't
exist. Both devDependencies are pruned by `npm prune --omit=dev` in CI before
the deploy zip is built, so neither ships to Azure.

**Site** (`site/`): leave `VITE_LEADERBOARD_API` unset in `site/.env` to run
pure-local (no API needed), or run `cd site && npm run dev:shared` to point a
dev server at `http://localhost:7071/api` (the default Functions Core Tools
port) and exercise the real client/API path end-to-end. See
`site/.env.example`.

## 8. Moderation

**From a phone (the normal way):** open
`https://kruppenb.github.io/church-games/#/teacher` (or tap the `Teacher`
link in the landing page's footer) and type the teacher passphrase. Tick
**"Remember on this device"** to skip the prompt next time — leave it
unticked on the shared church laptop, since the tab then forgets the
passphrase when closed. `Unlock` verifies the phrase against the server
(`GET /moderation/check`) and opens the dashboard. The "High Scores — this
week" section lists every entry on this week's shared boards with a `Remove`
button per row (44 px touch targets); tap `Remove` → `Yes, remove` — there is
no second key prompt, since the passphrase *is* the moderation key. `Lock` in
the header clears the stored passphrase and returns to the gate. If the
shared API is unreachable the gate says "Can't reach the leaderboard server —
check the connection" with a **Retry** button (there is no offline teacher
mode, by design). The change is visible on every other device's
`#/leaderboard` on its next load.

Rotation: `cd infra && MODERATION_KEY='new-phrase' ./provision.sh`. That writes
a new version of the `moderation-key` Key Vault secret and restarts the Function
App so its versionless reference re-resolves (a few seconds of cold start on the
consumption plan — do it on a Sunday-off hour). Every device — even one that had
"Remember on this device" checked — is then re-prompted with "The passphrase has
changed — enter the new one" the next time it calls `check` (on load, or on its
next `Remove`).

Implementation: the gate is `site/src/components/TeacherMode.tsx`; the stored
passphrase lives in `site/src/lib/teacher-session.ts`; verification and
deletion are `checkTeacherKey()` / `deleteEntry()` in
`site/src/lib/leaderboard-api.ts` (deliberately **not** part of the
`leaderboard-store.ts` facade — moderation must never fall back to the
device-local store).

**From a laptop (fallback):** delete with `curl`. RowKeys are visible in
`GET /api/board/{weekKey}` responses (each entry's `rowKey` field); look up
the entry there first:

```bash
# 1. Find the entry to remove — note its rowKey
curl -s https://church-games-api.azurewebsites.net/api/board/current \
  | jq '.boards["quiz-showdown"]'

# 2. Delete it, using the weekKey/gameId/rowKey from step 1
curl -i -X DELETE \
  "https://church-games-api.azurewebsites.net/api/entry/2026-08-23/quiz-showdown/0009950_1755912345678" \
  -H "x-moderation-key: <the teacher passphrase>"
```

A `204` means it was deleted. `401` means the header is missing/wrong or
`MODERATION_KEY` isn't resolving on the Function App. `404` means that entry is
already gone. The passphrase is the **only** teacher secret — it lives in Azure
Key Vault (`church-games-kv`, secret `moderation-key`), resolved by the Function
App at runtime through its managed identity, and in teachers' heads/password
managers, and it is never in the client bundle, git, logs, or a URL.

## 9. Live smoke test

A tagged Playwright spec (`site/e2e/leaderboard-live.spec.ts`) exercises the
**deployed** API read-only (no real score is ever written, and no wrong
passphrase is ever guessed — the live throttle counts failures): weeks/board
shape checks, rude-initials rejection, over-cap rejection, zero-score
rejection, an unauthenticated `DELETE` returning `401`, and an unauthenticated
`GET /moderation/check` also returning `401` (7 tests). It's skipped unless
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

## 12. Monitoring

`infra/provision.sh` creates (idempotently, create-only-if-missing) the same
trio the CoachingAppV2 RG uses, all free at this scale:

| Resource | Name | What it does |
|---|---|---|
| Application Insights standard web test | `api-weeks-alive` | Every 5 min from 3 US regions: `GET https://church-games-api.azurewebsites.net/api/weeks`, expects HTTP 200 **and** the text `currentWeekKey` in the body, checks the TLS cert has ≥ 30 days left. Tagged to the `church-games-api` App Insights component. |
| Action group | `site-down-alerts` | Emails `nicholaskrupper@outlook.com` (override with `ALERT_EMAIL=…`; `ALERT_EMAIL=""` skips monitoring entirely). |
| Metric alert | `api-down-alert` | Severity 1; fires when `availabilityResults/availabilityPercentage` for `availabilityResult/name = api-weeks-alive` averages below 100 % over a 15-minute window, evaluated every 5 min. |

Created 2026-08-23. Where to look: Azure portal → `church-games-api` (App
Insights) → Availability. Note the `az monitor metrics alert create` step
prints a spurious `mismatched input '/' expecting WHITESPACE` line — the CLI's
condition parser complaining about the slash in the dimension name — but the
rule is created with the dimension intact.

**Retention timer check.** The `retention` function runs Mondays 10:00 UTC
(`0 0 10 * * 1`); its first run after the shared launch is **2026-08-31**.
Verify it ran with

```bash
az monitor app-insights query --app church-games-api -g ChurchGames \
  --analytics-query "traces | where message has 'leaderboard retention' | order by timestamp desc | take 5" -o table
```

(or the Function App's *Monitor* blade for `retention`). Expect
`leaderboard retention: deleted N entities`; N stays 0 until more than 6 weeks
of data exist — that is fine.
