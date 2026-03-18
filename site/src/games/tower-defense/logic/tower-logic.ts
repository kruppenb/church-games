/**
 * Pure TypeScript game logic for the Faith Fortress tower defense game.
 * No Phaser or DOM dependencies -- extracted for testability.
 */

export type TowerType = "prayer" | "light" | "bell";
export type EnemyType = "worry" | "doubt" | "fear";

export interface TowerDef {
  type: TowerType;
  cost: number;
  range: number[]; // [level1, level2]
  damage: number[]; // [level1, level2]
  attackSpeed: number[]; // ms between attacks [level1, level2]
  upgradeCost: number;
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
  level: number; // 1 or 2
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

export const TOWER_DEFS: Record<TowerType, TowerDef> = {
  prayer: {
    type: "prayer",
    cost: 75,
    range: [100, 140],
    damage: [1, 1],
    attackSpeed: [3000, 2000], // slow aura tick rate
    upgradeCost: 75,
    color: 0x4488ff,
    label: "Prayer",
  },
  light: {
    type: "light",
    cost: 100,
    range: [120, 120],
    damage: [2, 3],
    attackSpeed: [1500, 1000],
    upgradeCost: 75,
    color: 0xffdd00,
    label: "Light",
  },
  bell: {
    type: "bell",
    cost: 125,
    range: [80, 100],
    damage: [1, 2],
    attackSpeed: [3000, 2500],
    upgradeCost: 75,
    color: 0xaa44ff,
    label: "Bell",
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

export const PRAYER_SLOW_FACTOR = [0, 0.4, 0.6]; // level 0 (unused), level 1, level 2

/** Starting coins by difficulty. */
const STARTING_COINS: Record<"little-kids" | "big-kids", number> = {
  "little-kids": 200,
  "big-kids": 150,
};

// ---------------------------------------------------------------------------
// Wave definitions
// ---------------------------------------------------------------------------

const LITTLE_KIDS_WAVES: WaveConfig[] = [
  { enemies: ["worry", "worry", "worry"] },
  { enemies: ["worry", "worry", "worry", "worry", "worry"] },
  {
    enemies: ["worry", "worry", "worry", "worry", "doubt", "doubt"],
  },
  {
    enemies: ["worry", "worry", "worry", "doubt", "doubt", "doubt", "doubt"],
  },
  {
    enemies: [
      "worry",
      "worry",
      "doubt",
      "doubt",
      "doubt",
      "doubt",
      "fear",
      "fear",
    ],
  },
];

const BIG_KIDS_WAVES: WaveConfig[] = [
  { enemies: ["worry", "worry", "worry", "worry"] },
  {
    enemies: ["worry", "worry", "worry", "worry", "doubt", "doubt"],
  },
  {
    enemies: ["worry", "worry", "worry", "doubt", "doubt", "doubt", "doubt"],
  },
  {
    enemies: [
      "worry",
      "worry",
      "doubt",
      "doubt",
      "doubt",
      "doubt",
      "fear",
      "fear",
    ],
  },
  {
    enemies: [
      "worry",
      "doubt",
      "doubt",
      "doubt",
      "doubt",
      "doubt",
      "fear",
      "fear",
      "fear",
    ],
  },
  {
    enemies: [
      "worry",
      "worry",
      "doubt",
      "doubt",
      "doubt",
      "doubt",
      "fear",
      "fear",
      "fear",
      "fear",
    ],
  },
];

// ---------------------------------------------------------------------------
// State functions
// ---------------------------------------------------------------------------

/** Creates a fresh game state for the given difficulty. */
export function createInitialState(
  difficulty: "little-kids" | "big-kids",
): GameState {
  const waves = difficulty === "little-kids" ? LITTLE_KIDS_WAVES : BIG_KIDS_WAVES;
  return {
    coins: STARTING_COINS[difficulty],
    villageHp: 10,
    maxVillageHp: 10,
    wave: 0, // 0 = before wave 1
    totalWaves: waves.length,
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
  return difficulty === "little-kids" ? LITTLE_KIDS_WAVES : BIG_KIDS_WAVES;
}

/** Whether the player can afford a given tower type. */
export function canAfford(state: GameState, towerType: TowerType): boolean {
  return state.coins >= TOWER_DEFS[towerType].cost;
}

/** Whether the player can upgrade a given tower (exists and affordable). */
export function canUpgrade(state: GameState, towerId: number): boolean {
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower || tower.level >= 2) return false;
  return state.coins >= TOWER_DEFS[tower.type].upgradeCost;
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

/** Upgrade a tower to level 2. Returns new state with coins deducted. */
export function upgradeTower(state: GameState, towerId: number): GameState {
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower || tower.level >= 2) return state;

  const def = TOWER_DEFS[tower.type];
  if (state.coins < def.upgradeCost) return state;

  return {
    ...state,
    coins: state.coins - def.upgradeCost,
    towers: state.towers.map((t) =>
      t.id === towerId ? { ...t, level: 2 } : t,
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
