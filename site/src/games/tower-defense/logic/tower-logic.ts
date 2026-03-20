/**
 * Pure TypeScript game logic for the Faith Fortress tower defense game.
 * No Phaser or DOM dependencies -- extracted for testability.
 */

export type TowerType = "prayer" | "light" | "bell" | "shield" | "praise" | "shepherd";
export type EnemyType = "worry" | "doubt" | "fear";

export interface TowerDef {
  type: TowerType;
  cost: number;
  range: number[]; // per-level stats (level 1 through MAX_TOWER_LEVEL)
  damage: number[];
  attackSpeed: number[]; // ms between attacks
  upgradeCost: number; // base upgrade cost (scales with level)
  color: number;
  label: string;
}

export interface EnemyDef {
  type: EnemyType;
  hp: number;
  speed: number; // px/s
  villageDamage: number;
  color: number;
  size: number; // radius in px
  label: string;
}

export interface TowerState {
  id: number;
  type: TowerType;
  level: number; // 1 through MAX_TOWER_LEVEL
  spotIndex: number;
}

export interface GameState {
  coins: number;
  villageHp: number;
  maxVillageHp: number;
  wave: number;
  totalWaves: number;
  towers: TowerState[];
  questionsCorrect: number;
  questionsTotal: number;
  phase: "intro" | "question" | "placement" | "wave" | "victory" | "defeat";
  difficulty: "little-kids" | "big-kids";
  nextTowerId: number;
}

export interface WaveConfig {
  enemies: EnemyType[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_TOWER_LEVEL = 5;

export const WAVE_COUNT = 30;

export const TOWER_DEFS: Record<TowerType, TowerDef> = {
  prayer: {
    type: "prayer",
    cost: 75,
    range: [100, 140, 170, 200, 230],
    damage: [1, 1, 2, 2, 3],
    attackSpeed: [3000, 2000, 1500, 1200, 800],
    upgradeCost: 75,
    color: 0x4488ff,
    label: "Prayer",
  },
  light: {
    type: "light",
    cost: 100,
    range: [120, 120, 140, 160, 180],
    damage: [2, 3, 5, 7, 10],
    attackSpeed: [1500, 1000, 800, 650, 500],
    upgradeCost: 75,
    color: 0xffdd00,
    label: "Light",
  },
  bell: {
    type: "bell",
    cost: 125,
    range: [80, 100, 120, 140, 160],
    damage: [1, 2, 3, 5, 7],
    attackSpeed: [3000, 2500, 2000, 1600, 1200],
    upgradeCost: 75,
    color: 0xaa44ff,
    label: "Bell",
  },
  shield: {
    type: "shield",
    cost: 100,
    range: [100, 120, 140, 160, 180],
    damage: [0, 0, 0, 0, 0], // Does not attack
    attackSpeed: [9999, 9999, 9999, 9999, 9999], // N/A
    upgradeCost: 75,
    color: 0x44cc44,
    label: "Shield",
  },
  praise: {
    type: "praise",
    cost: 150,
    range: [9999, 9999, 9999, 9999, 9999], // Hits all enemies on screen
    damage: [5, 8, 12, 18, 25],
    attackSpeed: [10000, 8000, 7000, 6000, 5000], // Charge time
    upgradeCost: 75,
    color: 0xffaa00,
    label: "Praise",
  },
  shepherd: {
    type: "shepherd",
    cost: 125,
    range: [120, 140, 160, 180, 200],
    damage: [0, 0, 0, 0, 0], // No damage, pure CC
    attackSpeed: [4000, 3500, 3000, 2500, 2000],
    upgradeCost: 75,
    color: 0xffffff,
    label: "Shepherd",
  },
};

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  worry: {
    type: "worry",
    hp: 3,
    speed: 40,
    villageDamage: 1,
    color: 0xaaaaaa,
    size: 10,
    label: "Worry Cloud",
  },
  doubt: {
    type: "doubt",
    hp: 6,
    speed: 60,
    villageDamage: 1,
    color: 0x6644aa,
    size: 14,
    label: "Doubt Shadow",
  },
  fear: {
    type: "fear",
    hp: 15,
    speed: 30,
    villageDamage: 2,
    color: 0xaa2222,
    size: 20,
    label: "Fear Giant",
  },
};

export const PRAYER_SLOW_FACTOR = [0, 0.4, 0.55, 0.65, 0.75, 0.82]; // index = level (0 unused)

/** Shield Tower damage buff percentages per level. index = level (0 unused) */
export const SHIELD_BUFF_FACTOR = [0, 0.25, 0.30, 0.35, 0.40, 0.50];

/** Shepherd Tower pushback distance per level. index = level (0 unused) */
export const SHEPHERD_PUSHBACK = [0, 30, 40, 50, 60, 80];

/** Starting coins by difficulty. */
const STARTING_COINS: Record<"little-kids" | "big-kids", number> = {
  "little-kids": 200,
  "big-kids": 150,
};

// ---------------------------------------------------------------------------
// Wave generation
// ---------------------------------------------------------------------------

/** Generate 30 waves with progressive difficulty. */
function generateWaves(difficulty: "little-kids" | "big-kids"): WaveConfig[] {
  const waves: WaveConfig[] = [];
  // Big-kids acts 2 waves ahead in enemy composition
  const offset = difficulty === "big-kids" ? 2 : 0;

  for (let w = 1; w <= WAVE_COUNT; w++) {
    const eff = w + offset;
    const enemies: EnemyType[] = [];

    // Worry: stays 3-5, providing base density
    const worry = Math.max(1, Math.min(5, Math.round(3 + Math.min(eff * 0.1, 2))));
    // Doubt: introduced at effective wave 3, ramps to 10
    const doubt = eff >= 3 ? Math.min(10, Math.round((eff - 1) * 0.5)) : 0;
    // Fear: introduced at effective wave 6, ramps to 8
    const fear = eff >= 6 ? Math.min(8, Math.round((eff - 4) * 0.35)) : 0;

    for (let i = 0; i < worry; i++) enemies.push("worry");
    for (let i = 0; i < doubt; i++) enemies.push("doubt");
    for (let i = 0; i < fear; i++) enemies.push("fear");

    waves.push({ enemies });
  }
  return waves;
}

// ---------------------------------------------------------------------------
// State functions
// ---------------------------------------------------------------------------

/** Creates a fresh game state for the given difficulty. */
export function createInitialState(
  difficulty: "little-kids" | "big-kids",
): GameState {
  return {
    coins: STARTING_COINS[difficulty],
    villageHp: 10,
    maxVillageHp: 10,
    wave: 0, // 0 = before wave 1
    totalWaves: WAVE_COUNT,
    towers: [],
    questionsCorrect: 0,
    questionsTotal: 0,
    phase: "intro",
    difficulty,
    nextTowerId: 1,
  };
}

/** Returns wave configs for the given difficulty. */
export function getWaves(
  difficulty: "little-kids" | "big-kids",
): WaveConfig[] {
  return generateWaves(difficulty);
}

/** Whether the player can afford a given tower type. */
export function canAfford(state: GameState, towerType: TowerType): boolean {
  return state.coins >= TOWER_DEFS[towerType].cost;
}

/** Cost to upgrade a tower from its current level. Scales with level. */
export function getUpgradeCost(towerType: TowerType, currentLevel: number): number {
  const base = TOWER_DEFS[towerType].upgradeCost;
  // 1→2: 75, 2→3: 100, 3→4: 125, 4→5: 150
  return base + (currentLevel - 1) * 25;
}

/** Whether the player can upgrade a given tower (exists, below max level, and affordable). */
export function canUpgrade(state: GameState, towerId: number): boolean {
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower || tower.level >= MAX_TOWER_LEVEL) return false;
  return state.coins >= getUpgradeCost(tower.type, tower.level);
}

/** Place a new tower on a placement spot. Returns new state with tower added and coins deducted. */
export function placeTower(
  state: GameState,
  towerType: TowerType,
  spotIndex: number,
): GameState {
  const def = TOWER_DEFS[towerType];
  if (state.coins < def.cost) return state;

  // Don't allow placing on an occupied spot
  if (state.towers.some((t) => t.spotIndex === spotIndex)) return state;

  const newTower: TowerState = {
    id: state.nextTowerId,
    type: towerType,
    level: 1,
    spotIndex,
  };
  return {
    ...state,
    coins: state.coins - def.cost,
    towers: [...state.towers, newTower],
    nextTowerId: state.nextTowerId + 1,
  };
}

/** Upgrade a tower to next level. Returns new state with coins deducted. */
export function upgradeTower(state: GameState, towerId: number): GameState {
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower || tower.level >= MAX_TOWER_LEVEL) return state;

  const cost = getUpgradeCost(tower.type, tower.level);
  if (state.coins < cost) return state;

  return {
    ...state,
    coins: state.coins - cost,
    towers: state.towers.map((t) =>
      t.id === towerId ? { ...t, level: t.level + 1 } : t,
    ),
  };
}

/** Process a question answer. Correct: +100 coins, +1 village HP. Wrong: +50 coins. */
export function answerQuestion(state: GameState, correct: boolean): GameState {
  if (correct) {
    return {
      ...state,
      coins: state.coins + 100,
      questionsCorrect: state.questionsCorrect + 1,
      questionsTotal: state.questionsTotal + 1,
      villageHp: Math.min(state.villageHp + 1, state.maxVillageHp),
    };
  }
  return {
    ...state,
    coins: state.coins + 50,
    questionsTotal: state.questionsTotal + 1,
  };
}

/** Record an enemy defeat: +5 coins. */
export function enemyDefeated(state: GameState): GameState {
  return {
    ...state,
    coins: state.coins + 5,
  };
}

/**
 * Record an enemy leaking through to the village.
 * Little-kids waves 1-2: enemies do 0 damage (learning period).
 */
export function enemyLeaked(
  state: GameState,
  enemyType: EnemyType,
  waveNumber: number,
): GameState {
  // Learning period: first 2 waves for little-kids do no damage
  if (state.difficulty === "little-kids" && waveNumber <= 2) {
    return state;
  }
  const damage = ENEMY_DEFS[enemyType].villageDamage;
  const newHp = Math.max(0, state.villageHp - damage);
  return {
    ...state,
    villageHp: newHp,
    phase: newHp <= 0 ? "defeat" : state.phase,
  };
}

/** Transition to wave phase, incrementing wave counter and adding passive income. */
export function startWave(state: GameState): GameState {
  return {
    ...state,
    wave: state.wave + 1,
    phase: "wave",
  };
}

/** Mark wave complete, add passive income +25. */
export function completeWave(state: GameState): GameState {
  const isLastWave = state.wave >= state.totalWaves;
  return {
    ...state,
    coins: state.coins + 25,
    phase: isLastWave ? "victory" : "question",
  };
}

/** Calculate star rating based on remaining village HP. */
export function calculateStars(state: GameState): number {
  if (state.villageHp >= 8) return 3;
  if (state.villageHp >= 5) return 2;
  if (state.villageHp >= 1) return 1;
  return 0;
}

/** Check if village has been destroyed. */
export function isVillageDestroyed(state: GameState): boolean {
  return state.villageHp <= 0;
}

/**
 * Calculate the damage buff a tower receives from nearby Shield Towers.
 * @param towerX - X position of the tower to check
 * @param towerY - Y position of the tower to check
 * @param towers - All placed towers with positions
 * @param spotPositions - Array of {x,y} for each spot index
 * @returns Buff multiplier (e.g. 0.25 means +25% damage)
 */
export function getShieldBuff(
  towerX: number,
  towerY: number,
  towers: TowerState[],
  spotPositions: { x: number; y: number }[],
): number {
  let maxBuff = 0;
  for (const t of towers) {
    if (t.type !== "shield") continue;
    const spot = spotPositions[t.spotIndex];
    if (!spot) continue;
    const range = TOWER_DEFS.shield.range[t.level - 1];
    const dx = towerX - spot.x;
    const dy = towerY - spot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= range) {
      const buff = SHIELD_BUFF_FACTOR[t.level];
      if (buff > maxBuff) maxBuff = buff;
    }
  }
  return maxBuff;
}

/**
 * Calculate sell refund for a tower (50% of total investment).
 * Total investment = base cost + sum of all upgrade costs paid.
 */
export function getSellRefund(towerType: TowerType, currentLevel: number): number {
  const baseCost = TOWER_DEFS[towerType].cost;
  let totalInvestment = baseCost;
  for (let l = 1; l < currentLevel; l++) {
    totalInvestment += getUpgradeCost(towerType, l);
  }
  return Math.floor(totalInvestment * 0.5);
}

/** Sell an existing tower. Returns new state with tower removed and refund added. */
export function sellTower(state: GameState, towerId: number): GameState {
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower) return state;
  const refund = getSellRefund(tower.type, tower.level);
  return {
    ...state,
    coins: state.coins + refund,
    towers: state.towers.filter((t) => t.id !== towerId),
  };
}
