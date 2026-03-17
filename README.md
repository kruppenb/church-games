# Church Games

Bible lesson mini-games for K-5th grade kids, built with React, Phaser 3, and TypeScript. Each week's games are driven by a lesson JSON file containing questions, vocabulary, and story content tied to the Sunday lesson.

**Live site:** [kruppenb.github.io/church-games](https://kruppenb.github.io/church-games)

## Games

| Game | Description |
|------|-------------|
| **Quiz Showdown** | Kahoot-style timed multiple choice questions |
| **Word Scramble** | Unscramble letters to spell key lesson terms, with progressive hints |
| **Jeopardy** | Classic 5x5 category board with point values and answer feedback |
| **Bible Brawler** | Side-scrolling beat-em-up where correct answers power attacks against doubt monsters |
| **Promised Land** | Board-game RPG with team selection, loot drops, and random events |
| **Escape Room** | Timed puzzle rooms that unlock with correct answers |
| **Survivors** | Vampire Survivors-style auto-battler with progressive weapon upgrades |

All games support two difficulty levels: **Little Kids** (K-2nd) and **Big Kids** (3rd-5th).

## Tech Stack

- **React 19** + **TypeScript** for UI and simple games
- **Phaser 3** for complex animated games (Brawler, Promised Land, Escape Room, Survivors)
- **Vite** for builds and dev server
- **Vitest** + **Playwright** for unit and E2E tests
- **GitHub Pages** for hosting via GitHub Actions

## Getting Started

```bash
cd site
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`. Games load content from `site/public/lessons/current.json` (falls back to `fallback.json` if missing).

## Content

Lesson content is a JSON file containing questions, term pairs, key words, and story scenes. See `site/public/lessons/fallback.json` for the schema. To update the weekly lesson:

1. Place the new lesson JSON in `site/public/lessons/current.json`
2. Commit and push to deploy

## Scripts

```bash
npm run dev        # Dev server
npm run build      # Production build (includes type checking)
npm run test       # Unit tests
npm run test:e2e   # Playwright E2E tests
npm run validate   # Full validation (tests + typecheck + build)
```

## License

[MIT](LICENSE)
