/**
 * Pure TypeScript game logic for the Vampire Survivors-style game.
 * No Phaser or DOM dependencies — extracted for testability.
 */

export type WeaponType = "fire-ring" | "lightning" | "shield" | "orbit" | "holy-water" | "axe" | "beam";

export type EvolvedWeaponType = "baptism-of-fire" | "storm-of-judgment" | "divine-aegis" | "celestial-vortex";

export interface WeaponUpgrade {
  name: string;
  type: WeaponType;
  description: string;
}

/** Persistent weapon with level tracking */
export interface OwnedWeapon {
  type: WeaponType;
  level: number; // 1-3
}

/** Evolution recipe: combine two max-level weapons into a super-weapon */
export interface EvolutionRecipe {
  id: EvolvedWeaponType;
  name: string;
  description: string;
  ingredients: [WeaponType, WeaponType];
  icon: string;
}

/** XP bonus types from filling the orb bar */
export type XpBonusType = "score" | "speed" | "weapon-charge";

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
  evolvedWeapons: EvolvedWeaponType[];
  xpOrbs: number;
  xpOrbsToNext: number;
  xpBonusCount: number;
  gameOver: boolean;
  victory: boolean;
  elapsedSeconds: number;
}

export const MAX_WEAPON_LEVEL = 3;

/** XP orbs required to fill the bar (increases each time) */
export const BASE_XP_TO_NEXT = 15;
export const XP_SCALING = 5; // each bonus adds this many more orbs needed

export const WEAPON_OPTIONS: WeaponUpgrade[] = [
  { name: "Fire Ring", type: "fire-ring", description: "Periodic AoE burst around you" },
  { name: "Lightning Bolt", type: "lightning", description: "Chain attack zaps nearby enemies" },
  { name: "Holy Shield", type: "shield", description: "Regenerate HP over time" },
  { name: "Divine Orbit", type: "orbit", description: "Orbs orbit you, destroying enemies on contact" },
  { name: "Holy Water", type: "holy-water", description: "Drop damaging pools on the ground" },
  { name: "Throwing Axe", type: "axe", description: "Piercing projectile that cuts through enemies" },
  { name: "Radiant Beam", type: "beam", description: "Beam of light pierces all enemies in a line" },
];

/** Evolution recipes: two max-level weapons combine into a super-weapon */
export const EVOLUTION_RECIPES: EvolutionRecipe[] = [
  {
    id: "baptism-of-fire",
    name: "Baptism of Fire",
    description: "Massive AoE fire + water explosion that covers the entire screen",
    ingredients: ["fire-ring", "holy-water"],
    icon: "\u{1F525}\u{1F4A7}",
  },
  {
    id: "storm-of-judgment",
    name: "Storm of Judgment",
    description: "Lightning chains across ALL enemies with devastating beam strikes",
    ingredients: ["lightning", "beam"],
    icon: "\u{26A1}\u{2728}",
  },
  {
    id: "divine-aegis",
    name: "Divine Aegis",
    description: "Shield that reflects damage and heals on every enemy kill",
    ingredients: ["shield", "orbit"],
    icon: "\u{1F6E1}\u{FE0F}\u{1F52E}",
  },
  {
    id: "celestial-vortex",
    name: "Celestial Vortex",
    description: "Axes orbit in an expanding spiral destroying everything in their path",
    ingredients: ["axe", "orbit"],
    icon: "\u{1FA93}\u{1F52E}",
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
    evolvedWeapons: [],
    xpOrbs: 0,
    xpOrbsToNext: BASE_XP_TO_NEXT,
    xpBonusCount: 0,
    gameOver: false,
    victory: false,
    elapsedSeconds: 0,
  };
}

/**
 * Processes an answer to a question.
 * Base scaling every wave: enemySpeedMultiplier *= 1.04, enemySpawnMultiplier *= 1.06.
 * - Correct: questionsCorrect++, score += 200.
 * - Wrong: no additional penalty.
 * Always increments questionsTotal.
 */
export function answerQuestion(
  state: SurvivorsState,
  correct: boolean,
): SurvivorsState {
  // Base scaling applied every wave regardless of answer — no wrong-answer penalty
  const next = {
    ...state,
    questionsTotal: state.questionsTotal + 1,
    enemySpeedMultiplier: state.enemySpeedMultiplier * 1.04,
    enemySpawnMultiplier: state.enemySpawnMultiplier * 1.06,
  };

  if (correct) {
    return {
      ...next,
      questionsCorrect: next.questionsCorrect + 1,
      score: next.score + 200,
    };
  }

  return next;
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
 * Increases max HP by 1 and heals the player by 1.
 * Used when all weapons are maxed as an infinite upgrade option.
 */
export function boostMaxHp(state: SurvivorsState): SurvivorsState {
  return {
    ...state,
    maxHp: state.maxHp + 1,
    playerHp: state.playerHp + 1,
  };
}

/**
 * Calculates star rating based on score.
 * - 3 stars: score >= 10000
 * - 2 stars: score >= 5000
 * - 1 star: otherwise
 */
export function calculateStars(state: SurvivorsState): number {
  if (state.score >= 10000) return 3;
  if (state.score >= 5000) return 2;
  return 1;
}

/** Records an elite enemy defeat: +100 score bonus. */
export function defeatElite(state: SurvivorsState): SurvivorsState {
  return {
    ...state,
    enemiesDefeated: state.enemiesDefeated + 1,
    score: state.score + 100,
  };
}

/** Collect a score power-up: +100 score. */
export function collectScorePowerUp(state: SurvivorsState): SurvivorsState {
  return { ...state, score: state.score + 100 };
}

/** Returns true when the game is over (player dead, victory, or time expired). */
export function isGameOver(state: SurvivorsState): boolean {
  return state.gameOver || state.victory;
}

// ---- Evolution system ----

/**
 * Returns evolution recipes that are available (both ingredients at max level,
 * and not already evolved).
 */
export function getAvailableEvolutions(state: SurvivorsState): EvolutionRecipe[] {
  return EVOLUTION_RECIPES.filter((recipe) => {
    // Already evolved?
    if (state.evolvedWeapons.includes(recipe.id)) return false;
    // Both ingredients at max level?
    const [a, b] = recipe.ingredients;
    return (
      getWeaponLevel(state, a) >= MAX_WEAPON_LEVEL &&
      getWeaponLevel(state, b) >= MAX_WEAPON_LEVEL
    );
  });
}

/**
 * Evolves two max-level weapons into a super-weapon.
 * Removes the ingredient weapons and adds the evolved weapon.
 * Returns null if the recipe is invalid or ingredients are missing.
 */
export function evolveWeapon(
  state: SurvivorsState,
  recipeId: EvolvedWeaponType,
): SurvivorsState | null {
  const recipe = EVOLUTION_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return null;
  if (state.evolvedWeapons.includes(recipeId)) return null;

  const [a, b] = recipe.ingredients;
  if (getWeaponLevel(state, a) < MAX_WEAPON_LEVEL) return null;
  if (getWeaponLevel(state, b) < MAX_WEAPON_LEVEL) return null;

  return {
    ...state,
    weapons: state.weapons.filter(
      (w) => w.type !== a && w.type !== b,
    ),
    evolvedWeapons: [...state.evolvedWeapons, recipeId],
    score: state.score + 500, // evolution bonus
  };
}

// ---- Weapon choice generation ----

/** A choice option shown in the level-up screen */
export type WeaponChoice =
  | { kind: "weapon"; weapon: WeaponUpgrade; currentLevel: number }
  | { kind: "evolution"; recipe: EvolutionRecipe }
  | { kind: "max-hp" };

/**
 * Generates up to 3 weapon/evolution choices for the level-up screen.
 * Evolutions are prioritized (shown first). Remaining slots filled with
 * non-maxed weapons. If nothing is available, returns a single max-hp option.
 * Uses a provided random function for testability.
 */
export function generateWeaponChoices(
  state: SurvivorsState,
  randomFn: () => number = Math.random,
): WeaponChoice[] {
  const choices: WeaponChoice[] = [];

  // 1. Available evolutions get priority slots
  const evolutions = getAvailableEvolutions(state);
  for (const recipe of evolutions) {
    if (choices.length >= 3) break;
    choices.push({ kind: "evolution", recipe });
  }

  // 2. Fill remaining slots with non-maxed weapons
  const available = WEAPON_OPTIONS.filter(
    (w) => getWeaponLevel(state, w.type) < MAX_WEAPON_LEVEL,
  );
  // Shuffle using Fisher-Yates with provided random
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const weapon of shuffled) {
    if (choices.length >= 3) break;
    choices.push({
      kind: "weapon",
      weapon,
      currentLevel: getWeaponLevel(state, weapon.type),
    });
  }

  // 3. If no choices at all, offer max HP
  if (choices.length === 0) {
    choices.push({ kind: "max-hp" });
  }

  return choices;
}

// ---- XP Orb system ----

/**
 * Collects an XP orb. Returns the new state and whether the bar is now full.
 */
export function collectXpOrb(state: SurvivorsState): { state: SurvivorsState; barFull: boolean } {
  const newOrbs = state.xpOrbs + 1;
  const barFull = newOrbs >= state.xpOrbsToNext;
  return {
    state: { ...state, xpOrbs: newOrbs },
    barFull,
  };
}

/**
 * Returns the XP bar fill ratio (0-1).
 */
export function getXpBarProgress(state: SurvivorsState): number {
  if (state.xpOrbsToNext <= 0) return 1;
  return Math.min(1, state.xpOrbs / state.xpOrbsToNext);
}

/**
 * Activates an XP bonus (called when bar is full). Resets orbs, increases
 * threshold, increments bonus count. Returns the bonus type and new state.
 */
export function activateXpBonus(state: SurvivorsState): { state: SurvivorsState; bonus: XpBonusType } {
  // Cycle through bonus types
  const bonusTypes: XpBonusType[] = ["score", "speed", "weapon-charge"];
  const bonus = bonusTypes[state.xpBonusCount % bonusTypes.length];

  let newState: SurvivorsState = {
    ...state,
    xpOrbs: 0,
    xpOrbsToNext: state.xpOrbsToNext + XP_SCALING,
    xpBonusCount: state.xpBonusCount + 1,
  };

  // Apply bonus
  switch (bonus) {
    case "score":
      newState = { ...newState, score: newState.score + 300 };
      break;
    case "speed":
      // Speed boost is handled visually in the scene (temporary effect)
      break;
    case "weapon-charge":
      // Weapon charge is handled visually in the scene (fires all weapons once)
      break;
  }

  return { state: newState, bonus };
}
