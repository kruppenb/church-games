# Handoff: One Teacher Passphrase (replace the token URL + moderation key)

> **Status: implemented 2026-08-23.** Nicholas's to-do in §9 still applies (pick the phrase, rotate, delete the GitHub secret).
>
> **How to use this document**: start a Claude Code session in this repo and say
> "Implement docs/teacher-passphrase-handoff.md". Every design decision below
> is settled with Nicholas — do not re-open them. The only inputs still owed by
> Nicholas are in §9 (pick the passphrase, run two commands). Implement in the
> order of §3 → §4 → §5 → §6; the API must be deployed **before** the site
> (§8). Do the CLAUDE.md visual validation loop on the teacher page before
> handing back.

## 1. Problem

Teacher mode is gated by two random secrets that nobody can remember:

| Today | Where it lives | What it guards | Real secret? |
|---|---|---|---|
| `VITE_TEACHER_TOKEN` (32 hex chars in the URL, `#/teacher/<token>`) | Baked into the public JS bundle; compared in `site/src/components/TeacherMode.tsx:20` | The dashboard (answer key, term pairs, moderation UI) | **No.** It is in the bundle, and the answer key is `site/public/lessons/current.json`, which anyone can fetch. It is a "keep kids from stumbling in" curtain. |
| `MODERATION_KEY` (48 hex chars) | Function App setting; typed once per tab in `site/src/components/HighScoreModeration.tsx` | `DELETE /api/entry/...` | Yes — but worst case is someone deletes Sunday-school leaderboard rows that expire after 6 weeks. |

Users: Nicholas plus 3–4 volunteer teachers, on their own laptops and phones,
and occasionally a shared church laptop that kids also use. The threat model is
a curious 4th-grader. Memorability is the thing to optimise for.

## 2. Design (settled)

**One passphrase, verified by the server, remembered per device on request.**

What a volunteer experiences:

1. Open the site, tap a small **Teacher** link in the landing-page footer
   (or go to `#/teacher` directly — a URL anyone can remember).
2. Type the shared teacher passphrase (a human phrase Nicholas picks, e.g.
   `moses-parts-the-sea`; §9). The field is `type="password"` with
   `autocomplete="current-password"` so phone/laptop password managers offer
   to save it.
3. Optional checkbox **"Remember on this device"**, **unchecked by default**
   (the church laptop is used by kids; a teacher's own phone can opt in).
   Unchecked ⇒ the tab forgets it when closed.
4. The dashboard appears. Removing a high score **no longer prompts for a
   second key** — the passphrase *is* the moderation key.
5. A **Lock** button in the dashboard header clears the stored passphrase
   (for the shared-laptop case) and returns to the passphrase form.

Onboarding a volunteer is then: "go to the site, tap Teacher, the passphrase
is ___". No URL to text around, no second secret, nothing to copy from Azure.

Consequences accepted by Nicholas:

- `VITE_TEACHER_TOKEN` is **deleted everywhere** (bundle, workflow, GitHub
  secret, Playwright, docs). One fewer secret exists.
- The dashboard now needs the API reachable to unlock (it verifies the phrase
  server-side). No offline fallback — Nicholas confirmed offline access is not
  needed. When the API is unreachable the gate says so and offers Retry.
- A memorable phrase is safe because the server already compares it
  timing-safe (`api/src/lib/moderation.ts`) **and** — new in this work — it
  throttles repeated wrong guesses per IP (§3.2).
- Storing the passphrase in `localStorage` when the teacher opts in is fine.
  The old "sessionStorage only, never localStorage" rule in
  `docs/leaderboard-followups-handoff.md` §2 was conservatism for a random
  key that was hard to rotate; the passphrase is easy to rotate (§9) and the
  default stays session-only.

Deliberately **not** doing: QR device-to-device provisioning, passkeys/WebAuthn,
Sign in with Microsoft/Google, TOTP, any hash of the passphrase in the bundle
(that would make the server secret offline-crackable), per-teacher accounts.

## 3. API changes (`api/`)

### 3.1 `GET /api/moderation/check`

New function file `api/src/functions/moderation-check.ts` registering route
`moderation/check`, methods `GET` + `OPTIONS`, `authLevel: 'anonymous'`,
delegating to a new `check` handler in `api/src/lib/handlers.ts` (add it to
the `Handlers` interface; `src/functions/*.ts` only register handlers, see the
header comment of `handlers.ts`).

Behaviour, mirroring `entry` (`handlers.ts:151`):

- `OPTIONS` ⇒ `respond.preflight()`.
- Throttled IP (§3.2) ⇒ `429` with `Retry-After`, body
  `{ error: 'Too many wrong passphrases — try again later' }`.
- `x-moderation-key` header passes `checkModerationKey(provided, deps.moderationKey)`
  ⇒ `respond.empty(204)`.
- Otherwise ⇒ record a failure for the IP and `respond.error(401, 'Unauthorized')`.
  (An unset `MODERATION_KEY` is a 401 too, exactly like `DELETE` today.)

No body, no storage access. CORS needs no change: `x-moderation-key` and `GET`
are already in `api/src/lib/cors.ts` (`ALLOWED_HEADERS`, `ALLOWED_METHODS`) and
in the platform allow-list set by `infra/provision.sh`.

### 3.2 Wrong-passphrase throttle

New module `api/src/lib/auth-throttle.ts` (keep `rate-limit.ts` as is — its
module-level map and 60 s window are tuned for score POSTs; do not share the
map):

- Sliding window **15 minutes**, max **10 failures** per client IP
  (reuse `clientIpFrom` from `rate-limit.ts`). Only **failures** count, so a
  room of teachers using the right phrase never trips it; a NATed classroom
  guessing wrong 10 times in 15 min locks that IP out of `check` and `DELETE`
  for the remainder of the window — acceptable, and the same per-instance
  caveat as the POST limiter applies (`docs/shared-leaderboard.md` §4).
- Exports: `isAuthThrottled(ip, now): { throttled: false } | { throttled: true; retryAfterSeconds }`,
  `recordAuthFailure(ip, now)`, `resetAuthThrottle()` (test hook), and the
  same periodic eviction pattern (`setInterval(...).unref()`).
- Wire into **both** `check` and `entry`: throttle check first, then key
  check, record a failure on 401. Order inside `entry`: throttle → key → param
  validation → delete (unchanged apart from the throttle/record lines).
- Optional app setting `LEADERBOARD_AUTH_FAILURES_PER_15MIN` parsed like
  `resolveRateLimit` (positive integer, else default 10); add to `ApiConfig`
  / `HandlerDeps` / `getConfig()` in `api/src/lib/config.ts`.

### 3.3 Tests (`api/`)

- `auth-throttle.test.ts`: allows up to N failures, blocks the N+1th with a
  sensible `retryAfterSeconds`, window slides, successes do not count,
  different IPs independent, `resetAuthThrottle` clears.
- `handlers.test.ts`: `check` — 204 with the right key, 401 with wrong/missing
  key, 401 when `moderationKey` is undefined, 429 after 10 failures from one
  IP (pin `now` via `deps.now` and the `x-forwarded-for` header as the
  existing rate-limit tests do), OPTIONS preflight, CORS headers present for
  an allowed origin. `entry` — 429 after 10 failures, and that a 401 on
  `check` and a 401 on `entry` share the same failure budget.
- `config.test.ts`: the new setting parses / defaults.
- `cd api && npm test && npm run typecheck && npm run build` green.

### 3.4 Docs

- `api/README.md`: add the `GET /moderation/check` row (204 / 401 / 429) and
  the new app setting; the `MODERATION_KEY` row's description becomes "the
  teacher passphrase — also sent on `GET /moderation/check`".
- `docs/shared-leaderboard.md` §2 (endpoints), §4 (settings), §8 (rewrite —
  see §6 below).

## 4. Client changes (`site/`)

### 4.1 API client — `site/src/lib/leaderboard-api.ts`

Add next to `deleteEntry`:

```ts
/** `GET /moderation/check` — resolves on 204; 401 ⇒ LeaderboardApiError("http", …, 401). */
export async function checkTeacherKey(key: string): Promise<void>
```

Same `send()` transport (3 s timeout, `x-moderation-key` header, body never
read). Like `deleteEntry`, it is **not** re-exported through
`leaderboard-store.ts` — the facade is the never-throws kid API.

### 4.2 Stored passphrase — new `site/src/lib/teacher-session.ts`

Replace the three storage helpers currently inlined in
`HighScoreModeration.tsx` (`readModerationKey` / `writeModerationKey` /
`clearModerationKey`, storage key `church-games:moderation-key`) with one
module:

```ts
export const TEACHER_KEY_STORAGE = "church-games:teacher-key";
export function readTeacherKey(): string | null;            // localStorage first, then sessionStorage
export function saveTeacherKey(key: string, remember: boolean): void; // remember ⇒ localStorage (and clear session), else sessionStorage (and clear local)
export function clearTeacherKey(): void;                     // both
```

Every access wrapped in `try/catch` (private mode / blocked storage ⇒ behave as
"no key"), same as today. Never the URL, never the bundle. No TTL — a
remembered key lives until **Lock** or a `401` (rotation) clears it.

### 4.3 Route + gate

- `site/src/App.tsx`: replace `<Route path="/teacher/:token" …>` with
  `<Route path="/teacher" element={<TeacherMode />} />` and
  `<Route path="/teacher/*" element={<Navigate to="/teacher" replace />} />`
  so old `#/teacher/<token>` bookmarks land on the gate instead of "Access
  Denied". Wrap in `ErrorBoundary` like the other routes.
- `site/src/components/TeacherMode.tsx`: delete the `useParams` /
  `import.meta.env.VITE_TEACHER_TOKEN` gate. Split into:
  - `TeacherGate` (can live in `TeacherMode.tsx` or its own file): owns the
    unlock state machine —
    `"checking" | "locked" | "server-error" | "unlocked"`.
    On mount: `readTeacherKey()`; if present ⇒ `checkTeacherKey` ⇒ `unlocked`
    (204), `locked` + "Passphrase changed — enter it again" (401, and
    `clearTeacherKey()`), `server-error` (anything else, including 404/5xx if
    the API is old, network, timeout — **do not** treat those as a wrong
    passphrase). If absent ⇒ `locked`.
    `locked` renders the form: label **Teacher passphrase**,
    `<input type="password" autocomplete="current-password" autoFocus>`,
    checkbox **Remember on this device** (unchecked), submit **Unlock**;
    trims the input, ignores empty; on 204 `saveTeacherKey(key, remember)`
    ⇒ `unlocked`; 401 ⇒ inline `role="alert"` "Wrong passphrase — try
    again."; 429 ⇒ "Too many tries — wait a few minutes."; other ⇒
    `server-error`. `server-error` renders "Can't reach the leaderboard
    server — check the connection." + **Retry**. `checking` renders the
    existing `.loading` style ("Checking…").
    If `isSharedLeaderboardConfigured()` is false (no `VITE_LEADERBOARD_API`,
    e.g. plain `npm run dev`), render "Teacher mode needs the shared
    leaderboard API — run `npm run dev:shared`" instead of the form.
  - The existing dashboard body (lesson info, moderation section, answer key,
    launch links) unchanged, plus a **Lock** button next to **Presentation
    Mode** in `.teacher-header` that calls `clearTeacherKey()` and returns to
    `locked`.
- `site/src/components/HighScoreModeration.tsx`: remove the key prompt
  entirely — `needKey`, `keyInput`, `submitKey`, the `tm-key-form` JSX and
  `MODERATION_KEY_STORAGE`. `confirmRemove` reads `readTeacherKey()` and calls
  `deleteEntry` directly. On `401`: `clearTeacherKey()` and hand control back
  to the gate (simplest: the gate passes an `onLocked()` callback prop, or
  the moderation section dispatches a custom event the gate listens to —
  pick the prop). 404/other handling unchanged. Delete the now-dead
  `.tm-key-*` CSS in `site/src/index.css` (block starts ~line 2803).
- `site/src/components/Landing.tsx:85`: next to the existing
  `.landing-leaderboard-link`, add a low-emphasis `<a href="#/teacher"
  className="landing-teacher-link">Teacher</a>` (small text, muted colour,
  44 px tap target, not a button). Kids clicking it see a passphrase box —
  harmless.

### 4.4 Remove `VITE_TEACHER_TOKEN`

Delete every reference: `TeacherMode.tsx`, `site/src/vite-env.d.ts:6-7`,
`site/.env.example:3`, `.github/workflows/deploy.yml:46-48`,
`site/playwright.config.ts:14-16`, `site/e2e/leaderboard.spec.ts:27-28` and
the hint at `:800`, `CLAUDE.md:65`, `docs/shared-leaderboard.md` §4/§8,
`docs/leaderboard-followups-handoff.md` (add a one-line "superseded by
teacher-passphrase-handoff.md" note at the top rather than rewriting it).
`git grep -n TEACHER_TOKEN` must return nothing when done. The GitHub secret
itself is deleted by Nicholas (§9).

### 4.5 Tests (`site/`)

- `leaderboard-api.test.ts`: `checkTeacherKey` sends `GET /moderation/check`
  with the header, resolves on 204, rejects `http`/401, `http`/429, network,
  timeout.
- New `teacher-session.test.ts`: read order (local beats session), `remember`
  true/false writes to the right storage and clears the other, `clear` wipes
  both, blocked storage does not throw.
- New `TeacherMode.test.tsx` (or `TeacherGate.test.tsx`): locked by default;
  stored key auto-unlocks on 204; stored key + 401 ⇒ locked with the
  "changed" message and storage cleared; wrong phrase ⇒ alert, nothing
  stored; right phrase + remember ⇒ `localStorage`; right phrase without ⇒
  `sessionStorage`; 429 message; network error ⇒ server-error + Retry
  re-checks; Lock clears storage and shows the form; unconfigured API ⇒ the
  dev hint. Mock `fetch` the way `HighScoreModeration.test.tsx` does.
- `HighScoreModeration.test.tsx`: delete the whole
  `"HighScoreModeration — the moderation key"` describe block (`:235-370`);
  the remaining blocks seed the key via `saveTeacherKey` in `beforeEach`;
  add one test: `401` on delete clears the key and calls `onLocked`.
- `site/e2e/leaderboard.spec.ts`: `mockLeaderboardApi` gains
  `GET /moderation/check` (204 when the header equals
  `MOCK_MODERATION_KEY`, else 401 — and a `checks` log next to the existing
  `deletes` log). Rewrite the teacher test (`:777`) as: go to `/#/teacher` ⇒
  form visible; wrong phrase ⇒ alert; right phrase, remember **unchecked** ⇒
  dashboard, `sessionStorage` has it, `localStorage` does not, URL does not;
  Remove → Yes, remove ⇒ DELETE carries the key with **no** prompt, row gone;
  reload ⇒ still unlocked (session); Lock ⇒ form again, storage empty. One
  more test with remember **checked** ⇒ `localStorage`. Also assert the old
  `/#/teacher/e2e-teacher-token` redirects to `/#/teacher`.
- `site/e2e/leaderboard-live.spec.ts`: add `GET /moderation/check` without a
  key ⇒ 401 (read-only, same style as the DELETE 401 test at `:83`). Do not
  send guesses — the live throttle would count them.
- `cd site && npm run validate` and
  `npx playwright test e2e/leaderboard.spec.ts` green on all three projects;
  full `npm run test:e2e` has no new failures (re-run Phaser flakes in
  isolation before blaming them — see the memory note on load sensitivity).

### 4.6 Visual loop (required by CLAUDE.md)

Build, `npx vite preview --port 4174` (kill any stale preview on 4174
first), and with the Playwright MCP tools walk: landing footer link → gate
(empty submit, wrong phrase alert, 429 copy if you can force it via the
mock, server-error + Retry) → unlocked dashboard → Remove flow with no
prompt → Lock. Desktop 1920 wide and iPhone 12 width. Check: no horizontal
scroll on the phone, the alert is readable on the dark theme, the checkbox
has a 44 px hit area, focus lands in the passphrase field. Fix and repeat
until clean.

## 5. Copy (use verbatim unless it reads badly in the loop)

| Where | Text |
|---|---|
| Gate heading | Teacher Dashboard |
| Field label | Teacher passphrase |
| Checkbox | Remember on this device |
| Submit | Unlock |
| Wrong (401) | Wrong passphrase — try again. |
| Throttled (429) | Too many tries — wait a few minutes and try again. |
| Rotated (stored key now 401) | The passphrase has changed — enter the new one. |
| Server unreachable | Can't reach the leaderboard server — check the connection. |
| Unconfigured (dev) | Teacher mode needs the shared leaderboard API — run `npm run dev:shared`. |
| Header button | Lock |
| Landing footer link | Teacher |

## 6. Docs to update

- `docs/shared-leaderboard.md` §8 "Moderation" — rewrite the phone flow:
  `#/teacher` → passphrase → Remove/Yes, remove; "Remember on this device";
  Lock; rotation = `MODERATION_KEY='new phrase' ./provision.sh` and every
  device re-prompts on its next `check`. Keep the curl fallback. Replace the
  closing paragraph about `VITE_TEACHER_TOKEN` with: the passphrase is the
  only teacher secret, it lives in the Function App setting and in teachers'
  heads/password managers, and it is never in the bundle or the URL.
- `docs/shared-leaderboard.md` §4 — drop the `VITE_TEACHER_TOKEN` row, add
  `LEADERBOARD_AUTH_FAILURES_PER_15MIN`.
- `CLAUDE.md:65` — the moderation sentence becomes: "Teacher dashboard at
  `#/teacher`, unlocked by the teacher passphrase (= `MODERATION_KEY`,
  verified via `GET /api/moderation/check`; stored by
  `lib/teacher-session.ts` in session- or localStorage, never the bundle or
  URL). `components/HighScoreModeration.tsx` → `deleteEntry` in
  `lib/leaderboard-api.ts` — never add either to the facade."
- `api/README.md` — §3.4.
- `infra/provision.sh` — comments only: the generated key is now the "teacher
  passphrase", and the once-only print should suggest rotating it to a
  memorable phrase with `MODERATION_KEY='…' ./provision.sh`. Do not change
  its generate-once behaviour.

## 7. Security notes for the implementer

- The passphrase must never appear in the URL, `site/dist`, git, logs, or
  test fixtures other than the obvious `e2e-moderation-key` /
  `local-dev-moderation-key` dev values.
- The server-side compare stays SHA-256 + `timingSafeEqual`
  (`api/src/lib/moderation.ts`); do not add client-side validation of the
  phrase beyond trim/non-empty.
- The throttle counts failures only, per IP, before touching storage.
- `check` must never leak whether `MODERATION_KEY` is set (401 either way).
- Keep `deleteEntry` and `checkTeacherKey` out of `leaderboard-store.ts`.

## 8. Rollout order

1. Merge and let `deploy-api.yml` ship the API (the `check` route must exist
   before any client that calls it; an old API returns 404, which the gate
   shows as "can't reach the server", not "wrong passphrase").
2. Nicholas rotates the key to the chosen phrase (§9) — can happen before or
   after step 1.
3. Merge the site change; `deploy.yml` builds without `VITE_TEACHER_TOKEN`.
4. Live check: `LEADERBOARD_LIVE_API=https://church-games-api.azurewebsites.net/api npm run test:e2e:live`
   green (now 7 tests); open `#/teacher` on a phone, unlock, remove a test
   entry, lock. Leave the production board clean.
5. Tell the volunteers the URL + phrase.

## 9. Nicholas to-do (outside the code)

1. Pick the passphrase — 3–4 real words, easy to say out loud, e.g.
   `moses-parts-the-sea`. Lower-case with hyphens avoids "was it capitalised?".
2. Set it: `cd infra && MODERATION_KEY='moses-parts-the-sea' ./provision.sh`
   (the script only rotates when the variable is passed explicitly).
3. Delete the now-unused GitHub secret: `gh secret delete VITE_TEACHER_TOKEN`.
4. Save the phrase in your password manager and share it with the 3–4
   volunteers.

## 10. Acceptance checklist

1. `cd api && npm test && npm run typecheck && npm run build` green.
2. `cd site && npm run validate` green; `npx playwright test e2e/leaderboard.spec.ts`
   green ×3 projects; full `npm run test:e2e` no new failures.
3. `git grep -n TEACHER_TOKEN` ⇒ no results; `git grep -n moderation-key`
   only matches API headers/docs, not a storage key.
4. Visual loop (§4.6) clean on desktop and iPhone widths.
5. After a build: `grep -r "local-dev-moderation-key\|e2e-moderation-key" site/dist` ⇒ 0 hits.
6. Live smoke (§8.4) passes; a phone unlocks with the real phrase, removes and
   re-locks; a second device's `#/leaderboard` reflects the removal on
   refresh.
7. Rotating `MODERATION_KEY` makes an already-unlocked, remembered device
   fall back to the gate with the "passphrase has changed" message on its
   next visit.

## 11. Out of scope

- QR provisioning of a new device from an unlocked one (nice v2 if the
  volunteer count grows).
- Per-teacher identity, audit log of who removed what, passkeys, OAuth.
- Session TTLs; the Lock button and rotation are the expiry mechanisms.
- Any change to score submission, retention, or the kid-facing leaderboard.
