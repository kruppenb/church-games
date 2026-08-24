# church-games-api

Shared weekly arcade leaderboard for [church-games](../README.md).
Azure Functions v4 (Node 22, TypeScript) + Azure Table Storage.

The site works without this API — when `VITE_LEADERBOARD_API` is unset the
client stays device-local. This service just makes the boards shared.

## Endpoints

Base path `/api`. All JSON, all responses `Cache-Control: no-store`,
error bodies are `{ "error": "..." }`.

| Method | Route | Behaviour |
|---|---|---|
| `GET` | `/api/weeks` | `{ weeks, currentWeekKey }` — the newest 6 stored week keys, newest first. |
| `GET` | `/api/board/{weekKey}` | `weekKey` is `current` or `YYYY-MM-DD`. `{ weekKey, boards: { [gameId]: Entry[] } }`, each board best-first, max 10. Unknown or non-retained week ⇒ `boards: {}`. |
| `POST` | `/api/score/{gameId}` | Body `{ initials, score, difficulty }` ⇒ `{ rank, weekKey, board }`. `rank` is 1-based, `-1` when the score did not make the board. Always writes to the server's current week. |
| `GET` | `/api/moderation/check` | Verifies the teacher passphrase in `x-moderation-key`. `204` / `401` / `429` (with `Retry-After`) — no body. |
| `DELETE` | `/api/entry/{weekKey}/{gameId}/{rowKey}` | Moderation. Requires `x-moderation-key`. `204` / `401` / `404` / `429`. |
| `OPTIONS` | any of the above | `204`, with CORS headers when the `Origin` is allowed. |
| timer | `leaderboardRetention` | Mon 10:00 UTC. Deletes every entity outside the newest 6 weeks. |

`Entry = { initials, score, difficulty: "little-kids" | "big-kids", ts, rowKey }`.

Validation (all `400`): `gameId` is one of the 9 catalog ids; `initials`
uppercases to `/^[A-Z]{3}$/` and is not blocklisted; `score` is a positive
integer at or below the per-game cap; `difficulty` is the enum.
`429` with `Retry-After` after 30 POSTs/minute from one IP (see
`LEADERBOARD_RATE_LIMIT_PER_MINUTE` below).

Wrong passphrases are throttled separately: 10 failures per IP per 15 minutes,
after which both `GET /moderation/check` and `DELETE /entry/...` answer `429`
with `Retry-After` for the rest of the window — even for the right passphrase.
Only failures count, so a room of teachers unlocking with the correct phrase
never trips it. The counter is in memory, per Function instance, like the POST
limiter (see `LEADERBOARD_AUTH_FAILURES_PER_15MIN` below).

## Data model

Table `leaderboard`, one entity per entry — no read-modify-write races.

- `partitionKey` = `` `${weekKey}_${gameId}` `` (e.g. `2026-08-23_survivors`)
- `rowKey` = `` `${9999999 - score, 7 digits}_${ts, 13 digits}` ``, so an
  ascending RowKey scan is already best-first with the earlier-timestamp
  tie-break built in.
- properties: `initials` (string), `score` (number), `difficulty` (string),
  `ts` (**string**, to dodge Int32/Int64 ambiguity — responses decode `ts`
  from the rowKey).

Privacy: nothing beyond `{ initials, score, difficulty, ts }` is accepted or
stored. No names, no device ids, no IP logging beyond the in-memory limiter.

## App settings

| Setting | Default | Notes |
|---|---|---|
| `LEADERBOARD_STORAGE_CONNECTION` | falls back to `AzureWebJobsStorage` | Table Storage connection string. |
| `LEADERBOARD_TIMEZONE` | `America/Los_Angeles` | IANA zone for the Sunday rollover. Invalid ⇒ default + one warning. |
| `MODERATION_KEY` | *(unset)* | The teacher passphrase. Compared (timing-safe) against `x-moderation-key` on `GET /moderation/check` and `DELETE /entry/...`. Unset ⇒ both are always `401`. Never in the Vite build or a URL. In Azure this setting holds only a `@Microsoft.KeyVault(SecretUri=…)` reference to the `moderation-key` secret in the `church-games-kv` vault, resolved at runtime by the app's managed identity (`infra/provision.sh` sets the vault, roles, secret, and reference up). Locally it is still the plain value in `local.settings.json`. The code reads `process.env.MODERATION_KEY` either way. |
| `LEADERBOARD_ALLOWED_ORIGINS` | *(unset)* | Comma-separated extras on top of the built-in list (Pages origin + localhost/127.0.0.1 on 5173/4174). |
| `LEADERBOARD_RATE_LIMIT_PER_MINUTE` | `30` | POSTs per 60 s per IP. Positive integer; anything else (blank, `0`, `2.5`, text) falls back to 30. |
| `LEADERBOARD_AUTH_FAILURES_PER_15MIN` | `10` | Wrong-passphrase attempts per IP per 15 min before `check`/`DELETE` return `429`. Positive integer; anything else falls back to 10. |
| `LEADERBOARD_TABLE` | `leaderboard` | Table name override, mostly for testing. |

The rate limit is **per IP, not per kid**: church wifi puts the whole classroom
behind one public IP, and the limiter runs before validation (it is the cheap
check), so rejected POSTs spend budget too. 30/min fits a full class finishing a
round together plus retries. Raise it with the setting above if a room ever hits
it; the in-memory counter is per Function instance either way.

CORS: this code adds the headers on actual responses, but in Azure the Functions
host answers browser preflights from the **platform** CORS allow-list before any
function runs — so the platform list must contain the same origins
(`infra/provision.sh` sets it). Locally `func start` has no platform list and
the in-code `OPTIONS` handler answers preflights itself.

## Local development

```bash
npm install
npm test          # vitest, no emulator needed
npm run typecheck
npm run build     # plain tsc -> dist/
```

`azurite` and `azure-functions-core-tools` are devDependencies (installed
above), so no global installs are needed. Two terminals:

```bash
# terminal 1 — storage emulator
npm run dev:storage      # azurite --silent --location .azurite

# terminal 2 — the API itself
cp local.settings.example.json local.settings.json
# local.settings.json: AzureWebJobsStorage="UseDevelopmentStorage=true" for
# Azurite, plus LEADERBOARD_TIMEZONE / MODERATION_KEY for local testing.
npm run dev               # build + func start
```

Note: the retention timer trigger needs Azurite's full emulator (queue +
table + blob), not the lighter `azurite-table`-only mode — `dev:storage`
already starts the full thing.

Both devDependencies are pruned by `npm prune --omit=dev` in CI before the
deploy zip is built, so neither one ships to Azure.

## curl

```bash
BASE=http://localhost:7071/api        # prod: https://church-games-api.azurewebsites.net/api

curl -s "$BASE/weeks"
curl -s "$BASE/board/current"
curl -s "$BASE/board/2026-08-23"

curl -s -X POST "$BASE/score/survivors" \
  -H 'Content-Type: application/json' \
  -d '{"initials":"NIK","score":1200,"difficulty":"big-kids"}'

# 400s: rude initials, over the cap, zero score
curl -s -X POST "$BASE/score/survivors" -H 'Content-Type: application/json' \
  -d '{"initials":"ASS","score":10,"difficulty":"big-kids"}'
curl -s -X POST "$BASE/score/survivors" -H 'Content-Type: application/json' \
  -d '{"initials":"NIK","score":999999,"difficulty":"big-kids"}'

# Is this the teacher passphrase? 204 yes, 401 no, 429 too many wrong tries
curl -s -i "$BASE/moderation/check" -H "x-moderation-key: $MODERATION_KEY"

# Moderation: rowKey comes from the board response
curl -s -i -X DELETE "$BASE/entry/2026-08-23/survivors/9998799_1756000000000" \
  -H "x-moderation-key: $MODERATION_KEY"
```

## Layout

```
src/lib/       week-key, row-key, validation, rate-limit, auth-throttle, cors,
               moderation, table-store (interface + Azure + in-memory fake),
               leaderboard-service (all business logic), http, handlers, config
src/functions/ weeks, board, score, entry, moderation-check, retention
               — registration only
```

Handlers are built by `createHandlers(deps)` so tests drive them with
`MemoryTableStore` and a pinned clock; `src/functions/*.ts` only wires the real
store in via `getRuntimeHandlers()`.
