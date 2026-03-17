# Visual Testing with Playwright MCP

Use the Playwright browser MCP tools to visually test games in the browser. This is the best way to catch UI overlap, layout issues, and verify game flow end-to-end.

## Setup

1. Start the dev server: `cd site && npm run dev`
2. For Phaser scene changes, use the production preview instead:
   ```bash
   cd site && npm run build && npx vite preview --port 4174
   ```
   (Vite HMR does NOT hot-reload Phaser scene classes — see CLAUDE.md)

## Testing Flow

### 1. Navigate to a game
```
browser_navigate → http://localhost:5173/#/games/rpg
```

### 2. Get canvas coordinates for Phaser games
Phaser games render on a `<canvas>` element. You need to map game coordinates to viewport coordinates:

```js
// Get canvas bounding rect
const rect = await page.evaluate(() => {
  const c = document.querySelector('.phaser-container canvas');
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

// Map game coords to viewport coords (game is WxH, e.g. 800x600 or 420x600)
const GAME_W = 420; // check the game's Phaser config
const GAME_H = 600;
const scale = Math.min(rect.w / GAME_W, rect.h / GAME_H);
const ox = rect.x + (rect.w - GAME_W * scale) / 2;
const oy = rect.y + (rect.h - GAME_H * scale) / 2;

function gx(x) { return ox + x * scale; }
function gy(y) { return oy + y * scale; }

// Now click game coordinate (210, 300):
await page.mouse.click(gx(210), gy(300));
```

### 3. React games are easier
React games (Quiz, Word Scramble, Jeopardy) expose DOM elements. Use `browser_snapshot` to get refs, then `browser_click` with refs:

```
browser_snapshot → find ref for "Start" button
browser_click ref=e22 → clicks the Start button
```

### 4. Take screenshots at key states
```
browser_take_screenshot → captures current viewport
```

## Game Dimensions

| Game | Width | Height | Notes |
|------|-------|--------|-------|
| Bible Brawler | 800 | 600 | FIT + CENTER_BOTH |
| Promised Land | 420 | 600 | FIT + CENTER_BOTH |
| Escape Room | dynamic | dynamic | RESIZE mode, fills container |
| Survivors | 800 | 600 | FIT + CENTER_BOTH |

## Playthrough Checklist

For each Phaser game, test these screens:
1. **Character/team select** (if applicable) — verify no text overlap
2. **Main gameplay** — verify HUD elements visible, no clipping
3. **Question overlay** — verify answer buttons clickable, text readable
4. **Correct/wrong feedback** — verify animations play, text visible
5. **Victory/completion screen** — verify stars, score, buttons all visible
6. **Defeat screen** — verify retry/back buttons work
7. **Return to previous screen** — verify navigation works

For React games, use DOM snapshots + clicks:
1. **Intro screen** — title, lesson info, start button
2. **Playing state** — interactive elements work
3. **Feedback** — correct/wrong responses visible
4. **Completion** — final score, stars, play again

## Common Issues Found

- **Text overlap**: Phaser text at y positions too close together, or text extending beyond canvas bounds (y < 0)
- **Button click misses**: Canvas scaling means viewport coords ≠ game coords. Always calculate using the scale/offset formula above.
- **HMR staleness**: Phaser scenes don't hot-reload. Use production build for visual testing of scene changes.
- **Registry persistence**: Phaser game registry data persists across scene transitions within the same game instance. Navigate away and back, or call `this.registry.remove(key)` to reset.
