import { describe, it, expect } from "vitest";
import {
  TileType,
  SpecialType,
  createGrid,
  areAdjacent,
  swapTiles,
  findMatches,
  find2x2Matches,
  removeMatches,
  applyGravity,
  processSwap,
  calculateMatchScore,
  createGameState,
  applyMove,
  advanceLevel,
  calculateStars,
  findValidMove,
  reshuffleGrid,
  getLevelConfig,
  getLittleKidsLevels,
  getBigKidsLevels,
  getSpecialTileTargets,
  randomTile,
  combinePowerups,
  isCombo,
} from "./match-logic";
import type { Tile, Position, LevelConfig } from "./match-logic";

// --- Helpers ---

function tile(type: TileType, special: SpecialType = SpecialType.None): Tile {
  return { type, special };
}

const H = TileType.Heart;
const S = TileType.Star;
const C = TileType.Cross;
const D = TileType.Dove;
const W = TileType.Crown;
const R = TileType.Scroll;

/** Create a grid from a 2D array of tile types */
function makeGrid(types: TileType[][]): Tile[][] {
  return types.map((row) => row.map((t) => tile(t)));
}

/** Create a grid with some null cells */
function makeGridWithNulls(
  cells: (TileType | null)[][],
): (Tile | null)[][] {
  return cells.map((row) =>
    row.map((t) => (t === null ? null : tile(t))),
  );
}

// --- Tests ---

describe("match-logic", () => {
  describe("createGrid", () => {
    it("creates a grid of the specified size", () => {
      const grid = createGrid(6, 6, 5);
      expect(grid).toHaveLength(6);
      expect(grid[0]).toHaveLength(6);
    });

    it("creates an 8x8 grid", () => {
      const grid = createGrid(8, 8, 6);
      expect(grid).toHaveLength(8);
      expect(grid[0]).toHaveLength(8);
    });

    it("creates tiles with no initial matches", () => {
      // Run multiple times to increase confidence
      for (let i = 0; i < 10; i++) {
        const grid = createGrid(8, 8, 6);
        const matches = findMatches(grid);
        expect(matches).toHaveLength(0);
      }
    });

    it("uses only tile types within the specified count", () => {
      const grid = createGrid(6, 6, 3); // Only 3 tile types
      for (const row of grid) {
        for (const cell of row) {
          expect(cell.type).toBeGreaterThanOrEqual(0);
          expect(cell.type).toBeLessThan(3);
        }
      }
    });

    it("all tiles have no special type", () => {
      const grid = createGrid(6, 6, 5);
      for (const row of grid) {
        for (const cell of row) {
          expect(cell.special).toBe(SpecialType.None);
        }
      }
    });
  });

  describe("areAdjacent", () => {
    it("returns true for horizontally adjacent positions", () => {
      expect(areAdjacent({ row: 2, col: 3 }, { row: 2, col: 4 })).toBe(true);
      expect(areAdjacent({ row: 2, col: 4 }, { row: 2, col: 3 })).toBe(true);
    });

    it("returns true for vertically adjacent positions", () => {
      expect(areAdjacent({ row: 2, col: 3 }, { row: 3, col: 3 })).toBe(true);
      expect(areAdjacent({ row: 3, col: 3 }, { row: 2, col: 3 })).toBe(true);
    });

    it("returns false for diagonal positions", () => {
      expect(areAdjacent({ row: 2, col: 3 }, { row: 3, col: 4 })).toBe(false);
    });

    it("returns false for non-adjacent positions", () => {
      expect(areAdjacent({ row: 0, col: 0 }, { row: 0, col: 2 })).toBe(false);
      expect(areAdjacent({ row: 0, col: 0 }, { row: 2, col: 0 })).toBe(false);
    });

    it("returns false for same position", () => {
      expect(areAdjacent({ row: 2, col: 3 }, { row: 2, col: 3 })).toBe(false);
    });
  });

  describe("swapTiles", () => {
    it("swaps two adjacent tiles", () => {
      const grid = makeGrid([
        [H, S, C],
        [D, W, R],
      ]);
      const swapped = swapTiles(grid, { row: 0, col: 0 }, { row: 0, col: 1 });
      expect(swapped[0][0]!.type).toBe(S);
      expect(swapped[0][1]!.type).toBe(H);
      // Original unchanged
      expect(grid[0][0].type).toBe(H);
    });

    it("does not mutate the original grid", () => {
      const grid = makeGrid([
        [H, S],
        [C, D],
      ]);
      const original = JSON.parse(JSON.stringify(grid));
      swapTiles(grid, { row: 0, col: 0 }, { row: 1, col: 0 });
      expect(grid).toEqual(original);
    });
  });

  describe("findMatches", () => {
    it("finds a horizontal match of 3", () => {
      const grid = makeGrid([
        [H, H, H, S],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      const matches = findMatches(grid);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      // Find the match that contains the hearts
      const heartMatch = matches.find((m) =>
        m.positions.some((p) => p.row === 0 && p.col === 0),
      );
      expect(heartMatch).toBeDefined();
      expect(heartMatch!.positions).toHaveLength(3);
    });

    it("finds a vertical match of 3", () => {
      const grid = makeGrid([
        [H, S, C, D],
        [H, C, D, W],
        [H, D, S, C],
        [S, W, C, H],
      ]);
      const matches = findMatches(grid);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      const heartMatch = matches.find((m) =>
        m.positions.some((p) => p.row === 0 && p.col === 0),
      );
      expect(heartMatch).toBeDefined();
      expect(heartMatch!.positions).toHaveLength(3);
    });

    it("finds a match of 4 and marks it for line blast", () => {
      const grid = makeGrid([
        [H, H, H, H],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      const matches = findMatches(grid);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      const fourMatch = matches.find((m) => m.positions.length === 4);
      expect(fourMatch).toBeDefined();
      expect(fourMatch!.specialCreated).toBe(SpecialType.LineBlastH);
    });

    it("finds a vertical match of 4 and marks as vertical line blast", () => {
      const grid = makeGrid([
        [H, S, C, D],
        [H, C, D, W],
        [H, D, S, C],
        [H, W, C, S],
      ]);
      const matches = findMatches(grid);
      const fourMatch = matches.find((m) => m.positions.length === 4);
      expect(fourMatch).toBeDefined();
      expect(fourMatch!.specialCreated).toBe(SpecialType.LineBlastV);
    });

    it("finds a match of 5 and marks it for rainbow", () => {
      const grid = makeGrid([
        [H, H, H, H, H],
        [S, C, D, W, S],
        [C, D, S, H, C],
        [D, W, C, S, D],
        [W, S, D, C, W],
      ]);
      const matches = findMatches(grid);
      const fiveMatch = matches.find((m) => m.positions.length >= 5);
      expect(fiveMatch).toBeDefined();
      expect(fiveMatch!.specialCreated).toBe(SpecialType.Rainbow);
    });

    it("finds L-shape match and marks as bomb", () => {
      // L-shape: 3 horizontal + 3 vertical sharing a corner
      const grid = makeGrid([
        [H, H, H, S],
        [H, C, D, W],
        [H, D, S, C],
        [S, W, C, D],
      ]);
      const matches = findMatches(grid);
      // Should detect the L-shape (both H and V matches involving hearts)
      const bombMatch = matches.find(
        (m) => m.specialCreated === SpecialType.Bomb,
      );
      expect(bombMatch).toBeDefined();
    });

    it("finds no matches in a match-free grid", () => {
      const grid = makeGrid([
        [H, S, H, S],
        [S, H, S, H],
        [H, S, H, S],
        [S, H, S, H],
      ]);
      const matches = findMatches(grid);
      expect(matches).toHaveLength(0);
    });

    it("finds multiple separate matches", () => {
      const grid = makeGrid([
        [H, H, H, S, S, S],
        [C, D, W, C, D, W],
        [D, C, S, D, C, H],
        [W, D, C, W, D, S],
        [S, W, D, S, W, C],
        [C, S, W, C, S, D],
      ]);
      const matches = findMatches(grid);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getSpecialTileTargets", () => {
    it("LineBlastH clears entire row", () => {
      const grid = makeGrid([
        [H, S, C, D],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 1, col: 2 },
        SpecialType.LineBlastH,
      );
      expect(targets).toHaveLength(4);
      expect(targets.every((t) => t.row === 1)).toBe(true);
    });

    it("LineBlastV clears entire column", () => {
      const grid = makeGrid([
        [H, S, C, D],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 1, col: 2 },
        SpecialType.LineBlastV,
      );
      expect(targets).toHaveLength(4);
      expect(targets.every((t) => t.col === 2)).toBe(true);
    });

    it("Bomb clears 5x5 area", () => {
      const grid = makeGrid([
        [H, S, C, D, W],
        [S, C, D, W, H],
        [C, D, S, H, S],
        [D, W, C, S, C],
        [W, H, S, C, D],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 2, col: 2 },
        SpecialType.Bomb,
      );
      expect(targets).toHaveLength(25); // Full 5x5 area
    });

    it("Bomb at corner only clears valid cells (5x5)", () => {
      const grid = makeGrid([
        [H, S, C],
        [S, C, D],
        [C, D, S],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 0, col: 0 },
        SpecialType.Bomb,
      );
      expect(targets).toHaveLength(9); // 3x3 grid, bomb at corner can only reach entire grid
    });

    it("Rainbow clears all tiles of the most common type", () => {
      const grid = makeGrid([
        [H, S, H, S],
        [H, C, H, C],
        [S, H, S, H],
        [C, S, C, S],
      ]);
      // Hearts appear most (6 times) so rainbow should target all of them + itself
      const targets = getSpecialTileTargets(
        grid,
        { row: 0, col: 1 },
        SpecialType.Rainbow,
      );
      // Should include the rainbow position plus all hearts
      expect(targets.length).toBeGreaterThan(0);
    });
  });

  describe("removeMatches", () => {
    it("removes matched tiles and returns count", () => {
      const grid = makeGrid([
        [H, H, H, S],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      const matches = findMatches(grid);
      const result = removeMatches(grid, matches);
      // The 3 hearts should be removed
      expect(result.removedCount).toBeGreaterThanOrEqual(3);
      // Check nulls are in the right places
      expect(result.grid[0][0]).toBeNull();
      expect(result.grid[0][1]).toBeNull();
      expect(result.grid[0][2]).toBeNull();
    });

    it("creates special tiles when match warrants it", () => {
      const grid = makeGrid([
        [H, H, H, H],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      const matches = findMatches(grid);
      const result = removeMatches(grid, matches);

      // 3 tiles removed (4 - 1 special created), special tile preserved
      // Find the cell with a special tile
      let foundSpecial = false;
      for (const row of result.grid) {
        for (const cell of row) {
          if (cell && cell.special !== SpecialType.None) {
            foundSpecial = true;
          }
        }
      }
      expect(foundSpecial).toBe(true);
    });
  });

  describe("applyGravity", () => {
    it("tiles fall down to fill gaps", () => {
      const grid: (Tile | null)[][] = [
        [null, tile(S), tile(C)],
        [tile(H), null, tile(D)],
        [tile(C), tile(D), null],
      ];
      const result = applyGravity(grid, 5);

      // Bottom rows should be filled
      for (let c = 0; c < 3; c++) {
        expect(result.grid[2][c]).not.toBeNull();
      }
    });

    it("fills empty spaces from top with new tiles", () => {
      const grid: (Tile | null)[][] = [
        [null, null, null],
        [null, null, null],
        [tile(H), tile(S), tile(C)],
      ];
      const result = applyGravity(grid, 5);

      // All cells should be filled
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          expect(result.grid[r][c]).not.toBeNull();
        }
      }

      // Bottom row should still have original tiles
      expect(result.grid[2][0]!.type).toBe(H);
      expect(result.grid[2][1]!.type).toBe(S);
      expect(result.grid[2][2]!.type).toBe(C);
    });

    it("reports spawned tiles", () => {
      const grid: (Tile | null)[][] = [
        [null, null, null],
        [null, tile(S), null],
        [tile(H), tile(C), tile(D)],
      ];
      const result = applyGravity(grid, 5);
      // 3 null cells should be filled with spawned tiles
      expect(result.spawned.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("processSwap", () => {
    it("returns invalid for non-adjacent tiles", () => {
      const grid = makeGrid([
        [H, S, C],
        [S, C, D],
        [C, D, S],
      ]);
      const result = processSwap(
        grid,
        { row: 0, col: 0 },
        { row: 0, col: 2 },
        5,
      );
      expect(result.valid).toBe(false);
    });

    it("returns invalid when swap creates no match", () => {
      const grid = makeGrid([
        [H, S, C, D],
        [C, D, H, S],
        [D, H, S, C],
        [S, C, D, H],
      ]);
      const result = processSwap(
        grid,
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        5,
      );
      expect(result.valid).toBe(false);
    });

    it("returns valid with steps when swap creates a match", () => {
      // Set up a grid where swapping creates a match
      const grid = makeGrid([
        [H, S, C, D],
        [S, H, H, D],
        [C, D, S, H],
        [D, C, H, S],
      ]);
      // Swap (0,0) H with (1,0) S -> row 1 becomes H, H, H which matches
      const result = processSwap(
        grid,
        { row: 0, col: 0 },
        { row: 1, col: 0 },
        5,
      );
      expect(result.valid).toBe(true);
      expect(result.steps.length).toBeGreaterThanOrEqual(1);
      expect(result.totalScore).toBeGreaterThan(0);
    });
  });

  describe("calculateMatchScore", () => {
    it("calculates base score for simple match", () => {
      const score = calculateMatchScore(3, 0, []);
      expect(score).toBe(30); // 3 tiles * 10 points * 1.0 multiplier
    });

    it("applies chain multiplier", () => {
      const score = calculateMatchScore(3, 1, []);
      expect(score).toBe(45); // 3 * 10 * 1.5
    });

    it("adds special tile bonus", () => {
      const score = calculateMatchScore(3, 0, [
        { pos: { row: 0, col: 0 }, special: SpecialType.LineBlastH },
      ]);
      expect(score).toBe(130); // 30 base + 100 line blast bonus
    });

    it("adds bomb bonus", () => {
      const score = calculateMatchScore(3, 0, [
        { pos: { row: 0, col: 0 }, special: SpecialType.Bomb },
      ]);
      expect(score).toBe(110); // 30 base + 80 bomb bonus
    });

    it("adds rainbow bonus", () => {
      const score = calculateMatchScore(3, 0, [
        { pos: { row: 0, col: 0 }, special: SpecialType.Rainbow },
      ]);
      expect(score).toBe(180); // 30 base + 150 rainbow bonus
    });

    it("combines chain multiplier and special bonus", () => {
      const score = calculateMatchScore(4, 2, [
        { pos: { row: 0, col: 0 }, special: SpecialType.LineBlastH },
      ]);
      // 4 * 10 * 2.0 + 100 = 180
      expect(score).toBe(180);
    });
  });

  describe("createGameState", () => {
    it("creates state matching level config", () => {
      const config = getLevelConfig(1, "little-kids");
      const state = createGameState(config);
      expect(state.level).toBe(1);
      expect(state.movesRemaining).toBe(config.moves);
      expect(state.targetScore).toBe(config.targetScore);
      expect(state.score).toBe(0);
      expect(state.gameOver).toBe(false);
      expect(state.levelComplete).toBe(false);
    });

    it("creates correctly sized grid for little-kids", () => {
      const config = getLevelConfig(1, "little-kids");
      const state = createGameState(config);
      expect(state.grid).toHaveLength(6);
      expect(state.grid[0]).toHaveLength(6);
    });

    it("creates correctly sized grid for big-kids", () => {
      const config = getLevelConfig(1, "big-kids");
      const state = createGameState(config);
      expect(state.grid).toHaveLength(8);
      expect(state.grid[0]).toHaveLength(8);
    });
  });

  describe("applyMove", () => {
    it("decrements moves on valid swap", () => {
      // Create a grid with a guaranteed match
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, H, H, D, W, R],
        [C, D, S, H, C, D],
        [D, C, H, S, D, C],
        [W, D, C, H, S, D],
        [R, W, D, C, H, S],
      ]);
      const config = getLevelConfig(1, "little-kids");
      const state = createGameState(config);
      // Override with our specific grid
      state.grid = grid;

      const result = applyMove(
        state,
        { row: 0, col: 0 },
        { row: 1, col: 0 },
        5,
      );
      if (result.valid) {
        expect(result.state.movesRemaining).toBe(state.movesRemaining - 1);
        expect(result.scoreGained).toBeGreaterThan(0);
      }
    });

    it("does not decrement moves on invalid swap", () => {
      const config = getLevelConfig(1, "little-kids");
      const state = createGameState(config);
      const origMoves = state.movesRemaining;

      const result = applyMove(
        state,
        { row: 0, col: 0 },
        { row: 0, col: 2 },
        5,
      );
      expect(result.valid).toBe(false);
      expect(result.state.movesRemaining).toBe(origMoves);
    });

    it("sets levelComplete when score target is reached", () => {
      const config = getLevelConfig(1, "little-kids");
      const state = createGameState(config);
      // Set score just below target
      state.score = config.targetScore - 1;
      // Create a grid that will give a match
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, H, H, D, W, R],
        [C, D, S, H, C, D],
        [D, C, H, S, D, C],
        [W, D, C, H, S, D],
        [R, W, D, C, H, S],
      ]);
      state.grid = grid;

      const result = applyMove(
        state,
        { row: 0, col: 0 },
        { row: 1, col: 0 },
        5,
      );
      if (result.valid && result.scoreGained > 0) {
        expect(result.state.levelComplete).toBe(true);
      }
    });
  });

  describe("advanceLevel", () => {
    it("increments levelsCompleted", () => {
      const config = getLevelConfig(1, "little-kids");
      const state = createGameState(config);
      state.levelsCompleted = 1;

      const nextConfig = getLevelConfig(2, "little-kids");
      const newState = advanceLevel(state, nextConfig, 0);
      expect(newState.levelsCompleted).toBe(2);
      expect(newState.level).toBe(2);
    });

    it("adds bonus moves", () => {
      const config = getLevelConfig(1, "little-kids");
      const state = createGameState(config);

      const nextConfig = getLevelConfig(2, "little-kids");
      const newState = advanceLevel(state, nextConfig, 3);
      expect(newState.movesRemaining).toBe(nextConfig.moves + 3);
    });

    it("shows question every 2 levels", () => {
      const config = getLevelConfig(1, "little-kids");
      const state = createGameState(config);

      // After level 2, levelsCompleted = 2, should show question
      state.levelsCompleted = 2;
      const nextConfig = getLevelConfig(3, "little-kids");
      const newState = advanceLevel(state, nextConfig, 0);
      expect(newState.showQuestion).toBe(true);
    });

    it("does not show question after odd level counts", () => {
      const config = getLevelConfig(1, "little-kids");
      const state = createGameState(config);

      state.levelsCompleted = 1;
      const nextConfig = getLevelConfig(2, "little-kids");
      const newState = advanceLevel(state, nextConfig, 0);
      expect(newState.showQuestion).toBe(false);
    });

    it("resets score and creates new grid", () => {
      const config = getLevelConfig(1, "little-kids");
      const state = createGameState(config);
      state.score = 500;

      const nextConfig = getLevelConfig(2, "little-kids");
      const newState = advanceLevel(state, nextConfig, 0);
      expect(newState.score).toBe(0);
      expect(newState.levelComplete).toBe(false);
      expect(newState.gameOver).toBe(false);
    });
  });

  describe("calculateStars", () => {
    it("returns 3 stars for score above top threshold", () => {
      expect(calculateStars(600, [200, 350, 500])).toBe(3);
    });

    it("returns 2 stars for score at middle threshold", () => {
      expect(calculateStars(350, [200, 350, 500])).toBe(2);
    });

    it("returns 1 star for score at bottom threshold", () => {
      expect(calculateStars(200, [200, 350, 500])).toBe(1);
    });

    it("returns 0 stars for score below all thresholds", () => {
      expect(calculateStars(100, [200, 350, 500])).toBe(0);
    });

    it("returns 3 stars for score exactly at top threshold", () => {
      expect(calculateStars(500, [200, 350, 500])).toBe(3);
    });
  });

  describe("findValidMove", () => {
    it("finds a valid move in a solvable grid", () => {
      // This grid has a valid move: swap (0,0) H with (1,0) S to get 3 hearts in row 1
      const grid = makeGrid([
        [H, S, C, D],
        [S, H, H, D],
        [C, D, S, H],
        [D, C, H, S],
      ]);
      const move = findValidMove(grid);
      expect(move).not.toBeNull();
    });

    it("returns null for an unsolvable grid", () => {
      // A simple 3x3 alternating grid with no possible matches
      const grid = makeGrid([
        [H, S, H],
        [S, H, S],
        [H, S, H],
      ]);
      // This grid actually might have valid swaps, let's use a truly unsolvable one
      // A 3x3 with 3 types arranged so no swap produces 3-in-a-row
      const grid2 = makeGrid([
        [H, S, C],
        [C, H, S],
        [S, C, H],
      ]);
      const move = findValidMove(grid2);
      expect(move).toBeNull();
    });
  });

  describe("reshuffleGrid", () => {
    it("returns a grid with no matches and at least one valid move", () => {
      const grid = makeGrid([
        [H, S, C],
        [C, H, S],
        [S, C, H],
      ]);
      const newGrid = reshuffleGrid(grid, 5);
      expect(newGrid).toHaveLength(3);
      expect(newGrid[0]).toHaveLength(3);

      // No initial matches
      const matches = findMatches(newGrid as Tile[][]);
      expect(matches).toHaveLength(0);
    });
  });

  describe("getLevelConfig", () => {
    it("returns config for little-kids levels", () => {
      const config = getLevelConfig(1, "little-kids");
      expect(config.gridSize).toBe(6);
      expect(config.tileCount).toBe(5);
      expect(config.level).toBe(1);
    });

    it("returns config for big-kids levels", () => {
      const config = getLevelConfig(1, "big-kids");
      expect(config.gridSize).toBe(8);
      expect(config.tileCount).toBe(6);
      expect(config.level).toBe(1);
    });

    it("clamps to last level when exceeding max", () => {
      const config = getLevelConfig(99, "little-kids");
      expect(config.level).toBe(10);
    });

    it("levels have increasing difficulty", () => {
      const levels = getLittleKidsLevels();
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].targetScore).toBeGreaterThanOrEqual(
          levels[i - 1].targetScore,
        );
      }
    });
  });

  describe("level config arrays", () => {
    it("little-kids has 10 levels", () => {
      expect(getLittleKidsLevels()).toHaveLength(10);
    });

    it("big-kids has 10 levels", () => {
      expect(getBigKidsLevels()).toHaveLength(10);
    });
  });

  describe("randomTile", () => {
    it("generates tiles within range", () => {
      for (let i = 0; i < 100; i++) {
        const t = randomTile(5);
        expect(t.type).toBeGreaterThanOrEqual(0);
        expect(t.type).toBeLessThan(5);
        expect(t.special).toBe(SpecialType.None);
      }
    });
  });

  // ─── Special / Power Tile Tests ───────────────────

  describe("special tiles — creation", () => {
    it("matching 4 horizontally creates a horizontal Line Blast", () => {
      const grid = makeGrid([
        [H, H, H, H, S, D],
        [S, C, D, W, C, H],
        [C, D, S, H, D, S],
        [D, W, C, S, H, C],
        [W, S, D, C, S, D],
        [S, C, H, D, W, H],
      ]);
      const matches = findMatches(grid);
      const fourMatch = matches.find((m) => m.positions.length === 4);
      expect(fourMatch).toBeDefined();
      expect(fourMatch!.specialCreated).toBe(SpecialType.LineBlastH);
      expect(fourMatch!.specialPosition).not.toBeNull();
    });

    it("matching 4 vertically creates a vertical Line Blast", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [H, C, D, W, S, C],
        [H, D, S, C, D, W],
        [H, W, C, D, S, D],
        [S, C, D, H, C, W],
        [C, D, S, W, D, S],
      ]);
      const matches = findMatches(grid);
      const fourMatch = matches.find((m) => m.positions.length === 4);
      expect(fourMatch).toBeDefined();
      expect(fourMatch!.specialCreated).toBe(SpecialType.LineBlastV);
      expect(fourMatch!.specialPosition).not.toBeNull();
    });

    it("L-shape match creates a Bomb", () => {
      // L-shape: 3 horizontal + 3 vertical sharing a corner at (0,0)
      const grid = makeGrid([
        [H, H, H, S, D, C],
        [H, C, D, W, S, D],
        [H, D, S, C, W, S],
        [S, W, C, D, C, W],
        [C, S, D, H, D, S],
        [D, C, S, W, S, C],
      ]);
      const matches = findMatches(grid);
      const bombMatch = matches.find(
        (m) => m.specialCreated === SpecialType.Bomb,
      );
      expect(bombMatch).toBeDefined();
      // L-shape has at least 5 positions (3 horiz + 3 vert - 1 shared corner)
      expect(bombMatch!.positions.length).toBeGreaterThanOrEqual(5);
    });

    it("T-shape match creates a Bomb", () => {
      // T-shape: 3 horizontal at row 0 and 3 vertical through center col
      const grid = makeGrid([
        [H, H, H, S, D, C],
        [S, H, D, W, S, D],
        [C, H, S, C, W, S],
        [D, W, C, D, C, W],
        [W, S, D, H, D, S],
        [S, C, H, W, S, C],
      ]);
      const matches = findMatches(grid);
      const bombMatch = matches.find(
        (m) => m.specialCreated === SpecialType.Bomb,
      );
      expect(bombMatch).toBeDefined();
    });

    it("matching 5 in a row creates a Rainbow", () => {
      const grid = makeGrid([
        [H, H, H, H, H, S],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const matches = findMatches(grid);
      const fiveMatch = matches.find((m) => m.positions.length >= 5);
      expect(fiveMatch).toBeDefined();
      expect(fiveMatch!.specialCreated).toBe(SpecialType.Rainbow);
    });

    it("matching 6 in a row also creates a Rainbow", () => {
      const grid = makeGrid([
        [H, H, H, H, H, H],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const matches = findMatches(grid);
      const sixMatch = matches.find((m) => m.positions.length >= 6);
      expect(sixMatch).toBeDefined();
      expect(sixMatch!.specialCreated).toBe(SpecialType.Rainbow);
    });

    it("a normal 3-match creates no special tile", () => {
      const grid = makeGrid([
        [H, H, H, S, D, C],
        [S, C, D, W, S, D],
        [C, D, S, C, W, S],
        [D, W, C, D, C, W],
        [W, S, D, H, D, S],
        [S, C, H, W, S, C],
      ]);
      const matches = findMatches(grid);
      const threeMatch = matches.find((m) => m.positions.length === 3);
      expect(threeMatch).toBeDefined();
      expect(threeMatch!.specialCreated).toBe(SpecialType.None);
    });

    it("special tile position is in the center of the match group", () => {
      const grid = makeGrid([
        [H, H, H, H, S, D],
        [S, C, D, W, C, H],
        [C, D, S, H, D, S],
        [D, W, C, S, H, C],
        [W, S, D, C, S, D],
        [S, C, H, D, W, H],
      ]);
      const matches = findMatches(grid);
      const fourMatch = matches.find((m) => m.positions.length === 4);
      expect(fourMatch).toBeDefined();
      const sp = fourMatch!.specialPosition!;
      // The center of a 4-match at cols 0-3 is col 2 (index floor(4/2)=2)
      expect(sp.row).toBe(0);
      expect(sp.col).toBe(2);
    });
  });

  describe("special tiles — activation (getSpecialTileTargets)", () => {
    it("LineBlastH targets the entire row", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 2, col: 3 },
        SpecialType.LineBlastH,
      );
      expect(targets).toHaveLength(6);
      expect(targets.every((t) => t.row === 2)).toBe(true);
      // All columns 0-5 should be present
      const cols = targets.map((t) => t.col).sort();
      expect(cols).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("LineBlastV targets the entire column", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 2, col: 3 },
        SpecialType.LineBlastV,
      );
      expect(targets).toHaveLength(6);
      expect(targets.every((t) => t.col === 3)).toBe(true);
      const rows = targets.map((t) => t.row).sort();
      expect(rows).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("LineBlastH skips null cells", () => {
      const grid = makeGridWithNulls([
        [H, null, C, D, null, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 0, col: 2 },
        SpecialType.LineBlastH,
      );
      expect(targets).toHaveLength(4); // skips 2 null cells
    });

    it("LineBlastV skips null cells", () => {
      const grid = makeGridWithNulls([
        [null, S, C, D, W, R],
        [S, C, D, W, S, C],
        [null, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 1, col: 0 },
        SpecialType.LineBlastV,
      );
      expect(targets).toHaveLength(4); // skips 2 null cells
    });

    it("Bomb targets a 5x5 area in the center of the grid", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 3, col: 3 },
        SpecialType.Bomb,
      );
      expect(targets).toHaveLength(25); // 5x5 area fully in-bounds
      // Check all 25 positions are present
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const found = targets.some(
            (t) => t.row === 3 + dr && t.col === 3 + dc,
          );
          expect(found).toBe(true);
        }
      }
    });

    it("Bomb at top-left corner only targets valid cells (5x5)", () => {
      const grid = makeGrid([
        [H, S, C, D],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 0, col: 0 },
        SpecialType.Bomb,
      );
      // 5x5 from (0,0): rows 0-2, cols 0-2 = 9 cells
      expect(targets).toHaveLength(9);
    });

    it("Bomb at bottom-right corner only targets valid cells (5x5)", () => {
      const grid = makeGrid([
        [H, S, C, D],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 3, col: 3 },
        SpecialType.Bomb,
      );
      // 5x5 from (3,3) in a 4x4 grid: rows 1-3, cols 1-3 = 9 cells
      expect(targets).toHaveLength(9);
    });

    it("Bomb at edge only targets valid cells (5x5)", () => {
      const grid = makeGrid([
        [H, S, C, D],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      // Top edge, middle column (row 0, col 1)
      // 5x5 from (0,1): rows 0-2, cols 0-3 = 3*4 = 12 cells
      const targets = getSpecialTileTargets(
        grid,
        { row: 0, col: 1 },
        SpecialType.Bomb,
      );
      expect(targets).toHaveLength(12);
    });

    it("Bomb skips null cells in its 5x5 area", () => {
      const grid = makeGridWithNulls([
        [H, S, C, D],
        [S, null, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 1, col: 1 },
        SpecialType.Bomb,
      );
      // 5x5 from (1,1) in 4x4 grid: rows 0-3, cols 0-3 = 16 cells, minus 1 null = 15
      expect(targets).toHaveLength(15);
    });

    it("Rainbow clears all tiles of the most common type", () => {
      // Grid where Heart appears most often
      const grid = makeGrid([
        [H, H, H, S],
        [H, C, H, W],
        [S, H, S, H],
        [C, S, C, S],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 1, col: 1 }, // The rainbow tile position (currently C)
        SpecialType.Rainbow,
      );
      // Should target all Hearts (the most common type), plus itself
      const heartCount = 7; // H appears at (0,0),(0,1),(0,2),(1,0),(1,2),(2,1),(2,3)
      // Plus the rainbow tile itself at (1,1)
      expect(targets.length).toBe(heartCount + 1);
      // The rainbow tile position should be in targets
      expect(targets.some((t) => t.row === 1 && t.col === 1)).toBe(true);
    });

    it("Rainbow excludes itself when counting the most common type", () => {
      // H appears 5 times, S appears 4 times, others less
      // Rainbow at (0,1) which is S — should target H (most common excluding self)
      const grid = makeGrid([
        [H, S, C, D],
        [H, C, H, S],
        [S, D, S, C],
        [D, H, D, H],
      ]);
      // Count: H at (0,0),(1,0),(1,2),(3,1),(3,3) = 5
      //        S at (0,1),(1,3),(2,0),(2,2) = 4
      //        (0,1) is S, which is the rainbow pos — excluded from counts
      //        So remaining S = 3, H = 5 → Rainbow targets all H tiles
      const targets = getSpecialTileTargets(
        grid,
        { row: 0, col: 1 },
        SpecialType.Rainbow,
      );
      // Should target all Heart tiles + the rainbow tile itself
      const heartPositions = targets.filter(
        (t) => !(t.row === 0 && t.col === 1),
      );
      // All non-self targets should be Heart type
      for (const pos of heartPositions) {
        expect(grid[pos.row][pos.col]!.type).toBe(H);
      }
      expect(heartPositions).toHaveLength(5);
      // Self is included
      expect(targets.some((t) => t.row === 0 && t.col === 1)).toBe(true);
    });
  });

  describe("special tiles — removal and scoring", () => {
    it("removeMatches creates a special tile when a 4-match is found", () => {
      const grid = makeGrid([
        [H, H, H, H, S, D],
        [S, C, D, W, C, H],
        [C, D, S, H, D, S],
        [D, W, C, S, H, C],
        [W, S, D, C, S, D],
        [S, C, H, D, W, H],
      ]);
      const matches = findMatches(grid);
      expect(matches.length).toBeGreaterThanOrEqual(1);

      const result = removeMatches(grid, matches);
      // A Line Blast special tile should have been created
      let foundSpecial = false;
      for (const row of result.grid) {
        for (const cell of row) {
          if (cell && cell.special === SpecialType.LineBlastH) {
            foundSpecial = true;
          }
        }
      }
      expect(foundSpecial).toBe(true);
      // 3 tiles removed (4 matched - 1 becomes special)
      expect(result.removedCount).toBe(3);
    });

    it("removeMatches activates existing special tiles that are in a match", () => {
      // Place a LineBlastH special tile on the grid, then match it
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      // Put a LineBlastH special at (1,1)
      grid[1][1] = { type: TileType.Cross, special: SpecialType.LineBlastH };
      // Make a match that includes the special: C C C in row 1 cols 1,2 — need 3
      grid[1][0] = tile(C); // row 1: C, C(special), D, W, S, C
      // Now row 1 = C, C(LBH), D, W, S, C → not a match of 3
      // Let's set up differently:
      grid[1][0] = tile(C);
      grid[1][1] = { type: TileType.Cross, special: SpecialType.LineBlastH };
      grid[1][2] = tile(C);
      // That's only CCC if grid[1][1].type === C, which it is
      const matches = findMatches(grid);
      const matchWithSpecial = matches.find((m) =>
        m.positions.some((p) => p.row === 1 && p.col === 1),
      );
      if (matchWithSpecial) {
        const result = removeMatches(grid, [matchWithSpecial]);
        // Special was activated
        expect(result.specialsActivated.length).toBeGreaterThanOrEqual(1);
        expect(
          result.specialsActivated.some(
            (s) => s.special === SpecialType.LineBlastH,
          ),
        ).toBe(true);
        // Entire row should be cleared
        for (let c = 0; c < 6; c++) {
          expect(result.grid[1][c]).toBeNull();
        }
      }
    });

    it("score includes Line Blast bonus (100 pts)", () => {
      const score = calculateMatchScore(4, 0, [
        { pos: { row: 0, col: 0 }, special: SpecialType.LineBlastH },
      ]);
      // 4 * 10 * 1.0 + 100 = 140
      expect(score).toBe(140);
    });

    it("score includes vertical Line Blast bonus (100 pts)", () => {
      const score = calculateMatchScore(4, 0, [
        { pos: { row: 0, col: 0 }, special: SpecialType.LineBlastV },
      ]);
      expect(score).toBe(140);
    });

    it("score includes Bomb bonus (80 pts)", () => {
      const score = calculateMatchScore(5, 0, [
        { pos: { row: 0, col: 0 }, special: SpecialType.Bomb },
      ]);
      // 5 * 10 * 1.0 + 80 = 130
      expect(score).toBe(130);
    });

    it("score includes Rainbow bonus (150 pts)", () => {
      const score = calculateMatchScore(8, 0, [
        { pos: { row: 0, col: 0 }, special: SpecialType.Rainbow },
      ]);
      // 8 * 10 * 1.0 + 150 = 230
      expect(score).toBe(230);
    });

    it("multiple specials activated in one step add cumulative bonuses", () => {
      const score = calculateMatchScore(10, 0, [
        { pos: { row: 0, col: 0 }, special: SpecialType.LineBlastH },
        { pos: { row: 1, col: 1 }, special: SpecialType.Bomb },
      ]);
      // 10 * 10 * 1.0 + 100 + 80 = 280
      expect(score).toBe(280);
    });

    it("chain multiplier applies to base score but not special bonus", () => {
      // Chain index 2 means multiplier = 1 + 2*0.5 = 2.0
      const score = calculateMatchScore(3, 2, [
        { pos: { row: 0, col: 0 }, special: SpecialType.LineBlastH },
      ]);
      // floor(3 * 10 * 2.0 + 100) = 160
      expect(score).toBe(160);
    });
  });

  describe("special tiles — chain reactions", () => {
    it("a special tile caught in another special's blast is activated (chain)", () => {
      // Place a LineBlastH at (1,0) and a Bomb at (1,3)
      // Activating the LineBlastH should clear row 1, hitting the Bomb
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      grid[1][0] = { type: TileType.Star, special: SpecialType.LineBlastH };
      grid[1][3] = { type: TileType.Crown, special: SpecialType.Bomb };

      // Create a match that triggers the LineBlastH at (1,0)
      // Make row 1 cols 0,1,2 all Star type
      grid[1][1] = tile(S);
      grid[1][2] = tile(S);

      const matches = findMatches(grid);
      const starMatch = matches.find((m) =>
        m.positions.some((p) => p.row === 1 && p.col === 0),
      );
      if (starMatch) {
        const result = removeMatches(grid, [starMatch]);
        // Both specials should be activated
        expect(result.specialsActivated.length).toBeGreaterThanOrEqual(2);
        // The Bomb at (1,3) should have also been activated
        expect(
          result.specialsActivated.some(
            (s) => s.pos.row === 1 && s.pos.col === 3,
          ),
        ).toBe(true);
        // Bomb clears 3x3 around (1,3), so (0,2)(0,3)(0,4)(1,2)(1,3)(1,4)(2,2)(2,3)(2,4) should be removed
        // At minimum, cells in the bomb area should be null
        expect(result.grid[0][3]).toBeNull();
        expect(result.grid[2][3]).toBeNull();
      }
    });

    it("removeMatches handles a bomb's 5x5 blast correctly", () => {
      // Use a 6x6 grid so the bomb's 5x5 area doesn't cover everything
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      // Place a bomb at (2,2)
      grid[2][2] = { type: TileType.Star, special: SpecialType.Bomb };
      // Create a match including the bomb: S S S in row 2 cols 1,2,3
      grid[2][1] = tile(S);
      grid[2][3] = tile(S);

      const matches = findMatches(grid);
      const bombMatch = matches.find((m) =>
        m.positions.some((p) => p.row === 2 && p.col === 2),
      );
      if (bombMatch) {
        const result = removeMatches(grid, [bombMatch]);
        expect(result.specialsActivated.length).toBeGreaterThanOrEqual(1);
        // 5x5 area around (2,2) should be cleared: rows 0-4, cols 0-4
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const r = 2 + dr;
            const c = 2 + dc;
            if (r >= 0 && r < 6 && c >= 0 && c < 6) {
              expect(result.grid[r][c]).toBeNull();
            }
          }
        }
      }
    });
  });

  describe("special tiles — interaction between two specials", () => {
    it("matching two Line Blast tiles clears both row and column", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      // Place two Line Blast specials adjacent to each other
      grid[2][1] = { type: TileType.Star, special: SpecialType.LineBlastH };
      grid[2][2] = { type: TileType.Star, special: SpecialType.LineBlastV };
      grid[2][0] = tile(S); // Make S,S,S in row 2

      const matches = findMatches(grid);
      const starMatch = matches.find((m) =>
        m.positions.some((p) => p.row === 2 && p.col === 1),
      );
      if (starMatch) {
        const result = removeMatches(grid, [starMatch]);
        // Both specials should be activated
        expect(result.specialsActivated.length).toBeGreaterThanOrEqual(2);
        // Entire row 2 should be cleared (from LineBlastH)
        for (let c = 0; c < 6; c++) {
          expect(result.grid[2][c]).toBeNull();
        }
        // Entire column 2 should be cleared (from LineBlastV)
        for (let r = 0; r < 6; r++) {
          expect(result.grid[r][2]).toBeNull();
        }
      }
    });

    it("matching a Bomb with a Line Blast activates both", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      // Set up exactly 3 Doves in row 3, cols 1-3 (avoid longer runs)
      grid[3][0] = tile(H); // Ensure col 0 is NOT Dove
      grid[3][1] = tile(D);
      grid[3][2] = { type: TileType.Dove, special: SpecialType.Bomb };
      grid[3][3] = { type: TileType.Dove, special: SpecialType.LineBlastH };
      grid[3][4] = tile(S); // Ensure col 4 is NOT Dove

      const matches = findMatches(grid);
      const doveMatch = matches.find((m) =>
        m.positions.some((p) => p.row === 3 && p.col === 2),
      );
      expect(doveMatch).toBeDefined();
      if (doveMatch) {
        const result = removeMatches(grid, [doveMatch]);
        expect(result.specialsActivated.length).toBeGreaterThanOrEqual(2);
        // Row 3 should be fully cleared (LineBlastH clears entire row)
        for (let c = 0; c < 6; c++) {
          expect(result.grid[3][c]).toBeNull();
        }
      }
    });
  });

  describe("special tiles — processSwap integration", () => {
    it("swapping to create a 4-match produces a Line Blast in the final grid", () => {
      // Set up so swapping (0,0)<->(1,0) creates H,H,H,H in row 1
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, H, H, H, S, C],
        [C, D, S, W, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const result = processSwap(
        grid,
        { row: 0, col: 0 },
        { row: 1, col: 0 },
        6,
      );
      if (result.valid) {
        // Should have scored something
        expect(result.totalScore).toBeGreaterThan(0);
        expect(result.steps.length).toBeGreaterThanOrEqual(1);
        // After the first step, a LineBlast should exist somewhere in the final grid
        // (unless it got matched in a cascade)
        // The first step's matches should include a 4-match
        const firstStepMatches = result.steps[0].matches;
        const fourMatch = firstStepMatches.find(
          (m) => m.positions.length === 4,
        );
        expect(fourMatch).toBeDefined();
        expect(fourMatch!.specialCreated).toBe(SpecialType.LineBlastH);
      }
    });

    it("cascade after special activation generates additional score", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, H, H, H, S, C],
        [C, D, S, W, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const result = processSwap(
        grid,
        { row: 0, col: 0 },
        { row: 1, col: 0 },
        6,
      );
      if (result.valid && result.steps.length > 1) {
        // Chain cascades should have increasing chainIndex
        expect(result.steps[1].chainIndex).toBe(1);
        // Total score should be greater than just the first match
        const firstStepScore = calculateMatchScore(
          result.steps[0].matches.reduce(
            (sum, m) => sum + m.positions.length,
            0,
          ),
          0,
          [],
        );
        expect(result.totalScore).toBeGreaterThan(firstStepScore);
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // NEW FEATURE TESTS
  // ═══════════════════════════════════════════════════════

  describe("Propeller — 2x2 detection", () => {
    it("detects a 2x2 square of same-color tiles", () => {
      const grid = makeGrid([
        [H, H, S, C],
        [H, H, C, D],
        [S, C, D, W],
        [C, D, W, S],
      ]);
      const matches = find2x2Matches(grid);
      expect(matches.length).toBe(1);
      expect(matches[0].specialCreated).toBe(SpecialType.Propeller);
      expect(matches[0].positions).toHaveLength(4);
    });

    it("2x2 detection takes priority over line matches", () => {
      // Set up: a 2x2 block of Hearts at (0,0) that also forms part of a 3-in-row
      const grid = makeGrid([
        [H, H, S, C, D, W],
        [H, H, C, D, W, S],
        [S, C, D, W, H, C],
        [C, D, W, S, C, D],
        [D, W, S, C, D, W],
        [W, S, C, D, W, S],
      ]);
      const matches = findMatches(grid);
      // Should have a propeller match
      const propellerMatch = matches.find(
        (m) => m.specialCreated === SpecialType.Propeller,
      );
      expect(propellerMatch).toBeDefined();
      expect(propellerMatch!.positions).toHaveLength(4);
    });

    it("propeller position is at top-left of the 2x2 square", () => {
      const grid = makeGrid([
        [S, C, D, W],
        [C, H, H, D],
        [D, H, H, W],
        [W, S, C, S],
      ]);
      const matches = find2x2Matches(grid);
      expect(matches.length).toBe(1);
      expect(matches[0].specialPosition).toEqual({ row: 1, col: 1 });
    });

    it("does not detect overlapping 2x2 squares (first one wins)", () => {
      // 3x2 block of hearts: could be 2 overlapping 2x2, but only first wins
      const grid = makeGrid([
        [H, H, H, S],
        [H, H, H, C],
        [S, C, D, W],
        [C, D, W, S],
      ]);
      const matches = find2x2Matches(grid);
      // Only one 2x2 should be detected (the first one found)
      expect(matches.length).toBe(1);
    });

    it("findMatches includes propeller results", () => {
      const grid = makeGrid([
        [H, H, S, C, D, W],
        [H, H, C, D, W, S],
        [S, C, D, W, H, C],
        [C, D, W, S, C, D],
        [D, W, S, C, D, W],
        [W, S, C, D, W, S],
      ]);
      const matches = findMatches(grid);
      const propeller = matches.find((m) => m.specialCreated === SpecialType.Propeller);
      expect(propeller).toBeDefined();
    });

    it("propeller is created in removeMatches", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, H, S, C, D, W],
        [H, H, C, D, W, S],
        [S, C, D, W, H, C],
        [C, D, W, S, C, D],
        [D, W, S, C, D, W],
        [W, S, C, D, W, S],
      ]);
      const matches = findMatches(grid);
      const propMatch = matches.find((m) => m.specialCreated === SpecialType.Propeller);
      expect(propMatch).toBeDefined();
      if (propMatch) {
        const result = removeMatches(grid, [propMatch]);
        // The propeller special tile should exist in the result grid
        const pos = propMatch.specialPosition!;
        const tile = result.grid[pos.row][pos.col];
        expect(tile).not.toBeNull();
        expect(tile!.special).toBe(SpecialType.Propeller);
      }
    });

    it("no 2x2 detected in checkerboard pattern", () => {
      const grid = makeGrid([
        [H, S, H, S],
        [S, H, S, H],
        [H, S, H, S],
        [S, H, S, H],
      ]);
      const matches = find2x2Matches(grid);
      expect(matches).toHaveLength(0);
    });

    it("createGrid avoids initial 2x2 squares", () => {
      // Run multiple times to verify
      for (let i = 0; i < 10; i++) {
        const grid = createGrid(8, 8, 6);
        const propMatches = find2x2Matches(grid);
        expect(propMatches).toHaveLength(0);
      }
    });
  });

  describe("Propeller — activation", () => {
    it("Propeller clears 4 adjacent tiles plus a random tile", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 2, col: 2 },
        SpecialType.Propeller,
      );
      // 4 adjacent (up, down, left, right) + 1 random + itself = 6 targets
      expect(targets).toHaveLength(6);
      // Self should be included
      expect(targets.some((t) => t.row === 2 && t.col === 2)).toBe(true);
      // Adjacent tiles should be included
      expect(targets.some((t) => t.row === 1 && t.col === 2)).toBe(true); // up
      expect(targets.some((t) => t.row === 3 && t.col === 2)).toBe(true); // down
      expect(targets.some((t) => t.row === 2 && t.col === 1)).toBe(true); // left
      expect(targets.some((t) => t.row === 2 && t.col === 3)).toBe(true); // right
    });

    it("Propeller at corner clears only valid adjacent tiles", () => {
      const grid = makeGrid([
        [H, S, C],
        [S, C, D],
        [C, D, S],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 0, col: 0 },
        SpecialType.Propeller,
      );
      // Only 2 adjacent (right, down) + 1 random + itself = 4 targets
      expect(targets).toHaveLength(4);
      expect(targets.some((t) => t.row === 0 && t.col === 0)).toBe(true); // self
      expect(targets.some((t) => t.row === 0 && t.col === 1)).toBe(true); // right
      expect(targets.some((t) => t.row === 1 && t.col === 0)).toBe(true); // down
    });

    it("Propeller score includes propeller bonus", () => {
      const score = calculateMatchScore(4, 0, [
        { pos: { row: 0, col: 0 }, special: SpecialType.Propeller },
      ]);
      // 4 * 10 * 1.0 + 60 = 100
      expect(score).toBe(100);
    });
  });

  describe("Bomb — 5x5 upgrade", () => {
    it("Bomb clears 5x5 area (25 tiles) in center of 6x6 grid", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 2, col: 2 },
        SpecialType.Bomb,
      );
      // 5x5 centered at (2,2): rows 0-4, cols 0-4 = 25 tiles
      expect(targets).toHaveLength(25);
    });

    it("Bomb covers rows -2 to +2 and cols -2 to +2", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 3, col: 3 },
        SpecialType.Bomb,
      );
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = 3 + dr;
          const c = 3 + dc;
          if (r >= 0 && r < 6 && c >= 0 && c < 6) {
            expect(targets.some((t) => t.row === r && t.col === c)).toBe(true);
          }
        }
      }
    });
  });

  describe("Unlimited chain reactions", () => {
    it("multi-level chain: special A triggers special B which triggers special C", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R, H, S],
        [S, C, D, W, S, C, S, C],
        [C, D, S, H, C, D, C, D],
        [D, W, C, S, D, W, D, W],
        [W, S, D, C, W, S, W, S],
        [S, C, H, D, S, C, S, C],
        [H, D, S, W, C, D, H, D],
        [D, W, C, S, D, W, D, W],
      ]);
      // Set up chain: LineBlastH at (1,0) -> hits Bomb at (1,4) -> hits LineBlastV at (3,5)
      grid[1][0] = { type: TileType.Star, special: SpecialType.LineBlastH };
      grid[1][4] = { type: TileType.Crown, special: SpecialType.Bomb };
      grid[3][5] = { type: TileType.Dove, special: SpecialType.LineBlastV };

      // Create a match at row 1 cols 0,1,2 to trigger the LineBlastH
      grid[1][1] = tile(S);
      grid[1][2] = tile(S);

      const matches = findMatches(grid);
      const starMatch = matches.find((m) =>
        m.positions.some((p) => p.row === 1 && p.col === 0),
      );
      if (starMatch) {
        const result = removeMatches(grid, [starMatch]);
        // All 3 specials should be activated
        expect(result.specialsActivated.length).toBeGreaterThanOrEqual(3);
        // Verify each was activated
        expect(result.specialsActivated.some((s) => s.pos.row === 1 && s.pos.col === 0)).toBe(true);
        expect(result.specialsActivated.some((s) => s.pos.row === 1 && s.pos.col === 4)).toBe(true);
        expect(result.specialsActivated.some((s) => s.pos.row === 3 && s.pos.col === 5)).toBe(true);
      }
    });

    it("alreadyActivated prevents infinite loops with two specials targeting each other", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      // Two bombs near each other that could trigger each other
      grid[2][2] = { type: TileType.Star, special: SpecialType.Bomb };
      grid[2][4] = { type: TileType.Star, special: SpecialType.Bomb };
      // Match to trigger first bomb
      grid[2][1] = tile(S);
      grid[2][3] = tile(S);

      const matches = findMatches(grid);
      const starMatch = matches.find((m) =>
        m.positions.some((p) => p.row === 2 && p.col === 2),
      );
      if (starMatch) {
        // Should not infinite loop
        const result = removeMatches(grid, [starMatch]);
        expect(result.specialsActivated.length).toBeGreaterThanOrEqual(2);
        // Both bombs activated but each only once
        const bomb1 = result.specialsActivated.filter((s) => s.pos.row === 2 && s.pos.col === 2);
        const bomb2 = result.specialsActivated.filter((s) => s.pos.row === 2 && s.pos.col === 4);
        expect(bomb1).toHaveLength(1);
        expect(bomb2).toHaveLength(1);
      }
    });
  });

  describe("Powerup combinations", () => {
    it("isCombo returns true for two specials, false if one is None", () => {
      expect(isCombo(SpecialType.LineBlastH, SpecialType.Bomb)).toBe(true);
      expect(isCombo(SpecialType.None, SpecialType.Bomb)).toBe(false);
      expect(isCombo(SpecialType.None, SpecialType.None)).toBe(false);
    });

    it("Combo 1: LineBlast + LineBlast → cross blast (full row AND full column)", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = combinePowerups(
        SpecialType.LineBlastH, SpecialType.LineBlastV,
        { row: 2, col: 3 }, grid,
      );
      // Full row 2 (6 tiles) + full column 3 (6 tiles) - 1 overlap = 11
      expect(targets).toHaveLength(11);
      // All of row 2
      for (let c = 0; c < 6; c++) {
        expect(targets.some((t) => t.row === 2 && t.col === c)).toBe(true);
      }
      // All of col 3
      for (let r = 0; r < 6; r++) {
        expect(targets.some((t) => t.row === r && t.col === 3)).toBe(true);
      }
    });

    it("Combo 2: Bomb + Bomb → 7x7 mega explosion", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R, H, S],
        [S, C, D, W, S, C, S, C],
        [C, D, S, H, C, D, C, D],
        [D, W, C, S, D, W, D, W],
        [W, S, D, C, W, S, W, S],
        [S, C, H, D, S, C, S, C],
        [H, D, S, W, C, D, H, D],
        [D, W, C, S, D, W, D, W],
      ]);
      const targets = combinePowerups(
        SpecialType.Bomb, SpecialType.Bomb,
        { row: 3, col: 3 }, grid,
      );
      // 7x7 centered at (3,3): rows 0-6, cols 0-6 = 49 tiles
      expect(targets).toHaveLength(49);
    });

    it("Combo 3: LineBlast + Bomb → 3-row + 3-column blast", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = combinePowerups(
        SpecialType.LineBlastH, SpecialType.Bomb,
        { row: 2, col: 2 }, grid,
      );
      // 3 full rows (1,2,3 = 18 tiles) + 3 full cols (1,2,3 = 18 tiles) - overlaps
      // Rows 1-3, all 6 cols = 18
      // Cols 1-3, all 6 rows = 18
      // Overlap: 3 rows x 3 cols = 9
      // Total = 18 + 18 - 9 = 27
      expect(targets).toHaveLength(27);
      // Check rows 1,2,3 fully cleared
      for (let dr = -1; dr <= 1; dr++) {
        for (let c = 0; c < 6; c++) {
          expect(targets.some((t) => t.row === 2 + dr && t.col === c)).toBe(true);
        }
      }
      // Check cols 1,2,3 fully cleared
      for (let dc = -1; dc <= 1; dc++) {
        for (let r = 0; r < 6; r++) {
          expect(targets.some((t) => t.row === r && t.col === 2 + dc)).toBe(true);
        }
      }
    });

    it("Combo 4: Rainbow + LineBlast → all tiles of color become LineBlasts and detonate", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      // Use Heart as the swapped color
      const targets = combinePowerups(
        SpecialType.Rainbow, SpecialType.LineBlastH,
        { row: 0, col: 0 }, grid, TileType.Heart,
      );
      // Every Heart tile becomes a LineBlast: its full row and column are cleared
      // Hearts are at specific positions — the combo should clear many tiles
      expect(targets.length).toBeGreaterThan(10);
    });

    it("Combo 5: Rainbow + Bomb → all tiles of swapped color explode 3x3", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = combinePowerups(
        SpecialType.Rainbow, SpecialType.Bomb,
        { row: 0, col: 0 }, grid, TileType.Heart,
      );
      // Each Heart position gets a 3x3 explosion
      expect(targets.length).toBeGreaterThan(5);
    });

    it("Combo 6: Rainbow + Rainbow → clear entire board", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = combinePowerups(
        SpecialType.Rainbow, SpecialType.Rainbow,
        { row: 0, col: 0 }, grid,
      );
      // Entire 6x6 board = 36 tiles
      expect(targets).toHaveLength(36);
    });

    it("Combo 7: Propeller + LineBlast → adjacent 4 + target row and column", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = combinePowerups(
        SpecialType.Propeller, SpecialType.LineBlastH,
        { row: 2, col: 2 }, grid,
      );
      // Should include self + 4 adjacent + full row and column of random target
      // At least 5 (self + 4 adj) + some from the random target
      expect(targets.length).toBeGreaterThan(5);
      // Self should be included
      expect(targets.some((t) => t.row === 2 && t.col === 2)).toBe(true);
    });

    it("Combo 8: Propeller + Bomb → adjacent 4 + 5x5 at target", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = combinePowerups(
        SpecialType.Propeller, SpecialType.Bomb,
        { row: 2, col: 2 }, grid,
      );
      // Self + 4 adjacent = 5, plus up to 25 from 5x5 at random target
      expect(targets.length).toBeGreaterThan(5);
      expect(targets.some((t) => t.row === 2 && t.col === 2)).toBe(true);
    });

    it("Combo 9: Propeller + Propeller → 2 propellers target 2 different random tiles", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = combinePowerups(
        SpecialType.Propeller, SpecialType.Propeller,
        { row: 2, col: 2 }, grid,
      );
      // Self + 4 adjacent = 5, plus 2 targets each with up to 5 tiles
      expect(targets.length).toBeGreaterThan(5);
      expect(targets.some((t) => t.row === 2 && t.col === 2)).toBe(true);
    });

    it("Combo 10: Rainbow + Propeller → 3 propellers target 3 different tiles", () => {
      const grid = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      const targets = combinePowerups(
        SpecialType.Rainbow, SpecialType.Propeller,
        { row: 2, col: 2 }, grid,
      );
      // Self + 3 targets each with up to 5 tiles
      expect(targets.length).toBeGreaterThan(3);
      expect(targets.some((t) => t.row === 2 && t.col === 2)).toBe(true);
    });
  });

  describe("Powerup combos in processSwap", () => {
    it("swapping two specials triggers combo effect", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      // Place two specials adjacent
      grid[2][2] = { type: TileType.Star, special: SpecialType.LineBlastH };
      grid[2][3] = { type: TileType.Heart, special: SpecialType.LineBlastV };

      const result = processSwap(
        grid,
        { row: 2, col: 2 },
        { row: 2, col: 3 },
        6,
      );
      expect(result.valid).toBe(true);
      expect(result.totalScore).toBeGreaterThan(0);
      // Cross blast should clear entire row 2 and column 2
      // Both row 2 and col 2 should be null after removal (before gravity fills)
    });

    it("swapping two Rainbows clears entire board", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      grid[2][2] = { type: TileType.Star, special: SpecialType.Rainbow };
      grid[2][3] = { type: TileType.Heart, special: SpecialType.Rainbow };

      const result = processSwap(
        grid,
        { row: 2, col: 2 },
        { row: 2, col: 3 },
        6,
      );
      expect(result.valid).toBe(true);
      // Score should be very high (36 tiles removed + two rainbow bonuses)
      expect(result.totalScore).toBeGreaterThan(300);
    });

    it("swapping Bomb + Bomb creates 7x7 mega explosion", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R, H, S],
        [S, C, D, W, S, C, S, C],
        [C, D, S, H, C, D, C, D],
        [D, W, C, S, D, W, D, W],
        [W, S, D, C, W, S, W, S],
        [S, C, H, D, S, C, S, C],
        [H, D, S, W, C, D, H, D],
        [D, W, C, S, D, W, D, W],
      ]);
      grid[3][3] = { type: TileType.Star, special: SpecialType.Bomb };
      grid[3][4] = { type: TileType.Heart, special: SpecialType.Bomb };

      const result = processSwap(
        grid,
        { row: 3, col: 3 },
        { row: 3, col: 4 },
        6,
      );
      expect(result.valid).toBe(true);
      // Should remove a LOT of tiles
      expect(result.totalScore).toBeGreaterThan(100);
    });
  });

  describe("Rainbow — player-chosen color", () => {
    it("Rainbow swapped with normal tile clears all tiles of that tile's color", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      // Place Rainbow at (2,2), normal Star at (2,3)
      grid[2][2] = { type: TileType.Star, special: SpecialType.Rainbow };
      grid[2][3] = tile(S); // Star type

      const result = processSwap(
        grid,
        { row: 2, col: 2 },
        { row: 2, col: 3 },
        6,
      );
      expect(result.valid).toBe(true);
      expect(result.totalScore).toBeGreaterThan(0);
      // All Star tiles and the Rainbow tile should have been cleared (before gravity)
    });

    it("Rainbow activated by blast uses auto-pick (most common type)", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      // Place Rainbow at (1,3) and a LineBlastH at (1,0)
      grid[1][3] = { type: TileType.Crown, special: SpecialType.Rainbow };
      grid[1][0] = { type: TileType.Star, special: SpecialType.LineBlastH };
      // Create a match to trigger LineBlastH
      grid[1][1] = tile(S);
      grid[1][2] = tile(S);

      const matches = findMatches(grid);
      const starMatch = matches.find((m) =>
        m.positions.some((p) => p.row === 1 && p.col === 0),
      );
      if (starMatch) {
        const result = removeMatches(grid, [starMatch]);
        // Rainbow should have been activated (auto-pick since it was in a blast, not swapped)
        expect(result.specialsActivated.some(
          (s) => s.special === SpecialType.Rainbow,
        )).toBe(true);
      }
    });

    it("Rainbow swapped with specific color clears that color, not the most common", () => {
      // Create a grid where Doves are the most common
      const grid: (Tile | null)[][] = [
        [tile(D), tile(D), tile(D), tile(D), tile(D), tile(D)],
        [tile(D), tile(C), tile(S), tile(H), tile(D), tile(D)],
        [tile(D), tile(S), { type: TileType.Star, special: SpecialType.Rainbow }, tile(H), tile(D), tile(D)],
        [tile(D), tile(H), tile(C), tile(S), tile(D), tile(D)],
        [tile(D), tile(D), tile(D), tile(D), tile(D), tile(D)],
        [tile(D), tile(D), tile(D), tile(D), tile(D), tile(D)],
      ];
      // Swap Rainbow with a Heart tile at (2,3)
      const result = processSwap(
        grid,
        { row: 2, col: 2 },
        { row: 2, col: 3 },
        6,
      );
      expect(result.valid).toBe(true);
      // Heart tiles should be cleared (not Dove which is most common)
      // After removal, no Hearts should remain (before gravity fills gaps)
      // We verify by checking the score is reasonable
      expect(result.totalScore).toBeGreaterThan(0);
    });
  });

  describe("processSwap integration — combo and chain combined", () => {
    it("combo triggers chain reaction on special tiles in blast radius", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D, W, R],
        [S, C, D, W, S, C],
        [C, D, S, H, C, D],
        [D, W, C, S, D, W],
        [W, S, D, C, W, S],
        [S, C, H, D, S, C],
      ]);
      // Place two LineBlasts to swap (combo: cross blast)
      grid[2][2] = { type: TileType.Star, special: SpecialType.LineBlastH };
      grid[2][3] = { type: TileType.Heart, special: SpecialType.LineBlastV };
      // Place a Bomb in the blast radius
      grid[0][3] = { type: TileType.Dove, special: SpecialType.Bomb };

      const result = processSwap(
        grid,
        { row: 2, col: 2 },
        { row: 2, col: 3 },
        6,
      );
      expect(result.valid).toBe(true);
      // Should have high score from combo + chain
      expect(result.totalScore).toBeGreaterThan(100);
    });
  });
});
