# Handoff: Shared Leaderboard on Azure

> **Status: implemented 2026-08-23.** This handoff document is kept for
> historical context; for the current architecture, API contract, provisioning,
> CI, local dev, and moderation instructions, see
> [`docs/shared-leaderboard.md`](./shared-leaderboard.md).

> **How to use this document**: start a Claude Code session in this repo and say
> "Implement docs/shared-leaderboard-handoff.md". Section 8 lists the decisions
> to confirm with Nicholas before writing code; everything else is settled.

## 1. Mission

The arcade leaderboard (shipped 2026-08-23, commit `06d3333`) stores boards in
**localStorage — each device has its own board**. Convert it to a **single
shared leaderboard** backed by a small Azure API so every kid on every device
sees the same top-10s.

Keep everything that defines the feature today:

- **No logins.** 3-letter initials only, entered arcade-style at game end.
- **Per-game top-10 boards** (scores across games are incomparable).
- **Weekly reset**: boards key by Sunday-start week; a new week = fresh board.
- **6-week history**, browsable at `#/leaderboard`.
- Kid-friendly: no error walls, silent degradation, big touch targets.

## 2. What exists today (read these before designing)

| Piece | File | Notes |
|---|---|---|
| Store | `site/src/lib/leaderboard-store.ts` | All week-key math, qualify/submit/prune, initials sanitizing + blocklist. **Synchronous** API. 62 unit tests in sibling `.test.ts`. |
| Entry overlay | `site/src/components/shared/HighScoreFlow.tsx` | The single integration point all 9 games render. Calls `qualifies()` on show, `submitScore()` on OK. |
| Board table | `site/src/components/shared/LeaderboardTable.tsx` | Renders one board via `getBoard(weekKey, gameId)`. |
| Page | `site/src/components/LeaderboardPage.tsx` | Week pills via `listWeeks()` + `getWeekKey()`; per-game cards. |
| Game catalog | `site/src/lib/games-catalog.ts` | Canonical gameIds: `quiz-showdown`, `word-scramble`, `faith-fortress`, `promised-land`, `millionaire`, `survivors`, `jeopardy`, `scripture-cards`, `kingdom-match`. |
| Phaser bridge | 4 scenes emit `game.events.emit("game:finished", { score })`; wrappers render HighScoreFlow. Don't touch this. |
| E2E | `site/e2e/leaderboard.spec.ts` | Currently seeds/asserts localStorage — must be reworked to mock the API (Playwright `page.route`). |

Invariants to preserve exactly (all unit-tested today):

- Week key = `YYYY-MM-DD` of the week's **Sunday**.
- Top 10 per (week, game). Tie-break: equal scores rank by earlier timestamp.
- Equal-to-10th on a full board does **not** qualify; `score <= 0` never does.
- Initials: exactly 3 chars A–Z, uppercase; blocklist rejects rude combos
  (list in `leaderboard-store.ts` — `BLOCKED_INITIALS`).
- Newest 6 weeks retained.

## 3. Recommended architecture

**Azure Functions (consumption plan) + Azure Table Storage.** Effectively free
at this scale (a classroom on Sundays), no servers, and the site stays exactly
where it is on GitHub Pages.

- Data model: **one Table Storage entity per leaderboard entry** — no
  read-modify-write races when two kids submit at once.
  - `PartitionKey` = `{weekKey}_{gameId}` (e.g. `2026-08-23_survivors`)
  - `RowKey` = `{paddedInvertedScore}_{paddedTsTicks}` where
    `paddedInvertedScore = String(9_999_999 - score).padStart(7, "0")`.
    Table Storage returns rows RowKey-ascending, so a partition scan yields
    **best-first order with the tie-break built in** — no sorting in code.
  - Properties: `initials`, `score`, `difficulty`.
- Retention: a weekly timer-triggered function deletes partitions older than
  6 weeks (query distinct week prefixes, delete old ones). Lazy filtering on
  read is the backstop.
- Alternative considered: Azure Static Web Apps (free tier, managed functions)
  — only worth it if Nicholas wants to move hosting off GitHub Pages entirely.
  Default to standalone Functions; the content pipeline pushes to this repo and
  Pages deploys are already wired.

## 4. API contract

Server **owns the week key** (client clocks drift). Compute "current Sunday"
in a configured IANA timezone (app setting `LEADERBOARD_TIMEZONE` — confirm
value with Nicholas, section 8).

- `GET /api/weeks` → `{ weeks: string[] }` — distinct stored week keys,
  newest first, max 6.
- `GET /api/board/{weekKey}` → `{ weekKey, boards: { [gameId]: Entry[] } }`
  — all boards for one week in a single call (LeaderboardPage renders up to
  9 cards; don't make it 9 requests).
- `POST /api/score/{gameId}` body `{ initials, score, difficulty }` →
  `{ rank, weekKey, board: Entry[] }` — rank is 1-based, `-1` if it fell off.
  Always writes to the **current** week. Returns the updated top-10 so
  HighScoreFlow renders the board phase from the response.
- `DELETE /api/entry/{weekKey}/{gameId}/{rowKey}` — moderation (see §5).

`Entry = { initials: string; score: number; difficulty: "little-kids" | "big-kids"; ts: number }`
(shape matches today's `LeaderboardEntry`; add `rowKey` in responses for
moderation).

Server-side validation (never trust the client — the client checks are UX):

- initials: `/^[A-Z]{3}$/` after uppercasing, and **the blocklist must be
  enforced server-side** (port `BLOCKED_INITIALS`); with a shared board a
  bypassed client shows rude initials to every kid in the class.
- score: integer, `> 0`, and per-game sanity cap (reject absurd values):
  quiz-showdown 50 000 · word-scramble 20 000 · jeopardy 20 000 ·
  millionaire 100 000 · scripture-cards 10 000 · faith-fortress 35 000 ·
  promised-land 10 000 · survivors 200 000 · kingdom-match 5 000.
- gameId must be one of the 9 catalog ids; difficulty must be the enum.
- Reject non-qualifying scores with a normal 200 + `rank: -1` (not an error).

## 5. Security, abuse, privacy

- **Privacy first — this is a kids' app.** The API must accept and store
  nothing beyond `{initials, score, difficulty, ts}`. No names, no device ids,
  no analytics. Initials-only is the feature's COPPA-friendly posture; keep it.
- **CORS**: allow only `https://kruppenb.github.io` (Pages origin; the
  `/church-games/` path is not part of the origin) plus `http://localhost:5173`
  and `http://localhost:4174` for dev/preview.
- **Rate limit** POSTs per IP (a simple in-function throttle or APIM-free
  approach is fine; ~10 submits/min/IP is generous for real play).
- **Moderation**: `DELETE` endpoint guarded by a secret in an
  `x-moderation-key` header, stored in Function App settings.
  ⚠️ **Do NOT reuse `VITE_TEACHER_TOKEN`** — it is a build-time client-side
  check baked into the public JS bundle (see `TeacherMode.tsx:16`); anyone can
  read it. Mint a separate secret that never enters the Vite build. Simplest
  v1 moderation UI: none — Nicholas deletes via `curl`/Azure portal; optional
  v1.5: a delete button in TeacherMode that prompts for the key and keeps it
  in sessionStorage only.
- Anti-cheat beyond sanity caps is explicitly **out of scope** — scores are
  client-claimed; acceptable for this audience.

## 6. Client changes

Refactor `leaderboard-store.ts` into an **async API client with the current
localStorage implementation as offline fallback** (church wifi is unreliable;
the games must never break because the API is down):

- `qualifies`, `submitScore`, `getBoard`, `listWeeks` become async; on fetch
  failure or timeout (~3s), fall back to the existing local logic so a device
  still gets its arcade experience offline. Show a small "offline — scores
  saved on this device" note in HighScoreFlow's board phase and on
  LeaderboardPage when falling back.
- `getWeekKey`/`formatWeekLabel`/`sanitizeInitials`/`isAllowedInitials`/
  `getLastInitials` stay local (last-initials prefill remains per-device).
- Call sites that go async (the full list):
  - `HighScoreFlow.tsx`: the qualify effect and `handleOk` (add a brief
    submitting state on the OK button; render the board phase from the POST
    response rather than re-reading).
  - `LeaderboardTable.tsx`: accept entries as a prop OR fetch internally —
    prefer lifting the fetch to LeaderboardPage/HighScoreFlow and making the
    table pure (props), which also simplifies tests.
  - `LeaderboardPage.tsx`: fetch weeks + selected week's boards.
- API base URL via `VITE_LEADERBOARD_API` (set in the Pages deploy workflow);
  when unset, the client runs pure-local — which keeps `npm run dev`, unit
  tests, and offline demos working with zero setup.
- Do not touch the per-game integrations or the Phaser `game:finished` bridge.

## 7. Deployment & discovery (for the implementing session)

1. Discover Nicholas's Azure conventions before creating anything:
   `az account show`, `az group list -o table`, look at how his other
   projects name/tag/deploy things, and reuse the pattern.
2. Infra: one resource group (or his existing shared one), one storage
   account, one consumption Function App. Node 20+ isolated or TypeScript
   functions — match the repo's TypeScript-everywhere convention.
3. CI: a GitHub Actions workflow deploying the function app (prefer OIDC
   federated credentials; publish-profile secret is the fallback). Client env
   var `VITE_LEADERBOARD_API` added to the existing Pages deploy workflow.
4. Repo layout: put the API in `api/` at repo root with its own
   `package.json` and unit tests (validation, week-key/timezone math,
   RowKey encoding round-trip).

## 8. Confirm with Nicholas before building

1. **Timezone** for the Sunday week rollover (`LEADERBOARD_TIMEZONE`).
2. **Resource group / region / naming** — reuse an existing RG or new one?
3. Standalone **Functions vs Static Web Apps** (recommendation: Functions,
   keep GitHub Pages hosting).
4. Is **teacher moderation UI** in scope for v1, or curl-only?
5. Anything about his other Azure projects' conventions the infra should copy.

## 9. Acceptance checklist

1. Submit on device A → appears on device B's `#/leaderboard` and in device
   B's HighScoreFlow board phase without a deploy or manual refresh ritual.
2. Server computes the week key in the configured timezone; a submit near
   Saturday midnight lands in the correct week regardless of client clock.
3. Retention: weeks older than the newest 6 disappear from `GET /api/weeks`.
4. Rude initials rejected by the API even when sent via `curl`.
5. Per-game score caps rejected via `curl`; normal scores accepted.
6. Kill the API (bad URL locally) → games still finish, initials entry still
   works, boards fall back to device-local with the offline note; restore →
   shared boards return.
7. Moderation DELETE removes an entry; wrong/missing key → 401.
8. Full repo conventions pass: `npm run validate`, `npm run test:e2e`
   (leaderboard spec reworked to Playwright route mocks; keep one live smoke
   test against the deployed API tagged to run on demand), and the
   CLAUDE.md **visual validation loop** for HighScoreFlow's new
   submitting/offline states.
9. No regressions in the other 8 games' flows; unit suite stays green
   (rework the store tests: local-fallback logic keeps its coverage, new
   client gets fetch-mocked tests).

## 10. Out of scope

- Migrating existing per-device localStorage boards into the shared store.
- Accounts, profiles, or any identity beyond initials.
- Anti-cheat beyond server-side sanity caps.
- Realtime push updates (polling/refetch on page view is plenty).
