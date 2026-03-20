# Church Games

Bible lesson mini-games for K-5th grade kids. Vite + React + TypeScript static site with 8 mini-games, deployed to GitHub Pages.

## Commands

```bash
cd site && npm run dev        # Dev server
cd site && npm run build      # Production build
cd site && npm run test        # Vitest unit tests
cd site && npm run test:e2e    # Playwright e2e tests
cd site && npm run preview     # Preview with draft content
cd site && npm run validate    # Full validation (test + typecheck + build)
```

## Architecture

- **Simple games** (Quiz Showdown, Word Scramble, Jeopardy): Pure React + CSS
- **Complex games** (Bible Brawler, Promised Land, Escape Room, Survivors): Phaser 3 in separate DOM containers
- **Routing**: Hash-based (`/#/games/quiz`) for GitHub Pages compatibility
- **Code splitting**: `React.lazy()` per game route, Phaser in vendor chunk
- **Content**: JSON lesson files in `site/public/lessons/`

## Game Roster

| Route | Game | Type | Description |
|-------|------|------|-------------|
| /games/quiz | Quiz Showdown | React | Timed MC questions, Kahoot-style |
| /games/words | Word Scramble | React | Letter unscramble with hints |
| /games/fortress | Faith Fortress | Phaser | 30-wave tower defense with 6 towers, 7 enemies, 3 bosses, hero abilities |
| /games/rpg | Promised Land | Phaser | Board-game RPG with loot drops and random events |
| /games/escape | Bible Millionaire | Phaser | Temple-building game |
| /games/survivors | Survivors | Phaser | Vampire Survivors-style auto-battler with progressive weapon upgrades |
| /games/jeopardy | Jeopardy | React | Classic 5x5 category board with correct/wrong feedback |
| /games/cards | Scripture Cards | Phaser | Faith-powered card battle game |

## Landing Page

- 2 hero cards: Quiz Showdown (always) + spotlight game (from lesson JSON `spotlightGame`)
- "More Games" row: remaining games in smaller cards
- Only difficulty picker (Little Kids / Big Kids) — no group/individual toggle

## Content Flow

1. Content pipeline (separate repo) generates lesson JSON → `drafts/`
2. Preview with `npm run preview`
3. Approve by copying to both:
   - `site/public/lessons/current.json` (what the games load)
   - `site/public/lessons/archive/{date}.json` (permanent record)
4. Commit and push to deploy

## Key Patterns

- `useLesson` hook loads current.json, falls back to fallback.json
- `useDifficulty` context: "little-kids" (easy) / "big-kids" (medium+hard)
- `QuestionPool` class manages shuffled question consumption without repeats
- Phaser games pass data via `game.registry.set("lesson", lesson)` etc.
- Game logic is pure TS in `logic/` subdirs (no Phaser deps) for testability

## Testing

- **Unit tests**: Vitest + jsdom for game logic and React components
- **E2E tests**: Playwright with device emulation (Desktop, iPhone 12, iPad)
- **Visual testing**: Use Playwright MCP browser tools (see `docs/visual-testing.md`)
- Tests must actually play the games, not just validate schemas
- **Phaser games (especially Survivors)**: Always verify changes with Playwright e2e tests (`cd site && npx playwright test e2e/survivors.spec.ts --project "Desktop Chrome"`). Build first (`npm run build`) since Phaser scenes don't hot-reload. Check the screenshots in `site/e2e/screenshots/` to visually confirm gameplay.

## Visual Validation Loop (Required)

After any significant game changes (new features, UI overhauls, game expansions), you MUST run a Playwright visual playthrough loop:

1. Build the game: `cd site && npm run build`
2. Start preview server: `npx vite preview --port 4174`
3. Use Playwright MCP browser tools to play through the game end-to-end
4. Take screenshots at each phase (menus, gameplay, overlays, feedback screens)
5. Log all issues found (text readability, UI clipping, overlay bleed-through, broken interactions, missing labels)
6. Fix all issues found
7. **Repeat from step 1** until a clean playthrough finds zero issues
8. Run `npm run test && npm run test:e2e` to confirm no regressions

This is not optional — ship no game changes without a clean visual playthrough.

## Known Dev Quirks

- **Phaser HMR**: Vite HMR does NOT update Phaser scene classes in the running game. Scene classes are cached at `new Phaser.Game()` construction time. To see Phaser scene changes during dev, you must do a **production build** (`npm run build`) and use the preview server, or fully reload the page. React component changes (wrappers, CSS) hot-reload fine.
- **Phaser chunk warning**: The Phaser vendor chunk is ~1.5MB. This is expected — it's the full Phaser 3 library. Code-split via `vite.config.ts` manualChunks.
