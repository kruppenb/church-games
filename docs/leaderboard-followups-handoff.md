> **Superseded (2026-08-23):** the `#/teacher/:token` gate and the separate moderation-key prompt described here were replaced by one server-verified teacher passphrase — see [`teacher-passphrase-handoff.md`](./teacher-passphrase-handoff.md). Kept for history.

# Handoff: Shared Leaderboard Follow-ups

> **Status: implemented 2026-08-23** — A (moderation UI on `#/teacher/:token`),
> B (favicon), C (`npm run dev:storage` / `npm run dev` / `dev:shared`),
> D1 + D2 (D3 skipped per §7's recommendation, D4 nothing to do), and E
> (`api-weeks-alive` web test → `api-down-alert` → `site-down-alerts` email,
> created by `infra/provision.sh`; retention-timer check is due 2026-08-31).
> Also found and fixed along the way: the Pages workflow never passed
> `VITE_TEACHER_TOKEN` (the teacher page was always "Access Denied" in prod —
> it now reads the `VITE_TEACHER_TOKEN` repo secret, which must be set), and
> the teacher page scrolled sideways on phones because of the answer-key table.
> Current reference: [`docs/shared-leaderboard.md`](./shared-leaderboard.md)
> (§7 local dev, §8 moderation, §12 monitoring).

> **How to use this document**: start a Claude Code session in this repo and say
> "Implement docs/leaderboard-followups-handoff.md". Section 7 lists the
> decisions to confirm with Nicholas before writing code; everything else is
> settled. Each item is independent — they can be done in any order or split
> across sessions.

## 1. Context

The shared leaderboard shipped on 2026-08-23 (commits `e4f72e6`, `f21fc10`,
`a52895c`). Read `docs/shared-leaderboard.md` first — it is the runbook and
describes the architecture, endpoints, app settings and moderation flow. The
original design is in `docs/shared-leaderboard-handoff.md`.

Live resources: Function App `church-games-api` in RG `ChurchGames` (westus2),
API base `https://church-games-api.azurewebsites.net/api`, site at
`https://kruppenb.github.io/church-games/`. CI: `.github/workflows/deploy-api.yml`
(OIDC) and `deploy.yml` (Pages).

These follow-ups were deliberately left out of v1. None are blocking — the
feature works end to end today.

## 2. Follow-up A — Teacher moderation UI (v1.5)

**Problem.** Deleting a rude/cheating entry currently means `curl -X DELETE …
-H "x-moderation-key: …"` from a laptop. Nicholas should be able to do it from
a phone during class.

**Where it goes.** `site/src/components/TeacherMode.tsx`, routed at
`#/teacher/:token` (`site/src/App.tsx:30`). Add a "High Scores" section that
renders this week's boards with a delete button per row.

**Design (settled):**

- The moderation key is **never** built into the bundle and is **not**
  `VITE_TEACHER_TOKEN` (that one is a public, build-time URL gate — see
  `TeacherMode.tsx:16`). On first delete, prompt for the key with a plain
  `<input type="password">` in the section (not `window.prompt` — it blocks
  Playwright), keep it in `sessionStorage` under `church-games:moderation-key`
  only, never `localStorage`, never in the URL.
- Data: reuse `getWeekBoards("current")` from `@/lib/leaderboard-store`
  (entries already carry `rowKey` from the API). If `source !== "shared"`
  show "Shared leaderboard unavailable — nothing to moderate" and no buttons.
- Add `deleteEntry(weekKey, gameId, rowKey, key)` to
  `site/src/lib/leaderboard-api.ts` (`DELETE {base}/entry/{weekKey}/{gameId}/{rowKey}`
  with `x-moderation-key`), same `LeaderboardApiError` mapping, 3 s timeout.
  Do **not** add it to the facade — it is teacher-only and must not fall back
  to anything.
- UX: each row gets a `Remove` button (44 px min touch target); click ⇒
  inline "Remove AAA · 12,300?" confirm + `Yes, remove` / `Keep`; on `401`
  clear `sessionStorage`, show "Wrong key" and re-prompt; on success re-fetch
  the boards. No page reload.
- Also fix `GAME_LINKS` in `TeacherMode.tsx` while there — it lists games
  that no longer exist (`memory-match`, `adventure`, `party-rpg`,
  `maze-runner`). Build it from `GAMES` in `site/src/lib/games-catalog.ts`.
- Server: no change needed. CORS already allows `x-moderation-key`
  (`api/src/lib/http.ts` + platform preflight).

**Tests:** vitest for the new API function (401 ⇒ `http`/401, 204 ⇒
resolves) and the TeacherMode section (prompt on first click, sessionStorage
write, re-prompt on 401, list refresh on success — mock `fetch`). E2E: extend
`site/e2e/leaderboard.spec.ts`'s `mockLeaderboardApi` with a `DELETE` route
that checks the header, and one test that removes a seeded row through the
teacher page (`/#/teacher/<token>` — the dev token comes from `site/.env`;
set `VITE_TEACHER_TOKEN` in `playwright.config.ts`'s `webServer.env` the same
way `VITE_LEADERBOARD_API` is set).

**Acceptance:** from a phone-width viewport, remove an entry on the deployed
site with the real key; it disappears on another device's `#/leaderboard`
within one refresh; the key is absent from `localStorage`, the URL and the
built JS (`grep -r` the `site/dist/assets` for it after a build with the key
in `sessionStorage` — must be 0 hits, trivially, since it is runtime-only).

## 3. Follow-up B — Favicon 404

`site/index.html` has no `<link rel="icon">` and `site/public/` has no icon,
so every page load logs a `favicon.ico` 404 (visible in DevTools; harmless).
Add an SVG favicon (emoji-style trophy or the landing page's palette — check
`site/src/index.css` `:root` for the brand colors) as
`site/public/favicon.svg` plus `<link rel="icon" type="image/svg+xml" href="favicon.svg">`
(relative href — the site is served under `/church-games/` on Pages; Vite's
`base` handles absolute paths only for bundled assets). Also add
`<meta name="theme-color">`. Verify with the Playwright MCP console: zero
errors on `#/` and `#/leaderboard`.

## 4. Follow-up C — Local dev ergonomics for the API

Running the real API locally works but is undocumented as a one-liner:
`npx --yes azurite --silent --location <tmp>` + `cd api && npm run build &&
npx --yes -p azure-functions-core-tools@4 func start`. Timer triggers need the
full emulator (blob + queue), not `azurite-table`.

- Add `api/package.json` scripts: `"dev:storage": "azurite --silent --location .azurite"`
  and `"dev": "npm run build && func start"` with `azurite` and
  `azure-functions-core-tools` as devDependencies **only if** the
  `deploy-api.yml` `npm prune --omit=dev` step keeps them out of the zip
  (it does — verify the zip size in the workflow log stays < 10 MB).
  Add `.azurite/` to `.gitignore`.
- Add a `site` script `"dev:shared": "VITE_LEADERBOARD_API=http://localhost:7071/api vite"`
  (POSIX env syntax matches the existing `preview` script; Nicholas uses Git
  Bash).
- Update the "Local development" section of `docs/shared-leaderboard.md` and
  `api/README.md`.

## 5. Follow-up D — UX polish flagged during the visual loop

All optional; confirm with Nicholas which are worth it (§7).

1. **Blank gap while checking.** With the API configured but slow/offline, a
   kid sees nothing for up to 3 s after game over before either the initials
   overlay appears or the flow closes (`HighScoreFlow.tsx`, phase
   `"checking"` renders `null`). Option: render the `.lb-panel` shell with the
   score and a "Checking scores…" line during `"checking"`, but only after
   ~400 ms so the fast path never flashes it.
2. **Pill-switch flash.** `LeaderboardPage.tsx` sets `boards` to `null`
   (shows `Loading scores…`) on every week switch, which flashes on a fast
   API. Keep the previous boards rendered with reduced opacity while the next
   week loads; only show the loading text on first paint.
3. **Silent non-qualify in shared mode.** When the shared board rejects the
   score (`rank -1` from `qualifies`), the flow closes with no feedback —
   same as before, but now after a possible delay. Consider a 1.5 s
   "Not a high score this time — keep going!" toast. Kid-friendly copy,
   no sad faces.
4. **Rate-limit UX.** A `429` is already handled as "saved on this device"
   (`leaderboard-store.ts`). Nothing to do unless Nicholas wants a distinct
   message.

## 6. Follow-up E — Ops: alerting and retention check

- Mirror the baseball app's availability monitoring: an App Insights
  standard web test on `GET /api/weeks` (expect 200 + `"currentWeekKey"`)
  with a metric alert to Nicholas's email, created idempotently in
  `infra/provision.sh` (see `CoachingAppV2` RG: `homepage-alive` webtest +
  `site-down-alerts` action group + `homepage-down-alert`). Keep it free-tier.
- Verify the retention timer actually ran: after the first Monday
  (2026-08-31 10:00 UTC), `az monitor app-insights query` / the Functions
  "Monitor" blade should show `leaderboard retention: deleted N entities`.
  Until 7+ weeks of data exist, N will be 0 — that is fine.
- Note the per-instance rate limiter: on consumption scale-out, 30/min is
  per instance. Acceptable at classroom scale; document only.

## 7. Confirm with Nicholas before building

1. Is the teacher moderation UI (A) wanted now, and is `#/teacher/:token`
   the right home for it (vs. a key-gated button on `#/leaderboard`)?
2. Which of the UX polish items in D are worth doing (recommendation: D2 and
   D1; skip D3 unless kids ask "did it save?").
3. Alerting (E): email target, and whether to add it to `provision.sh` or
   click it up in the portal.

## 8. Acceptance checklist

1. `cd site && npm run validate` and `cd api && npm test && npm run typecheck && npm run build` green.
2. `cd site && npx playwright test e2e/leaderboard.spec.ts` green on all three
   projects; full `npm run test:e2e` has no new failures (re-run Phaser flakes
   in isolation before blaming them — the suite is load-sensitive).
3. CLAUDE.md visual validation loop for any UI change (TeacherMode section,
   favicon, loading/checking states) — desktop and iPhone widths.
4. Live check after deploy: `LEADERBOARD_LIVE_API=https://church-games-api.azurewebsites.net/api npm run test:e2e:live`
   still 6/6; moderation delete works from the teacher page; leave the
   production board clean afterwards (delete any test entries).
5. No secrets in the bundle: the moderation key never appears in
   `site/dist`, git, or the URL.

## 9. Out of scope (still)

- Migrating per-device localStorage boards into the shared store.
- Accounts/profiles; anti-cheat beyond the server-side caps.
- Realtime push updates.
- Moving hosting off GitHub Pages / to Static Web Apps.
