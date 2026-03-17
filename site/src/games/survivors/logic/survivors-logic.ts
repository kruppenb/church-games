/**
 * Pure TypeScript game logic for the Vampire Survivors-style game.
 * No Phaser or DOM dependencies — extracted for testability.
 */

export interface WeaponUpgrade {
  name: string;
  type: "fire-ring" | "lightning" | "shield";
  description: string;
}

/** Persistent weapon with level tracking */
export interface OwnedWeapon {
  type: "fire-ring" | "lightning" | "shield";
  level: number; // 1-3
}

export interface SurvivorsState {
  playerHp: number;
  maxHp: number;
  score: number;
  enemiesDefeated: number;
  questionsCorrect: number;
  questionsTotal: number;
  currentWave: number;
  enemySpeedMultiplier: number;
  enemySpawnMultiplier: number;
  weapons: OwnedWeapon[];
  gameOver: boolean;
  victory: boolean;
  elapsedSeconds: number;
}

export const MAX_WEAPON_LEVEL = 3;

export const WEAPON_OPTIONS: WeaponUpgrade[] = [
  {
    name: "Fire Ring",
    type: "fire-ring",
    description: "Periodic AoE burst around you",
  },
  {
    name: "Lightning Bolt",
    type: "lightning",
    description: "Chain attack zaps nearby enemies",
  },
  {
    name: "Holy Shield",
    type: "shield",
    description: "Regenerate HP over time",
  },
];

/** Creates the initial state for a new survivors game. */
export function createInitialState(): SurvivorsState {
  return {
    playerHp: 10,
    maxHp: 10,
    score: 0,
    enemiesDefeated: 0,
    questionsCorrect: 0,
    questionsTotal: 0,
    currentWave: 1,
    enemySpeedMultiplier: 1,
    enemySpawnMultiplier: 1,
    weapons: [],
    gameOver: false,
    victory: false,
    elapsedSeconds: 0,
  };
}

/**
 * Processes an answer to a question.
 * - Correct: questionsCorrect++, score += 200.
 * - Wrong: enemySpeedMultiplier *= 1.2, enemySpawnMultiplier *= 2.
 * Always increments questionsTotal.
 */
export function answerQuestion(
  state: SurvivorsState,
  correct: boolean,
): SurvivorsState {
  const next = { ...state, questionsTotal: state.questionsTotal + 1 };

  if (correct) {
    return {
      ...next,
      questionsCorrect: next.questionsCorrect + 1,
      score: next.score + 200,
    };
  }

  return {
    ...next,
    enemySpeedMultiplier: next.enemySpeedMultiplier * 1.2,
    enemySpawnMultiplier: next.enemySpawnMultiplier * 2,
  };
}

/**
 * Adds or upgrades a weapon. If player already owns it, level++ (up to MAX_WEAPON_LEVEL).
 * If not owned, adds it at level 1.
 */
export function addWeapon(
  state: SurvivorsState,
  weapon: WeaponUpgrade,
): SurvivorsState {
  const existing = state.weapons.find((w) => w.type === weapon.type);
  if (existing) {
    // Upgrade — cap at max level
    const newLevel = Math.min(existing.level + 1, MAX_WEAPON_LEVEL);
    return {
      ...state,
      weapons: state.weapons.map((w) =>
        w.type === weapon.type ? { ...w, level: newLevel } : w,
      ),
    };
  }
  // New weapon at level 1
  return {
    ...state,
    weapons: [...state.weapons, { type: weapon.type, level: 1 }],
  };
}

/** Get the level of a weapon the player owns (0 if not owned). */
export function getWeaponLevel(
  state: SurvivorsState,
  type: OwnedWeapon["type"],
): number {
  const w = state.weapons.find((w) => w.type === type);
  return w ? w.level : 0;
}

/**
 * Records an enemy defeat.
 * enemiesDefeated++, score += 10.
 */
export function defeatEnemy(state: SurvivorsState): SurvivorsState {
  return {
    ...state,
    enemiesDefeated: state.enemiesDefeated + 1,
    score: state.score + 10,
  };
}

/**
 * Applies damage to the player.
 * playerHp -= amount (clamped to 0). Sets gameOver if HP reaches 0.
 */
export function takeDamage(
  state: SurvivorsState,
  amount: number,
): SurvivorsState {
  const newHp = Math.max(0, state.playerHp - amount);
  return {
    ...state,
    playerHp: newHp,
    gameOver: newHp <= 0,
  };
}

/**
 * Heals the player (clamped to maxHp).
 */
export function healPlayer(
  state: SurvivorsState,
  amount: number,
): SurvivorsState {
  return {
    ...state,
    playerHp: Math.min(state.maxHp, state.playerHp + amount),
  };
}

/**
 * Calculates star rating.
 * - 3 stars: questionsCorrect >= 80% of questionsTotal AND survived
 * - 2 stars: questionsCorrect >= 50% of questionsTotal AND survived
 * - 1 star: otherwise
 */
export function calculateStars(state: SurvivorsState): number {
  const survived = !state.gameOver || state.victory;
  const ratio =
    state.questionsTotal > 0
      ? state.questionsCorrect / state.questionsTotal
      : 0;

  if (survived && ratio >= 0.8) return 3;
  if (survived && ratio >= 0.5) return 2;
  return 1;
}

/** Returns true when the game is over (player dead, victory, or time expired). */
export function isGameOver(state: SurvivorsState): boolean {
  return state.gameOver || state.victory;
}
