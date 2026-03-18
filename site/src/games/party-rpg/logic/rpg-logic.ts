/**
 * Pure TypeScript RPG game logic — no Phaser or DOM dependencies.
 */

export interface Hero {
  name: string;
  maxHp: number;
  hp: number;
  attack: number;
  color: string;
  abilityCharge: number;
}

export interface Enemy {
  name: string;
  maxHp: number;
  hp: number;
  attack: number;
}

export interface BattleState {
  heroes: Hero[];
  enemy: Enemy;
  currentHeroIndex: number;
  turn: "player" | "enemy";
  battleOver: boolean;
  victory: boolean;
}

export interface LootItem {
  name: string;
  statBoost: { hp?: number; attack?: number };
  description: string;
}

export const LOOT_TABLE: LootItem[] = [
  { name: "Sword of Truth", statBoost: { attack: 10 }, description: "Cuts through deception" },
  { name: "Shield of Faith", statBoost: { hp: 30 }, description: "Blocks doubt attacks" },
  { name: "Helmet of Salvation", statBoost: { hp: 20, attack: 5 }, description: "Guards the mind" },
  { name: "Belt of Truth", statBoost: { attack: 8 }, description: "Holds everything together" },
  { name: "Boots of Peace", statBoost: { hp: 15 }, description: "Steady your path" },
];

export interface RandomEvent {
  text: string;
  effect: "heal" | "damage" | "boost";
  value: number;
}

export const RANDOM_EVENTS: RandomEvent[] = [
  { text: "A traveler shares bread and water — party healed!", effect: "heal", value: 20 },
  { text: "A storm blocks your path — endure the challenge!", effect: "damage", value: 15 },
  { text: "You find a hidden spring — refreshed!", effect: "heal", value: 30 },
  { text: "Bandits ambush your camp!", effect: "damage", value: 25 },
  { text: "An old sage blesses your journey!", effect: "boost", value: 10 },
];

export interface RPGState {
  heroes: Hero[];
  locationsCleared: boolean[];
  totalLocations: number;
  currentLocation: number | null;
  partyHp: number;
  maxPartyHp: number;
  loot: LootItem[];
}

// --- Ability system ---

export interface HeroAbility {
  name: string;
  description: string;
  maxCharges: number;
  effectType: "damage_mult" | "heal_party" | "multi_hit" | "shield_and_hit";
  effectValue: number;
  effectSecondary?: number;
}

export const HERO_ABILITIES: Record<string, HeroAbility> = {
  Warrior: {
    name: "Sword of the Spirit",
    description: "Spirit-empowered strike",
    maxCharges: 2,
    effectType: "damage_mult",
    effectValue: 2,
  },
  Mage: {
    name: "Pillar of Fire",
    description: "Calls down holy fire",
    maxCharges: 2,
    effectType: "damage_mult",
    effectValue: 2.5,
  },
  Healer: {
    name: "Living Water",
    description: "Heals the party",
    maxCharges: 2,
    effectType: "heal_party",
    effectValue: 0.3,
  },
  Ranger: {
    name: "Arrows of Light",
    description: "Volley of radiant arrows",
    maxCharges: 2,
    effectType: "multi_hit",
    effectValue: 3,
    effectSecondary: 0.6,
  },
  Paladin: {
    name: "Armor of God",
    description: "Divine shield and strike",
    maxCharges: 2,
    effectType: "shield_and_hit",
    effectValue: 1.5,
  },
  Rogue: {
    name: "David's Sling",
    description: "Precise critical strike",
    maxCharges: 2,
    effectType: "damage_mult",
    effectValue: 3,
  },
};

export interface AbilityResult {
  heroIndex: number;
  ability: HeroAbility;
  damageDealt: number;
  healAmount?: number;
}

const HERO_DEFAULTS: Record<string, { hp: number; attack: number }> = {
  Warrior: { hp: 120, attack: 25 },
  Mage: { hp: 80, attack: 35 },
  Healer: { hp: 100, attack: 15 },
  Ranger: { hp: 90, attack: 30 },
  Paladin: { hp: 130, attack: 20 },
  Rogue: { hp: 85, attack: 32 },
};

/** Create a hero with role-based default stats. */
export function createHero(name: string, color: string): Hero {
  const defaults = HERO_DEFAULTS[name] ?? { hp: 100, attack: 20 };
  return {
    name,
    maxHp: defaults.hp,
    hp: defaults.hp,
    attack: defaults.attack,
    color,
    abilityCharge: 0,
  };
}

/** Create an enemy scaled by difficulty. */
export function createEnemy(
  sceneName: string,
  difficulty: "little-kids" | "big-kids",
): Enemy {
  const baseHp = difficulty === "little-kids" ? 80 : 150;
  const baseAttack = difficulty === "little-kids" ? 10 : 20;
  return {
    name: sceneName,
    maxHp: baseHp,
    hp: baseHp,
    attack: baseAttack,
  };
}

/** Create initial battle state. */
export function createBattleState(
  heroes: Hero[],
  enemy: Enemy,
): BattleState {
  return {
    heroes: heroes.map((h) => ({ ...h })),
    enemy: { ...enemy },
    currentHeroIndex: 0,
    turn: "player",
    battleOver: false,
    victory: false,
  };
}

/** Create party state with shared HP pool. */
export function createPartyState(heroes: Hero[]): RPGState {
  const totalHp = heroes.reduce((sum, h) => sum + h.hp, 0);
  return {
    heroes: heroes.map((h) => ({ ...h })),
    locationsCleared: [],
    totalLocations: 0,
    currentLocation: null,
    partyHp: totalHp,
    maxPartyHp: totalHp,
    loot: [],
  };
}

/**
 * Roll for loot after a victory — 40% chance to drop.
 * Returns a random LootItem or null.
 */
export function rollLoot(): LootItem | null {
  if (Math.random() >= 0.4) return null;
  const index = Math.floor(Math.random() * LOOT_TABLE.length);
  return { ...LOOT_TABLE[index] };
}

/**
 * Apply loot stat boosts to all heroes (immutable).
 */
export function applyLoot(heroes: Hero[], loot: LootItem): Hero[] {
  return heroes.map((h) => {
    const hpBoost = loot.statBoost.hp ?? 0;
    const atkBoost = loot.statBoost.attack ?? 0;
    return {
      ...h,
      maxHp: h.maxHp + hpBoost,
      hp: h.hp + hpBoost,
      attack: h.attack + atkBoost,
    };
  });
}

/**
 * Roll for a random event — 30% chance after each battle.
 * Returns a RandomEvent or null.
 */
export function rollRandomEvent(): RandomEvent | null {
  if (Math.random() >= 0.3) return null;
  const index = Math.floor(Math.random() * RANDOM_EVENTS.length);
  return { ...RANDOM_EVENTS[index] };
}

/**
 * Apply a random event to the RPGState (immutable).
 */
export function applyRandomEvent(state: RPGState, event: RandomEvent): RPGState {
  switch (event.effect) {
    case "heal": {
      const newPartyHp = Math.min(state.maxPartyHp, state.partyHp + event.value);
      return { ...state, partyHp: newPartyHp };
    }
    case "damage": {
      const newPartyHp = Math.max(0, state.partyHp - event.value);
      return { ...state, partyHp: newPartyHp };
    }
    case "boost": {
      const boostedHeroes = state.heroes.map((h) => ({
        ...h,
        attack: h.attack + event.value,
      }));
      return { ...state, heroes: boostedHeroes };
    }
    default:
      return state;
  }
}

/**
 * Resolve a player answer in battle.
 * - Correct: current hero attacks (or triggers ability if fully charged).
 * - Wrong: enemy attacks the shared party HP pool.
 * After resolution, advances currentHeroIndex to next living hero.
 * Returns a new BattleState (immutable).
 */
export function resolvePlayerAnswer(
  state: BattleState,
  correct: boolean,
  partyHp?: number,
  maxPartyHp?: number,
): BattleState & { partyHpDelta?: number; abilityTriggered?: AbilityResult } {
  const heroes = state.heroes.map((h) => ({ ...h }));
  const enemy = { ...state.enemy };
  let { currentHeroIndex } = state;
  let partyHpDelta: number | undefined;
  let abilityTriggered: AbilityResult | undefined;

  if (correct) {
    const hero = heroes[currentHeroIndex];
    const ability = HERO_ABILITIES[hero.name];

    // Charge ability
    if (ability) {
      hero.abilityCharge++;
    }

    // Check if ability is fully charged
    if (ability && hero.abilityCharge >= ability.maxCharges) {
      hero.abilityCharge = 0;
      const result = applyAbilityEffect(hero, enemy, ability, partyHp, maxPartyHp);
      enemy.hp = result.enemyHp;
      partyHpDelta = result.partyHpDelta;
      abilityTriggered = {
        heroIndex: currentHeroIndex,
        ability,
        damageDealt: result.damageDealt,
        healAmount: result.healAmount,
      };
    } else {
      // Normal attack
      enemy.hp = Math.max(0, enemy.hp - hero.attack);
    }
  } else {
    if (partyHp !== undefined) {
      // Shared party HP mode: enemy attacks the pool
      partyHpDelta = -enemy.attack;
    } else {
      // Legacy mode: enemy attacks current hero
      const hero = heroes[currentHeroIndex];
      hero.hp = Math.max(0, hero.hp - enemy.attack);
    }
  }

  const { battleOver, victory } = checkBattleOutcome(heroes, enemy, partyHp, partyHpDelta);

  // Advance to next living hero (if battle is not over)
  if (!battleOver) {
    currentHeroIndex = nextLivingHeroIndex(heroes, currentHeroIndex);
  }

  return {
    heroes,
    enemy,
    currentHeroIndex,
    turn: "player",
    battleOver,
    victory,
    partyHpDelta,
    abilityTriggered,
  };
}

/** Check if the battle has ended. */
export function isBattleOver(state: BattleState): boolean {
  return state.battleOver;
}

/** Check if the entire quest is complete. */
export function isQuestComplete(state: RPGState): boolean {
  return state.locationsCleared.every((c) => c);
}

// --- Internal helpers ---

function applyAbilityEffect(
  hero: Hero,
  enemy: Enemy,
  ability: HeroAbility,
  _partyHp?: number,
  maxPartyHp?: number,
): { enemyHp: number; damageDealt: number; partyHpDelta?: number; healAmount?: number } {
  let damageDealt = 0;
  let partyHpDelta: number | undefined;
  let healAmount: number | undefined;

  switch (ability.effectType) {
    case "damage_mult":
      damageDealt = Math.floor(hero.attack * ability.effectValue);
      break;
    case "heal_party":
      damageDealt = hero.attack;
      if (maxPartyHp !== undefined) {
        healAmount = Math.floor(maxPartyHp * ability.effectValue);
        partyHpDelta = healAmount;
      }
      break;
    case "multi_hit": {
      const hits = ability.effectValue;
      const perHit = Math.floor(hero.attack * (ability.effectSecondary ?? 0.5));
      damageDealt = perHit * hits;
      break;
    }
    case "shield_and_hit":
      damageDealt = Math.floor(hero.attack * ability.effectValue);
      break;
  }

  return {
    enemyHp: Math.max(0, enemy.hp - damageDealt),
    damageDealt,
    partyHpDelta,
    healAmount,
  };
}

function checkBattleOutcome(
  heroes: Hero[],
  enemy: Enemy,
  partyHp?: number,
  partyHpDelta?: number,
): { battleOver: boolean; victory: boolean } {
  if (enemy.hp <= 0) {
    return { battleOver: true, victory: true };
  }
  if (partyHp !== undefined) {
    // Shared HP mode
    const effectiveHp = partyHp + (partyHpDelta ?? 0);
    if (effectiveHp <= 0) {
      return { battleOver: true, victory: false };
    }
  } else {
    // Legacy hero HP mode
    if (heroes.every((h) => h.hp <= 0)) {
      return { battleOver: true, victory: false };
    }
  }
  return { battleOver: false, victory: false };
}

function nextLivingHeroIndex(heroes: Hero[], current: number): number {
  const count = heroes.length;
  for (let i = 1; i <= count; i++) {
    const idx = (current + i) % count;
    if (heroes[idx].hp > 0) return idx;
  }
  // All dead — return current (battle should be over)
  return current;
}
