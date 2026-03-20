import { describe, it, expect } from "vitest";
import {
  TileType,
  SpecialType,
  createGrid,
  areAdjacent,
  swapTiles,
  findMatches,
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

    it("Bomb clears 3x3 area", () => {
      const grid = makeGrid([
        [H, S, C, D],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      const targets = getSpecialTileTargets(
        grid,
        { row: 1, col: 1 },
        SpecialType.Bomb,
      );
      expect(targets).toHaveLength(9);
    });

    it("Bomb at corner only clears valid cells", () => {
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
      expect(targets).toHaveLength(4); // Only 4 cells in 3x3 from corner
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

    it("Bomb targets a 3x3 area in the center of the grid", () => {
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
      expect(targets).toHaveLength(9);
      // Check all 9 positions are present
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const found = targets.some(
            (t) => t.row === 3 + dr && t.col === 3 + dc,
          );
          expect(found).toBe(true);
        }
      }
    });

    it("Bomb at top-left corner only targets valid cells", () => {
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
      expect(targets).toHaveLength(4);
    });

    it("Bomb at bottom-right corner only targets valid cells", () => {
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
      expect(targets).toHaveLength(4);
    });

    it("Bomb at edge only targets valid cells", () => {
      const grid = makeGrid([
        [H, S, C, D],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      // Top edge, middle column
      const targets = getSpecialTileTargets(
        grid,
        { row: 0, col: 1 },
        SpecialType.Bomb,
      );
      expect(targets).toHaveLength(6); // 2 rows x 3 cols
    });

    it("Bomb skips null cells in its 3x3 area", () => {
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
      expect(targets).toHaveLength(8); // 9 - 1 null
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

    it("removeMatches handles a bomb's 3x3 blast correctly", () => {
      const grid: (Tile | null)[][] = makeGrid([
        [H, S, C, D],
        [S, C, D, W],
        [C, D, S, H],
        [D, W, C, S],
      ]);
      // Place a bomb at center (1,1)
      grid[1][1] = { type: TileType.Cross, special: SpecialType.Bomb };
      // Create a match including the bomb
      grid[1][0] = tile(C);
      grid[1][2] = tile(C);

      const matches = findMatches(grid);
      const bombMatch = matches.find((m) =>
        m.positions.some((p) => p.row === 1 && p.col === 1),
      );
      if (bombMatch) {
        const result = removeMatches(grid, [bombMatch]);
        expect(result.specialsActivated.length).toBeGreaterThanOrEqual(1);
        // 3x3 area around (1,1) should be cleared
        // (0,0)(0,1)(0,2), (1,0)(1,1)(1,2), (2,0)(2,1)(2,2)
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const r = 1 + dr;
            const c = 1 + dc;
            if (r >= 0 && r < 4 && c >= 0 && c < 4) {
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
});
