// --- Types ---

export enum TileType {
  Heart = 0, // Love
  Star = 1, // Faith
  Cross = 2, // Hope
  Dove = 3, // Peace
  Crown = 4, // Victory
  Scroll = 5, // Wisdom
}

export enum SpecialType {
  None = 0,
  LineBlastH = 1, // Clears entire row
  LineBlastV = 2, // Clears entire column
  Bomb = 3, // Clears 5x5 area
  Rainbow = 4, // Clears all tiles of one color
  Propeller = 5, // Clears 4 adjacent + flies to random tile
}

export interface Tile {
  type: TileType;
  special: SpecialType;
}

export interface Position {
  row: number;
  col: number;
}

export interface MatchResult {
  positions: Position[];
  specialCreated: SpecialType;
  /** Where the special tile should be placed (where player initiated the swap) */
  specialPosition: Position | null;
}

export interface SwapResult {
  valid: boolean;
  matches: MatchResult[];
  /** Grid state after matches are removed (null cells = empty) */
  gridAfterRemoval: (Tile | null)[][];
}

export interface GravityResult {
  /** Tiles that moved: from -> to positions */
  movements: { from: Position; to: Position; tile: Tile }[];
  /** New tiles spawned at top to fill gaps */
  spawned: { position: Position; tile: Tile }[];
  /** The updated grid */
  grid: (Tile | null)[][];
}

export interface CascadeStep {
  matches: MatchResult[];
  gravity: GravityResult;
  chainIndex: number;
}

export interface LevelConfig {
  level: number;
  targetScore: number;
  moves: number;
  gridSize: number;
  tileCount: number;
  /** Score thresholds for star ratings: [1-star, 2-star, 3-star] */
  starThresholds: [number, number, number];
}

export interface GameState {
  grid: (Tile | null)[][];
  score: number;
  movesRemaining: number;
  level: number;
  targetScore: number;
  chainMultiplier: number;
  combo: number;
  /** Levels completed (0-indexed) */
  levelsCompleted: number;
  /** Whether a question should be shown */
  showQuestion: boolean;
  /** Bonus moves earned from questions */
  bonusMoves: number;
  gameOver: boolean;
  levelComplete: boolean;
}

// --- Constants ---

const BASE_POINTS_PER_TILE = 10;
const CHAIN_MULTIPLIER_BONUS = 0.5; // Each chain adds 50% multiplier
const SPECIAL_TILE_BONUS = 50;
const LINE_BLAST_BONUS = 100;
const BOMB_BONUS = 80;
const RAINBOW_BONUS = 150;
const PROPELLER_BONUS = 60;

// --- Level Configs ---

/** Generate level configs for little-kids (6x6 grid, 5 tile types) */
export function getLittleKidsLevels(): LevelConfig[] {
  return [
    { level: 1, targetScore: 200, moves: 20, gridSize: 6, tileCount: 5, starThresholds: [200, 350, 500] },
    { level: 2, targetScore: 300, moves: 20, gridSize: 6, tileCount: 5, starThresholds: [300, 500, 700] },
    { level: 3, targetScore: 400, moves: 18, gridSize: 6, tileCount: 5, starThresholds: [400, 600, 850] },
    { level: 4, targetScore: 500, moves: 18, gridSize: 6, tileCount: 5, starThresholds: [500, 750, 1000] },
    { level: 5, targetScore: 600, moves: 16, gridSize: 6, tileCount: 5, starThresholds: [600, 900, 1200] },
    { level: 6, targetScore: 700, moves: 16, gridSize: 6, tileCount: 5, starThresholds: [700, 1050, 1400] },
    { level: 7, targetScore: 800, moves: 15, gridSize: 6, tileCount: 5, starThresholds: [800, 1200, 1600] },
    { level: 8, targetScore: 900, moves: 15, gridSize: 6, tileCount: 5, starThresholds: [900, 1350, 1800] },
    { level: 9, targetScore: 1000, moves: 14, gridSize: 6, tileCount: 5, starThresholds: [1000, 1500, 2000] },
    { level: 10, targetScore: 1100, moves: 14, gridSize: 6, tileCount: 5, starThresholds: [1100, 1650, 2200] },
  ];
}

/** Generate level configs for big-kids (8x8 grid, 6 tile types) */
export function getBigKidsLevels(): LevelConfig[] {
  return [
    { level: 1, targetScore: 300, moves: 20, gridSize: 8, tileCount: 6, starThresholds: [300, 500, 800] },
    { level: 2, targetScore: 450, moves: 20, gridSize: 8, tileCount: 6, starThresholds: [450, 700, 1000] },
    { level: 3, targetScore: 600, moves: 18, gridSize: 8, tileCount: 6, starThresholds: [600, 900, 1300] },
    { level: 4, targetScore: 750, moves: 18, gridSize: 8, tileCount: 6, starThresholds: [750, 1100, 1500] },
    { level: 5, targetScore: 900, moves: 16, gridSize: 8, tileCount: 6, starThresholds: [900, 1350, 1800] },
    { level: 6, targetScore: 1050, moves: 16, gridSize: 8, tileCount: 6, starThresholds: [1050, 1550, 2100] },
    { level: 7, targetScore: 1200, moves: 15, gridSize: 8, tileCount: 6, starThresholds: [1200, 1800, 2400] },
    { level: 8, targetScore: 1400, moves: 15, gridSize: 8, tileCount: 6, starThresholds: [1400, 2100, 2800] },
    { level: 9, targetScore: 1600, moves: 14, gridSize: 8, tileCount: 6, starThresholds: [1600, 2400, 3200] },
    { level: 10, targetScore: 1800, moves: 14, gridSize: 8, tileCount: 6, starThresholds: [1800, 2700, 3600] },
  ];
}

export function getLevelConfig(
  level: number,
  difficulty: "little-kids" | "big-kids",
): LevelConfig {
  const levels =
    difficulty === "little-kids" ? getLittleKidsLevels() : getBigKidsLevels();
  const idx = Math.min(level - 1, levels.length - 1);
  return levels[Math.max(0, idx)];
}

// --- Grid Creation ---

/** Create a random tile of the given type range */
export function randomTile(tileCount: number): Tile {
  return {
    type: Math.floor(Math.random() * tileCount) as TileType,
    special: SpecialType.None,
  };
}

/** Create a random tile, optionally using a provided RNG (for testing) */
export function randomTileWithRng(
  tileCount: number,
  rng: () => number,
): Tile {
  return {
    type: Math.floor(rng() * tileCount) as TileType,
    special: SpecialType.None,
  };
}

/**
 * Create a grid with no initial matches.
 * Fills top-to-bottom, left-to-right, avoiding creating 3-in-a-row.
 */
export function createGrid(rows: number, cols: number, tileCount: number): Tile[][] {
  const grid: Tile[][] = [];

  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      let tile: Tile;
      let attempts = 0;
      do {
        tile = randomTile(tileCount);
        attempts++;
        // Safety: don't loop forever
        if (attempts > 100) break;
      } while (wouldCreateMatch(grid, r, c, tile.type, rows, cols));
      grid[r][c] = tile;
    }
  }

  return grid;
}

/**
 * Check if placing a tile type at (row, col) would create a match of 3
 * or a 2x2 square by looking at the already-placed tiles to the left and above.
 */
function wouldCreateMatch(
  grid: Tile[][],
  row: number,
  col: number,
  type: TileType,
  _rows: number,
  _cols: number,
): boolean {
  // Check horizontal: two to the left
  if (
    col >= 2 &&
    grid[row][col - 1]?.type === type &&
    grid[row][col - 2]?.type === type
  ) {
    return true;
  }
  // Check vertical: two above
  if (
    row >= 2 &&
    grid[row - 1]?.[col]?.type === type &&
    grid[row - 2]?.[col]?.type === type
  ) {
    return true;
  }
  // Check 2x2 squares (would create Propeller)
  // Check top-left: (row-1,col-1), (row-1,col), (row,col-1) + current
  if (
    row >= 1 && col >= 1 &&
    grid[row - 1]?.[col - 1]?.type === type &&
    grid[row - 1]?.[col]?.type === type &&
    grid[row]?.[col - 1]?.type === type
  ) {
    return true;
  }
  // Check top-right: (row-1,col), (row-1,col+1), (row,col+1) + current
  if (
    row >= 1 && col + 1 < _cols &&
    grid[row - 1]?.[col]?.type === type &&
    grid[row - 1]?.[col + 1]?.type === type &&
    grid[row]?.[col + 1]?.type === type
  ) {
    return true;
  }
  return false;
}

// --- Adjacency ---

export function areAdjacent(a: Position, b: Position): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

// --- Swap ---

export function swapTiles(
  grid: (Tile | null)[][],
  a: Position,
  b: Position,
): (Tile | null)[][] {
  const newGrid = grid.map((row) => [...row]);
  const temp = newGrid[a.row][a.col];
  newGrid[a.row][a.col] = newGrid[b.row][b.col];
  newGrid[b.row][b.col] = temp;
  return newGrid;
}

// --- Match Detection ---

/**
 * Find all 2x2 square matches in the grid (for Propeller creation).
 * Returns positions grouped by each 2x2 square found.
 * 2x2 detection runs BEFORE line matches and takes priority.
 */
export function find2x2Matches(grid: (Tile | null)[][]): MatchResult[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const results: MatchResult[] = [];
  const used = new Set<string>();

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = grid[r][c];
      const tr = grid[r][c + 1];
      const bl = grid[r + 1][c];
      const br = grid[r + 1][c + 1];

      if (
        tl && tr && bl && br &&
        tl.type === tr.type &&
        tl.type === bl.type &&
        tl.type === br.type
      ) {
        const keys = [
          `${r},${c}`, `${r},${c + 1}`,
          `${r + 1},${c}`, `${r + 1},${c + 1}`,
        ];
        // Don't create a propeller if any of these cells are already used by another 2x2
        if (keys.some((k) => used.has(k))) continue;
        for (const k of keys) used.add(k);

        const positions: Position[] = [
          { row: r, col: c }, { row: r, col: c + 1 },
          { row: r + 1, col: c }, { row: r + 1, col: c + 1 },
        ];
        // Propeller is placed at top-left of the 2x2
        results.push({
          positions,
          specialCreated: SpecialType.Propeller,
          specialPosition: { row: r, col: c },
        });
      }
    }
  }

  return results;
}

/**
 * Find all matches in the grid.
 * Returns array of MatchResult, each with positions and what special to create.
 * 2x2 squares are detected first (creating Propellers) and take priority.
 */
export function findMatches(grid: (Tile | null)[][]): MatchResult[] {
  const rows = grid.length;
  const cols = grid[0].length;

  // --- Phase 1: Detect 2x2 squares for Propeller (highest priority) ---
  const propellerMatches = find2x2Matches(grid);
  const propellerUsed = new Set<string>();
  for (const pm of propellerMatches) {
    for (const p of pm.positions) {
      propellerUsed.add(`${p.row},${p.col}`);
    }
  }

  // --- Phase 2: Detect line matches (3+), excluding cells used by propellers ---
  // Track which cells are part of a match
  const matched = new Set<string>();
  const rawMatches: { positions: Position[]; direction: "h" | "v" }[] = [];

  // Find horizontal matches
  for (let r = 0; r < rows; r++) {
    let runStart = 0;
    for (let c = 1; c <= cols; c++) {
      const current = c < cols ? grid[r][c] : null;
      const prev = grid[r][runStart];
      if (
        current && prev && current.type === prev.type &&
        !propellerUsed.has(`${r},${c}`) && !propellerUsed.has(`${r},${runStart}`)
      ) {
        // Continue run
      } else {
        // Filter out propeller-used positions from this run
        const positions: Position[] = [];
        for (let k = runStart; k < c; k++) {
          if (!propellerUsed.has(`${r},${k}`) && grid[r][k] && grid[r][runStart] && grid[r][k]!.type === grid[r][runStart]!.type) {
            positions.push({ row: r, col: k });
          }
        }
        if (positions.length >= 3) {
          for (const p of positions) {
            matched.add(`${p.row},${p.col}`);
          }
          rawMatches.push({ positions, direction: "h" });
        }
        runStart = c;
      }
    }
  }

  // Find vertical matches
  for (let c = 0; c < cols; c++) {
    let runStart = 0;
    for (let r = 1; r <= rows; r++) {
      const current = r < rows ? grid[r][c] : null;
      const prev = grid[runStart][c];
      if (
        current && prev && current.type === prev.type &&
        !propellerUsed.has(`${r},${c}`) && !propellerUsed.has(`${runStart},${c}`)
      ) {
        // Continue run
      } else {
        const positions: Position[] = [];
        for (let k = runStart; k < r; k++) {
          if (!propellerUsed.has(`${k},${c}`) && grid[k][c] && grid[runStart][c] && grid[k][c]!.type === grid[runStart][c]!.type) {
            positions.push({ row: k, col: c });
          }
        }
        if (positions.length >= 3) {
          for (const p of positions) {
            matched.add(`${p.row},${p.col}`);
          }
          rawMatches.push({ positions, direction: "v" });
        }
        runStart = r;
      }
    }
  }

  // Check for L/T shapes: find positions that appear in both H and V matches
  const hMatchPositions = new Map<string, Position[]>(); // key -> all positions in that h match
  const vMatchPositions = new Map<string, Position[]>();

  for (const m of rawMatches) {
    for (const p of m.positions) {
      const key = `${p.row},${p.col}`;
      if (m.direction === "h") {
        hMatchPositions.set(key, m.positions);
      } else {
        vMatchPositions.set(key, m.positions);
      }
    }
  }

  // Merge overlapping matches into groups
  const visited = new Set<string>();
  const mergedGroups: Position[][] = [];

  function floodFill(key: string, group: Position[]) {
    if (visited.has(key)) return;
    if (!matched.has(key)) return;
    visited.add(key);

    const [r, c] = key.split(",").map(Number);
    group.push({ row: r, col: c });

    // Check all raw matches that include this position
    for (const m of rawMatches) {
      for (const p of m.positions) {
        const pk = `${p.row},${p.col}`;
        if (pk === key) {
          // This match includes our position, add all its positions
          for (const mp of m.positions) {
            floodFill(`${mp.row},${mp.col}`, group);
          }
        }
      }
    }
  }

  for (const key of matched) {
    if (!visited.has(key)) {
      const group: Position[] = [];
      floodFill(key, group);
      if (group.length > 0) {
        mergedGroups.push(group);
      }
    }
  }

  // Determine special tile for each line-match group
  const lineResults = mergedGroups.map((positions) => {
    const special = determineSpecial(positions, rawMatches);
    // Place special at center of the group
    const specialPosition =
      special !== SpecialType.None ? getCenterPosition(positions) : null;
    return { positions, specialCreated: special, specialPosition };
  });

  // Combine propeller matches and line matches
  return [...propellerMatches, ...lineResults];
}

/**
 * Determine what special tile a match group should create.
 */
function determineSpecial(
  positions: Position[],
  rawMatches: { positions: Position[]; direction: "h" | "v" }[],
): SpecialType {
  // Check for L/T shape: group contains positions from both H and V matches
  const hasH = rawMatches.some(
    (m) =>
      m.direction === "h" &&
      m.positions.some((p) =>
        positions.some((gp) => gp.row === p.row && gp.col === p.col),
      ),
  );
  const hasV = rawMatches.some(
    (m) =>
      m.direction === "v" &&
      m.positions.some((p) =>
        positions.some((gp) => gp.row === p.row && gp.col === p.col),
      ),
  );

  if (hasH && hasV) {
    return SpecialType.Bomb; // L/T shape
  }

  // Check for 5+ in a row
  if (positions.length >= 5) {
    return SpecialType.Rainbow;
  }

  // Check for 4 in a row
  if (positions.length === 4) {
    // Determine direction to pick LineBlastH or LineBlastV
    const isHorizontal = positions.every((p) => p.row === positions[0].row);
    return isHorizontal ? SpecialType.LineBlastH : SpecialType.LineBlastV;
  }

  return SpecialType.None;
}

function getCenterPosition(positions: Position[]): Position {
  // Return the middle position (for odd counts) or the one closer to center
  const sorted = [...positions].sort((a, b) =>
    a.row !== b.row ? a.row - b.row : a.col - b.col,
  );
  return sorted[Math.floor(sorted.length / 2)];
}

// --- Special Tile Activation ---

/**
 * Get all positions that should be cleared when a special tile is activated.
 */
export function getSpecialTileTargets(
  grid: (Tile | null)[][],
  pos: Position,
  special: SpecialType,
): Position[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const targets: Position[] = [];

  switch (special) {
    case SpecialType.LineBlastH:
      for (let c = 0; c < cols; c++) {
        if (grid[pos.row][c] !== null) {
          targets.push({ row: pos.row, col: c });
        }
      }
      break;

    case SpecialType.LineBlastV:
      for (let r = 0; r < rows; r++) {
        if (grid[r][pos.col] !== null) {
          targets.push({ row: r, col: pos.col });
        }
      }
      break;

    case SpecialType.Bomb:
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = pos.row + dr;
          const c = pos.col + dc;
          if (r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] !== null) {
            targets.push({ row: r, col: c });
          }
        }
      }
      break;

    case SpecialType.Rainbow: {
      // Clear all tiles of the most common type on the board (excluding the rainbow tile itself)
      const typeCounts = new Map<TileType, number>();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = grid[r][c];
          if (tile && !(r === pos.row && c === pos.col)) {
            typeCounts.set(tile.type, (typeCounts.get(tile.type) ?? 0) + 1);
          }
        }
      }
      let bestType = TileType.Heart;
      let bestCount = 0;
      for (const [type, count] of typeCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestType = type;
        }
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = grid[r][c];
          if (tile && tile.type === bestType) {
            targets.push({ row: r, col: c });
          }
        }
      }
      // Also include the rainbow tile itself
      targets.push(pos);
      break;
    }

    case SpecialType.Propeller: {
      // Clear 4 adjacent tiles (up/down/left/right)
      const adjacent = [
        { row: pos.row - 1, col: pos.col },
        { row: pos.row + 1, col: pos.col },
        { row: pos.row, col: pos.col - 1 },
        { row: pos.row, col: pos.col + 1 },
      ];
      for (const a of adjacent) {
        if (a.row >= 0 && a.row < rows && a.col >= 0 && a.col < cols && grid[a.row][a.col] !== null) {
          targets.push(a);
        }
      }
      // Fly to a random tile and clear it
      const available: Position[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c] !== null && !(r === pos.row && c === pos.col)) {
            // Skip tiles already targeted
            const alreadyTargeted = targets.some((t) => t.row === r && t.col === c);
            if (!alreadyTargeted) {
              available.push({ row: r, col: c });
            }
          }
        }
      }
      if (available.length > 0) {
        const randomTarget = available[Math.floor(Math.random() * available.length)];
        targets.push(randomTarget);
      }
      // Also include the propeller tile itself
      targets.push(pos);
      break;
    }

    default:
      break;
  }

  return targets;
}

// --- Remove Matches ---

/**
 * Remove matched tiles from the grid.
 * Returns the grid with nulls where tiles were removed,
 * plus any special tiles that were activated.
 * Supports unlimited chain reactions: when a special tile is caught in
 * another special's blast, it activates recursively. An `alreadyActivated`
 * Set prevents infinite loops.
 */
export function removeMatches(
  grid: (Tile | null)[][],
  matches: MatchResult[],
): {
  grid: (Tile | null)[][];
  removedCount: number;
  specialsActivated: { pos: Position; special: SpecialType }[];
} {
  const newGrid = grid.map((row) => [...row]);
  const toRemove = new Set<string>();
  const specialsActivated: { pos: Position; special: SpecialType }[] = [];
  const alreadyActivated = new Set<string>(); // Prevent infinite loops

  // Helper: activate a special tile and recursively chain
  function activateSpecial(pos: Position, special: SpecialType) {
    const key = `${pos.row},${pos.col}`;
    if (alreadyActivated.has(key)) return;
    alreadyActivated.add(key);

    specialsActivated.push({ pos, special });
    const targets = getSpecialTileTargets(newGrid, pos, special);
    for (const t of targets) {
      const tKey = `${t.row},${t.col}`;
      if (!toRemove.has(tKey)) {
        toRemove.add(tKey);
        // Check if this newly targeted tile is itself special -> chain reaction
        const tile = newGrid[t.row][t.col];
        if (tile && tile.special !== SpecialType.None) {
          activateSpecial(t, tile.special);
        }
      } else {
        // Already marked for removal, but check if it's a special we haven't activated
        const tile = newGrid[t.row][t.col];
        if (tile && tile.special !== SpecialType.None && !alreadyActivated.has(tKey)) {
          activateSpecial(t, tile.special);
        }
      }
    }
  }

  // First pass: collect all positions to remove, check for special tile activations
  for (const match of matches) {
    for (const pos of match.positions) {
      toRemove.add(`${pos.row},${pos.col}`);
      const tile = newGrid[pos.row][pos.col];
      if (tile && tile.special !== SpecialType.None) {
        activateSpecial(pos, tile.special);
      }
    }
  }

  // Second pass: check all tiles marked for removal that are special but not yet activated
  // (this handles tiles that were in the blast radius but not the original match)
  const keysToCheck = [...toRemove];
  for (const key of keysToCheck) {
    const [r, c] = key.split(",").map(Number);
    const tile = newGrid[r][c];
    if (tile && tile.special !== SpecialType.None && !alreadyActivated.has(key)) {
      activateSpecial({ row: r, col: c }, tile.special);
    }
  }

  // Create special tiles from matches BEFORE removing
  for (const match of matches) {
    if (
      match.specialCreated !== SpecialType.None &&
      match.specialPosition
    ) {
      const pos = match.specialPosition;
      const tile = newGrid[pos.row][pos.col];
      if (tile) {
        newGrid[pos.row][pos.col] = {
          type: tile.type,
          special: match.specialCreated,
        };
        // Don't remove the position where special tile is created
        toRemove.delete(`${pos.row},${pos.col}`);
      }
    }
  }

  // Remove tiles
  let removedCount = 0;
  for (const key of toRemove) {
    const [r, c] = key.split(",").map(Number);
    if (newGrid[r][c] !== null) {
      newGrid[r][c] = null;
      removedCount++;
    }
  }

  return { grid: newGrid, removedCount, specialsActivated };
}

// --- Gravity ---

/**
 * Apply gravity: tiles fall down to fill gaps.
 * Returns movements, new spawns, and the updated grid.
 */
export function applyGravity(
  grid: (Tile | null)[][],
  tileCount: number,
): GravityResult {
  const rows = grid.length;
  const cols = grid[0].length;
  const newGrid = grid.map((row) => [...row]);
  const movements: GravityResult["movements"] = [];
  const spawned: GravityResult["spawned"] = [];

  for (let c = 0; c < cols; c++) {
    // Collect non-null tiles from bottom to top
    const column: (Tile | null)[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (newGrid[r][c] !== null) {
        column.push(newGrid[r][c]);
      }
    }

    // Fill column from bottom
    let writeRow = rows - 1;
    for (let i = 0; i < column.length; i++) {
      const tile = column[i]!;
      const fromRow = rows - 1 - i; // Original position isn't tracked properly
      newGrid[writeRow][c] = tile;
      writeRow--;
    }

    // Track movements: find where each tile actually came from
    // We need to recalculate this properly
    writeRow++;

    // Fill remaining rows with new tiles
    for (let r = writeRow - 1; r >= 0; r--) {
      const tile = randomTile(tileCount);
      newGrid[r][c] = tile;
      spawned.push({ position: { row: r, col: c }, tile });
    }
  }

  // Calculate movements by comparing old and new grids
  // (simplified: just report what's in the new grid)
  for (let c = 0; c < cols; c++) {
    for (let r = grid.length - 1; r >= 0; r--) {
      if (grid[r][c] === null && newGrid[r][c] !== null) {
        // Something fell or spawned here
        // Find where it came from in the old grid
        // (movements are handled by the scene's animation logic)
      }
    }
  }

  return { movements, spawned, grid: newGrid };
}

/**
 * Apply gravity deterministically (for testing).
 */
export function applyGravityDeterministic(
  grid: (Tile | null)[][],
  tileCount: number,
  rng: () => number,
): GravityResult {
  const rows = grid.length;
  const cols = grid[0].length;
  const newGrid = grid.map((row) => [...row]);
  const movements: GravityResult["movements"] = [];
  const spawned: GravityResult["spawned"] = [];

  for (let c = 0; c < cols; c++) {
    // Collect non-null tiles from bottom to top
    const tiles: Tile[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (newGrid[r][c] !== null) {
        tiles.push(newGrid[r][c]!);
      }
    }

    // Write tiles from bottom
    let writeRow = rows - 1;
    for (const tile of tiles) {
      newGrid[writeRow][c] = tile;
      writeRow--;
    }

    // Fill remaining with new tiles
    for (let r = writeRow; r >= 0; r--) {
      const tile = randomTileWithRng(tileCount, rng);
      newGrid[r][c] = tile;
      spawned.push({ position: { row: r, col: c }, tile });
    }
  }

  return { movements, spawned, grid: newGrid };
}

// --- Powerup Combinations ---

/**
 * Get a normalized combo key from two special types (sorted for deterministic lookup).
 */
function getComboKey(a: SpecialType, b: SpecialType): string {
  const sorted = [a, b].sort((x, y) => x - y);
  return `${sorted[0]},${sorted[1]}`;
}

/**
 * Check if two special types form a known combo.
 */
export function isCombo(a: SpecialType, b: SpecialType): boolean {
  if (a === SpecialType.None || b === SpecialType.None) return false;
  return true; // Any two specials form a combo
}

/**
 * Helper to check if a type is a LineBlast (H or V).
 */
function isLineBlast(s: SpecialType): boolean {
  return s === SpecialType.LineBlastH || s === SpecialType.LineBlastV;
}

/**
 * Combine two powerups and return the set of positions to remove.
 * Takes both special types, the position where the combo occurs,
 * the grid, and optionally the color of the normal tile for Rainbow combos.
 */
export function combinePowerups(
  specialA: SpecialType,
  specialB: SpecialType,
  pos: Position,
  grid: (Tile | null)[][],
  _swappedColor?: TileType,
): Position[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const targets: Position[] = [];
  const targetSet = new Set<string>();

  function addTarget(r: number, c: number) {
    if (r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] !== null) {
      const key = `${r},${c}`;
      if (!targetSet.has(key)) {
        targetSet.add(key);
        targets.push({ row: r, col: c });
      }
    }
  }

  // Normalize: put the "bigger" special second for consistent handling
  let sA = specialA;
  let sB = specialB;

  // 1. LineBlast + LineBlast → Cross blast (full row AND full column)
  if (isLineBlast(sA) && isLineBlast(sB)) {
    for (let c = 0; c < cols; c++) addTarget(pos.row, c);
    for (let r = 0; r < rows; r++) addTarget(r, pos.col);
    return targets;
  }

  // 2. Bomb + Bomb → 7x7 mega explosion
  if (sA === SpecialType.Bomb && sB === SpecialType.Bomb) {
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        addTarget(pos.row + dr, pos.col + dc);
      }
    }
    return targets;
  }

  // 3. LineBlast + Bomb → 3-row + 3-column blast
  if ((isLineBlast(sA) && sB === SpecialType.Bomb) || (sA === SpecialType.Bomb && isLineBlast(sB))) {
    // Clear 3 rows centered on pos
    for (let dr = -1; dr <= 1; dr++) {
      for (let c = 0; c < cols; c++) {
        addTarget(pos.row + dr, c);
      }
    }
    // Clear 3 columns centered on pos
    for (let dc = -1; dc <= 1; dc++) {
      for (let r = 0; r < rows; r++) {
        addTarget(r, pos.col + dc);
      }
    }
    return targets;
  }

  // 4. Rainbow + LineBlast → All tiles of the swapped color become LineBlasts and detonate
  if ((sA === SpecialType.Rainbow && isLineBlast(sB)) || (isLineBlast(sA) && sB === SpecialType.Rainbow)) {
    const targetType = _swappedColor ?? findMostCommonType(grid, pos);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = grid[r][c];
        if (tile && tile.type === targetType) {
          // This tile becomes a LineBlast and detonates: clear its row and column
          for (let cc = 0; cc < cols; cc++) addTarget(r, cc);
          for (let rr = 0; rr < rows; rr++) addTarget(rr, c);
        }
      }
    }
    addTarget(pos.row, pos.col);
    return targets;
  }

  // 5. Rainbow + Bomb → All tiles of the swapped color explode in 3x3 each
  if ((sA === SpecialType.Rainbow && sB === SpecialType.Bomb) || (sA === SpecialType.Bomb && sB === SpecialType.Rainbow)) {
    const targetType = _swappedColor ?? findMostCommonType(grid, pos);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = grid[r][c];
        if (tile && tile.type === targetType) {
          // 3x3 explosion around this tile
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              addTarget(r + dr, c + dc);
            }
          }
        }
      }
    }
    addTarget(pos.row, pos.col);
    return targets;
  }

  // 6. Rainbow + Rainbow → Clear entire board
  if (sA === SpecialType.Rainbow && sB === SpecialType.Rainbow) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        addTarget(r, c);
      }
    }
    return targets;
  }

  // 7. Propeller + LineBlast → Clear adjacent 4 tiles + target tile's full row and column
  if ((sA === SpecialType.Propeller && isLineBlast(sB)) || (isLineBlast(sA) && sB === SpecialType.Propeller)) {
    // Clear 4 adjacent tiles
    addTarget(pos.row - 1, pos.col);
    addTarget(pos.row + 1, pos.col);
    addTarget(pos.row, pos.col - 1);
    addTarget(pos.row, pos.col + 1);
    addTarget(pos.row, pos.col);
    // Pick a random target tile
    const available: Position[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== null && !targetSet.has(`${r},${c}`)) {
          available.push({ row: r, col: c });
        }
      }
    }
    if (available.length > 0) {
      const rndTarget = available[Math.floor(Math.random() * available.length)];
      // Clear target's full row and column
      for (let c = 0; c < cols; c++) addTarget(rndTarget.row, c);
      for (let r = 0; r < rows; r++) addTarget(r, rndTarget.col);
    }
    return targets;
  }

  // 8. Propeller + Bomb → Clear adjacent 4 tiles + 5x5 at target
  if ((sA === SpecialType.Propeller && sB === SpecialType.Bomb) || (sA === SpecialType.Bomb && sB === SpecialType.Propeller)) {
    // Clear 4 adjacent tiles
    addTarget(pos.row - 1, pos.col);
    addTarget(pos.row + 1, pos.col);
    addTarget(pos.row, pos.col - 1);
    addTarget(pos.row, pos.col + 1);
    addTarget(pos.row, pos.col);
    // Pick a random target tile
    const available: Position[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== null && !targetSet.has(`${r},${c}`)) {
          available.push({ row: r, col: c });
        }
      }
    }
    if (available.length > 0) {
      const rndTarget = available[Math.floor(Math.random() * available.length)];
      // 5x5 explosion at target
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          addTarget(rndTarget.row + dr, rndTarget.col + dc);
        }
      }
    }
    return targets;
  }

  // 9. Propeller + Propeller → 2 propellers target 2 different random tiles
  if (sA === SpecialType.Propeller && sB === SpecialType.Propeller) {
    // Clear 4 adjacent tiles of the combo position
    addTarget(pos.row - 1, pos.col);
    addTarget(pos.row + 1, pos.col);
    addTarget(pos.row, pos.col - 1);
    addTarget(pos.row, pos.col + 1);
    addTarget(pos.row, pos.col);
    // Pick 2 random target tiles
    const available: Position[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== null && !targetSet.has(`${r},${c}`)) {
          available.push({ row: r, col: c });
        }
      }
    }
    const count = Math.min(2, available.length);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * available.length);
      const rndTarget = available.splice(idx, 1)[0];
      // Clear 4 adjacent tiles of each target
      addTarget(rndTarget.row, rndTarget.col);
      addTarget(rndTarget.row - 1, rndTarget.col);
      addTarget(rndTarget.row + 1, rndTarget.col);
      addTarget(rndTarget.row, rndTarget.col - 1);
      addTarget(rndTarget.row, rndTarget.col + 1);
    }
    return targets;
  }

  // 10. Rainbow + Propeller → 3 propellers target 3 different tiles
  if ((sA === SpecialType.Rainbow && sB === SpecialType.Propeller) || (sA === SpecialType.Propeller && sB === SpecialType.Rainbow)) {
    addTarget(pos.row, pos.col);
    // Pick 3 random target tiles
    const available: Position[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== null && !targetSet.has(`${r},${c}`)) {
          available.push({ row: r, col: c });
        }
      }
    }
    const count = Math.min(3, available.length);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * available.length);
      const rndTarget = available.splice(idx, 1)[0];
      // Clear target + 4 adjacent tiles
      addTarget(rndTarget.row, rndTarget.col);
      addTarget(rndTarget.row - 1, rndTarget.col);
      addTarget(rndTarget.row + 1, rndTarget.col);
      addTarget(rndTarget.row, rndTarget.col - 1);
      addTarget(rndTarget.row, rndTarget.col + 1);
    }
    return targets;
  }

  return targets;
}

/**
 * Helper: find most common tile type on the board, excluding a specific position.
 */
function findMostCommonType(grid: (Tile | null)[][], excludePos: Position): TileType {
  const typeCounts = new Map<TileType, number>();
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      const tile = grid[r][c];
      if (tile && !(r === excludePos.row && c === excludePos.col)) {
        typeCounts.set(tile.type, (typeCounts.get(tile.type) ?? 0) + 1);
      }
    }
  }
  let bestType = TileType.Heart;
  let bestCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestType = type;
    }
  }
  return bestType;
}

// --- Full Match Cycle ---

/**
 * Process a complete swap: validate, find matches, remove, apply gravity, cascade.
 * Detects powerup combos when two special tiles are swapped adjacent to each other.
 * When Rainbow is swapped with a normal tile, uses the normal tile's color.
 * Returns all cascade steps for animation purposes.
 */
export function processSwap(
  grid: (Tile | null)[][],
  a: Position,
  b: Position,
  tileCount: number,
): { valid: boolean; steps: CascadeStep[]; finalGrid: (Tile | null)[][]; totalScore: number } {
  if (!areAdjacent(a, b)) {
    return { valid: false, steps: [], finalGrid: grid, totalScore: 0 };
  }

  const tileA = grid[a.row][a.col];
  const tileB = grid[b.row][b.col];

  // --- Check for powerup combo: both tiles are special ---
  if (
    tileA && tileB &&
    tileA.special !== SpecialType.None &&
    tileB.special !== SpecialType.None
  ) {
    let currentGrid = grid.map((row) => [...row]);
    // Determine swapped color for Rainbow combos
    let swappedColor: TileType | undefined;
    if (tileA.special === SpecialType.Rainbow && tileB.special !== SpecialType.Rainbow) {
      swappedColor = tileB.type;
    } else if (tileB.special === SpecialType.Rainbow && tileA.special !== SpecialType.Rainbow) {
      swappedColor = tileA.type;
    }

    // Use position of tile A (where the combo activates)
    const comboTargets = combinePowerups(tileA.special, tileB.special, a, currentGrid, swappedColor);

    // Remove the two special tiles
    const toRemove = new Set<string>();
    toRemove.add(`${a.row},${a.col}`);
    toRemove.add(`${b.row},${b.col}`);
    for (const t of comboTargets) {
      toRemove.add(`${t.row},${t.col}`);
    }

    // Check for chain reactions: any special tiles in the blast radius
    const alreadyActivated = new Set<string>();
    alreadyActivated.add(`${a.row},${a.col}`);
    alreadyActivated.add(`${b.row},${b.col}`);

    const specialsActivated: { pos: Position; special: SpecialType }[] = [
      { pos: a, special: tileA.special },
      { pos: b, special: tileB.special },
    ];

    // Recursive chain reaction for combo blasts
    function chainFromCombo(keysToCheck: string[]) {
      const newKeys: string[] = [];
      for (const key of keysToCheck) {
        const [r, c] = key.split(",").map(Number);
        const tile = currentGrid[r][c];
        if (tile && tile.special !== SpecialType.None && !alreadyActivated.has(key)) {
          alreadyActivated.add(key);
          specialsActivated.push({ pos: { row: r, col: c }, special: tile.special });
          const targets = getSpecialTileTargets(currentGrid, { row: r, col: c }, tile.special);
          for (const t of targets) {
            const tKey = `${t.row},${t.col}`;
            if (!toRemove.has(tKey)) {
              toRemove.add(tKey);
              newKeys.push(tKey);
            }
          }
        }
      }
      if (newKeys.length > 0) {
        chainFromCombo(newKeys);
      }
    }

    chainFromCombo([...toRemove]);

    // Remove tiles
    let removedCount = 0;
    for (const key of toRemove) {
      const [r, c] = key.split(",").map(Number);
      if (currentGrid[r][c] !== null) {
        currentGrid[r][c] = null;
        removedCount++;
      }
    }

    const stepScore = calculateMatchScore(removedCount, 0, specialsActivated);

    // Apply gravity
    const gravity = applyGravity(currentGrid, tileCount);
    currentGrid = gravity.grid;

    const steps: CascadeStep[] = [{
      matches: [{
        positions: comboTargets,
        specialCreated: SpecialType.None,
        specialPosition: null,
      }],
      gravity,
      chainIndex: 0,
    }];

    let totalScore = stepScore;
    let chainIndex = 1;

    // Continue cascade after combo
    let matches = findMatches(currentGrid);
    while (matches.length > 0) {
      const { grid: gridAfterRemoval, removedCount: rc, specialsActivated: sa } =
        removeMatches(currentGrid, matches);
      const cascadeScore = calculateMatchScore(rc, chainIndex, sa);
      totalScore += cascadeScore;
      const grav = applyGravity(gridAfterRemoval, tileCount);
      currentGrid = grav.grid;
      steps.push({ matches, gravity: grav, chainIndex });
      matches = findMatches(currentGrid);
      chainIndex++;
    }

    return { valid: true, steps, finalGrid: currentGrid, totalScore };
  }

  // --- Check for Rainbow + normal tile swap (player-chosen color) ---
  if (tileA && tileB) {
    const rainbowAtA = tileA.special === SpecialType.Rainbow;
    const rainbowAtB = tileB.special === SpecialType.Rainbow;
    if ((rainbowAtA && tileB.special === SpecialType.None) ||
        (rainbowAtB && tileA.special === SpecialType.None)) {
      let currentGrid = grid.map((row) => [...row]);
      const rainbowPos = rainbowAtA ? a : b;
      const normalPos = rainbowAtA ? b : a;
      const normalTile = rainbowAtA ? tileB : tileA;
      const chosenColor = normalTile.type;

      // Clear all tiles of the chosen color + the rainbow tile
      const toRemove = new Set<string>();
      toRemove.add(`${rainbowPos.row},${rainbowPos.col}`);
      const specialsActivated: { pos: Position; special: SpecialType }[] = [
        { pos: rainbowPos, special: SpecialType.Rainbow },
      ];

      for (let r = 0; r < currentGrid.length; r++) {
        for (let c = 0; c < currentGrid[0].length; c++) {
          const tile = currentGrid[r][c];
          if (tile && tile.type === chosenColor) {
            toRemove.add(`${r},${c}`);
          }
        }
      }

      // Chain reactions from removed specials
      const alreadyActivated = new Set<string>();
      alreadyActivated.add(`${rainbowPos.row},${rainbowPos.col}`);

      function chainFromRainbow(keysToCheck: string[]) {
        const newKeys: string[] = [];
        for (const key of keysToCheck) {
          const [r, c] = key.split(",").map(Number);
          const tile = currentGrid[r][c];
          if (tile && tile.special !== SpecialType.None && !alreadyActivated.has(key)) {
            alreadyActivated.add(key);
            specialsActivated.push({ pos: { row: r, col: c }, special: tile.special });
            const targets = getSpecialTileTargets(currentGrid, { row: r, col: c }, tile.special);
            for (const t of targets) {
              const tKey = `${t.row},${t.col}`;
              if (!toRemove.has(tKey)) {
                toRemove.add(tKey);
                newKeys.push(tKey);
              }
            }
          }
        }
        if (newKeys.length > 0) {
          chainFromRainbow(newKeys);
        }
      }

      chainFromRainbow([...toRemove]);

      let removedCount = 0;
      for (const key of toRemove) {
        const [r, c] = key.split(",").map(Number);
        if (currentGrid[r][c] !== null) {
          currentGrid[r][c] = null;
          removedCount++;
        }
      }

      const stepScore = calculateMatchScore(removedCount, 0, specialsActivated);
      const gravity = applyGravity(currentGrid, tileCount);
      currentGrid = gravity.grid;

      const allRemoved: Position[] = [];
      for (const key of toRemove) {
        const [r, c] = key.split(",").map(Number);
        allRemoved.push({ row: r, col: c });
      }

      const steps: CascadeStep[] = [{
        matches: [{
          positions: allRemoved,
          specialCreated: SpecialType.None,
          specialPosition: null,
        }],
        gravity,
        chainIndex: 0,
      }];

      let totalScore = stepScore;
      let chainIndex = 1;

      let matches = findMatches(currentGrid);
      while (matches.length > 0) {
        const { grid: gridAfterRemoval, removedCount: rc, specialsActivated: sa } =
          removeMatches(currentGrid, matches);
        const cascadeScore = calculateMatchScore(rc, chainIndex, sa);
        totalScore += cascadeScore;
        const grav = applyGravity(gridAfterRemoval, tileCount);
        currentGrid = grav.grid;
        steps.push({ matches, gravity: grav, chainIndex });
        matches = findMatches(currentGrid);
        chainIndex++;
      }

      return { valid: true, steps, finalGrid: currentGrid, totalScore };
    }
  }

  // --- Normal swap (no combo, no rainbow+normal) ---
  // Perform the swap
  let currentGrid = swapTiles(grid, a, b);

  // Check for matches
  const initialMatches = findMatches(currentGrid);
  if (initialMatches.length === 0) {
    // Invalid swap - no matches created
    return { valid: false, steps: [], finalGrid: grid, totalScore: 0 };
  }

  // Process cascades
  const steps: CascadeStep[] = [];
  let totalScore = 0;
  let chainIndex = 0;

  let matches = initialMatches;
  while (matches.length > 0) {
    // Remove matched tiles
    const { grid: gridAfterRemoval, removedCount, specialsActivated } =
      removeMatches(currentGrid, matches);

    // Calculate score for this step
    const stepScore = calculateMatchScore(
      removedCount,
      chainIndex,
      specialsActivated,
    );
    totalScore += stepScore;

    // Apply gravity
    const gravity = applyGravity(gridAfterRemoval, tileCount);
    currentGrid = gravity.grid;

    steps.push({ matches, gravity, chainIndex });

    // Check for new matches (cascade)
    matches = findMatches(currentGrid);
    chainIndex++;
  }

  return { valid: true, steps, finalGrid: currentGrid, totalScore };
}

// --- Score Calculation ---

export function calculateMatchScore(
  removedCount: number,
  chainIndex: number,
  specialsActivated: { pos: Position; special: SpecialType }[],
): number {
  const baseScore = removedCount * BASE_POINTS_PER_TILE;
  const multiplier = 1 + chainIndex * CHAIN_MULTIPLIER_BONUS;

  let specialBonus = 0;
  for (const s of specialsActivated) {
    switch (s.special) {
      case SpecialType.LineBlastH:
      case SpecialType.LineBlastV:
        specialBonus += LINE_BLAST_BONUS;
        break;
      case SpecialType.Bomb:
        specialBonus += BOMB_BONUS;
        break;
      case SpecialType.Rainbow:
        specialBonus += RAINBOW_BONUS;
        break;
      case SpecialType.Propeller:
        specialBonus += PROPELLER_BONUS;
        break;
    }
  }

  return Math.floor(baseScore * multiplier + specialBonus);
}

// --- Game State Management ---

export function createGameState(levelConfig: LevelConfig): GameState {
  const grid = createGrid(
    levelConfig.gridSize,
    levelConfig.gridSize,
    levelConfig.tileCount,
  );

  return {
    grid,
    score: 0,
    movesRemaining: levelConfig.moves,
    level: levelConfig.level,
    targetScore: levelConfig.targetScore,
    chainMultiplier: 1,
    combo: 0,
    levelsCompleted: 0,
    showQuestion: false,
    bonusMoves: 0,
    gameOver: false,
    levelComplete: false,
  };
}

export function applyMove(
  state: GameState,
  a: Position,
  b: Position,
  tileCount: number,
): {
  state: GameState;
  steps: CascadeStep[];
  valid: boolean;
  scoreGained: number;
} {
  const { valid, steps, finalGrid, totalScore } = processSwap(
    state.grid,
    a,
    b,
    tileCount,
  );

  if (!valid) {
    return { state, steps: [], valid: false, scoreGained: 0 };
  }

  const newScore = state.score + totalScore;
  const newMoves = state.movesRemaining - 1;
  const levelComplete = newScore >= state.targetScore;
  const gameOver = newMoves <= 0 && !levelComplete;

  return {
    state: {
      ...state,
      grid: finalGrid,
      score: newScore,
      movesRemaining: newMoves,
      combo: steps.length > 1 ? steps.length : 0,
      levelComplete,
      gameOver,
    },
    steps,
    valid: true,
    scoreGained: totalScore,
  };
}

export function advanceLevel(
  state: GameState,
  levelConfig: LevelConfig,
  bonusMoves: number,
): GameState {
  const shouldShowQuestion =
    state.levelsCompleted > 0 && state.levelsCompleted % 2 === 0;

  const grid = createGrid(
    levelConfig.gridSize,
    levelConfig.gridSize,
    levelConfig.tileCount,
  );

  return {
    ...state,
    grid,
    score: 0,
    movesRemaining: levelConfig.moves + bonusMoves,
    level: levelConfig.level,
    targetScore: levelConfig.targetScore,
    levelsCompleted: state.levelsCompleted + 1,
    showQuestion: shouldShowQuestion,
    bonusMoves: 0,
    levelComplete: false,
    gameOver: false,
  };
}

export function calculateStars(
  score: number,
  thresholds: [number, number, number],
): number {
  if (score >= thresholds[2]) return 3;
  if (score >= thresholds[1]) return 2;
  if (score >= thresholds[0]) return 1;
  return 0;
}

// --- Hint System ---

/**
 * Find a valid swap that would create a match.
 * Returns null if no valid moves exist (grid should be reshuffled).
 */
export function findValidMove(
  grid: (Tile | null)[][],
): { a: Position; b: Position } | null {
  const rows = grid.length;
  const cols = grid[0].length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Try swap right
      if (c + 1 < cols) {
        const swapped = swapTiles(grid, { row: r, col: c }, { row: r, col: c + 1 });
        if (findMatches(swapped).length > 0) {
          return { a: { row: r, col: c }, b: { row: r, col: c + 1 } };
        }
      }
      // Try swap down
      if (r + 1 < rows) {
        const swapped = swapTiles(grid, { row: r, col: c }, { row: r + 1, col: c });
        if (findMatches(swapped).length > 0) {
          return { a: { row: r, col: c }, b: { row: r + 1, col: c } };
        }
      }
    }
  }

  return null;
}

/**
 * Reshuffle the grid while preserving special tiles, ensuring no initial matches
 * and at least one valid move exists.
 */
export function reshuffleGrid(
  grid: (Tile | null)[][],
  tileCount: number,
): (Tile | null)[][] {
  const rows = grid.length;
  const cols = grid[0].length;

  // Keep trying until we get a valid grid
  for (let attempt = 0; attempt < 100; attempt++) {
    const newGrid = createGrid(rows, cols, tileCount);

    // Preserve special tiles from the original grid
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const orig = grid[r][c];
        if (orig && orig.special !== SpecialType.None) {
          newGrid[r][c] = orig;
        }
      }
    }

    if (findValidMove(newGrid) !== null) {
      return newGrid;
    }
  }

  // Fallback: just return a fresh grid
  return createGrid(rows, cols, tileCount);
}

// --- Tile Info ---

export const TILE_NAMES: Record<TileType, string> = {
  [TileType.Heart]: "Love",
  [TileType.Star]: "Faith",
  [TileType.Cross]: "Hope",
  [TileType.Dove]: "Peace",
  [TileType.Crown]: "Victory",
  [TileType.Scroll]: "Wisdom",
};

export const TILE_COLORS: Record<TileType, number> = {
  [TileType.Heart]: 0xe74c3c, // Red
  [TileType.Star]: 0xf1c40f, // Yellow
  [TileType.Cross]: 0x3498db, // Blue
  [TileType.Dove]: 0x2ecc71, // Green
  [TileType.Crown]: 0x9b59b6, // Purple
  [TileType.Scroll]: 0xe67e22, // Orange
};

export const TILE_ICONS: Record<TileType, string> = {
  [TileType.Heart]: "\u2764",
  [TileType.Star]: "\u2605",
  [TileType.Cross]: "\u271A",
  [TileType.Dove]: "\u2660", // Using spade as dove placeholder in text
  [TileType.Crown]: "\u265B",
  [TileType.Scroll]: "\u2706",
};

export const SPECIAL_COLORS: Record<SpecialType, number> = {
  [SpecialType.None]: 0xffffff,
  [SpecialType.LineBlastH]: 0x00ffff,
  [SpecialType.LineBlastV]: 0x00ffff,
  [SpecialType.Bomb]: 0xff6600,
  [SpecialType.Rainbow]: 0xffffff,
  [SpecialType.Propeller]: 0x66ff66,
};
