import type { TermPair } from "@/types/lesson";

// --- Types ---

export type AbilityType =
  | "shield"
  | "guard"
  | "heal"
  | "draw"
  | "boost"
  | "strike";

export interface Card {
  id: string;
  name: string;
  description: string;
  power: number;
  ability: AbilityType;
  difficulty: "easy" | "medium" | "hard";
}

export interface BattleState {
  playerHp: number;
  aiHp: number;
  maxHp: number;
  playerHand: Card[];
  aiHand: Card[];
  turn: number;
  maxTurns: number;
  playerPlayedCard: Card | null;
  aiPlayedCard: Card | null;
  lastPlayerPower: number | null;
  gameOver: boolean;
  winner: "player" | "ai" | "draw" | null;
  peekAiCard: Card | null;
}

export interface ClashResult {
  playerEffectivePower: number;
  aiEffectivePower: number;
  playerDamage: number; // damage dealt TO player
  aiDamage: number; // damage dealt TO ai
  abilityTriggered: AbilityType | null;
  abilityText: string;
}

export interface GameOverResult {
  over: boolean;
  winner: "player" | "ai" | "draw" | null;
  reason: string;
}

// --- Constants ---

const MAX_HP = 10;
const MAX_TURNS = 5;
const HAND_SIZE = 5;

const EASY_ABILITIES: AbilityType[] = ["shield", "guard"];
const MEDIUM_ABILITIES: AbilityType[] = ["heal", "draw"];
const HARD_ABILITIES: AbilityType[] = ["boost", "strike"];

// --- Helpers ---

/** Fisher-Yates shuffle -- returns a new array. */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Card Generation ---

/**
 * Generates cards from ALL termPairs. Each card gets a Power value
 * with variance for replayability and a randomly assigned ability
 * from its tier.
 */
export function generateCards(termPairs: TermPair[]): Card[] {
  return termPairs.map((tp, i) => {
    let basePower: number;
    let abilities: AbilityType[];

    switch (tp.difficulty) {
      case "easy":
        basePower = 2;
        abilities = EASY_ABILITIES;
        break;
      case "medium":
        basePower = 3;
        abilities = MEDIUM_ABILITIES;
        break;
      case "hard":
        basePower = 5;
        abilities = HARD_ABILITIES;
        break;
    }

    // Apply +/-1 variance, minimum power is 1
    const power = Math.max(1, basePower + randomInt(-1, 1));
    const ability = pickRandom(abilities);

    return {
      id: `card-${i}`,
      name: tp.term,
      description: tp.definition,
      power,
      ability,
      difficulty: tp.difficulty,
    };
  });
}

// --- Hand Dealing ---

/**
 * Deals hands for both player and AI from the card pool.
 * Each gets HAND_SIZE cards. Cards can overlap between hands
 * (both sides draw from the full pool independently).
 */
export function dealHands(cards: Card[]): {
  playerHand: Card[];
  aiHand: Card[];
  remainingPool: Card[];
} {
  if (cards.length < HAND_SIZE) {
    // If not enough cards, duplicate to fill
    const expanded: Card[] = [];
    while (expanded.length < HAND_SIZE * 3) {
      expanded.push(
        ...cards.map((c, i) => ({ ...c, id: `${c.id}-dup-${expanded.length + i}` })),
      );
    }
    const shuffled = shuffle(expanded);
    return {
      playerHand: shuffled.slice(0, HAND_SIZE),
      aiHand: shuffle(expanded).slice(0, HAND_SIZE),
      remainingPool: shuffled.slice(HAND_SIZE),
    };
  }

  const playerShuffled = shuffle(cards);
  const aiShuffled = shuffle(cards);

  return {
    playerHand: playerShuffled.slice(0, HAND_SIZE),
    aiHand: aiShuffled.slice(0, HAND_SIZE),
    remainingPool: playerShuffled.slice(HAND_SIZE),
  };
}

// --- Mulligan ---

/**
 * Swaps cards at the given indices in hand for random cards from the pool.
 * Returns the new hand. Up to 2 swaps allowed.
 */
export function mulligan(
  hand: Card[],
  pool: Card[],
  swapIndices: number[],
): Card[] {
  const indices = swapIndices.slice(0, 2); // max 2 swaps
  if (indices.length === 0 || pool.length === 0) return [...hand];

  const availablePool = shuffle(pool);
  const newHand = [...hand];
  let poolIdx = 0;

  for (const idx of indices) {
    if (idx >= 0 && idx < newHand.length && poolIdx < availablePool.length) {
      newHand[idx] = availablePool[poolIdx];
      poolIdx++;
    }
  }

  return newHand;
}

// --- Battle State ---

export function createBattleState(
  playerHand: Card[],
  aiHand: Card[],
): BattleState {
  return {
    playerHp: MAX_HP,
    aiHp: MAX_HP,
    maxHp: MAX_HP,
    playerHand: [...playerHand],
    aiHand: [...aiHand],
    turn: 0,
    maxTurns: MAX_TURNS,
    playerPlayedCard: null,
    aiPlayedCard: null,
    lastPlayerPower: null,
    gameOver: false,
    winner: null,
    peekAiCard: null,
  };
}

// --- Clash Resolution ---

/**
 * Resolves a clash between player and AI cards.
 * - correct answer: +2 Power bonus, ability triggers
 * - wrong answer: no bonus, no ability, AI gets +1 Power
 * - Winner deals (winner - loser) damage, minimum 1
 * - Tie: both take 1 damage
 */
export function resolveClash(
  playerCard: Card,
  aiCard: Card,
  correct: boolean,
): ClashResult {
  let playerPower = playerCard.power;
  let aiPower = aiCard.power;
  let abilityTriggered: AbilityType | null = null;
  let abilityText = "";

  if (correct) {
    playerPower += 2;
    abilityTriggered = playerCard.ability;

    switch (playerCard.ability) {
      case "shield":
        abilityText = "Shield: -1 damage taken";
        break;
      case "guard":
        abilityText = "Guard: opponent -1 Power";
        aiPower = Math.max(0, aiPower - 1);
        break;
      case "heal":
        abilityText = "Heal: +1 HP";
        break;
      case "draw":
        abilityText = "Draw: peek at AI's next card";
        break;
      case "boost":
        abilityText = "Boost: +1 Power";
        playerPower += 1;
        break;
      case "strike":
        abilityText = "Strike: 1 direct damage to AI";
        break;
    }
  } else {
    aiPower += 1;
  }

  let playerDamage = 0; // damage dealt TO player
  let aiDamage = 0; // damage dealt TO ai

  if (playerPower > aiPower) {
    // Player wins: deal damage to AI
    aiDamage = Math.max(1, playerPower - aiPower);
  } else if (aiPower > playerPower) {
    // AI wins: deal damage to player
    playerDamage = Math.max(1, aiPower - playerPower);
  } else {
    // Tie: both take 1
    playerDamage = 1;
    aiDamage = 1;
  }

  // Shield reduces damage taken by player
  if (correct && playerCard.ability === "shield" && playerDamage > 0) {
    playerDamage = Math.max(0, playerDamage - 1);
  }

  // Strike adds 1 direct damage to AI
  if (correct && playerCard.ability === "strike") {
    aiDamage += 1;
  }

  return {
    playerEffectivePower: playerPower,
    aiEffectivePower: aiPower,
    playerDamage,
    aiDamage,
    abilityTriggered,
    abilityText,
  };
}

// --- Apply Clash Result ---

/**
 * Applies a clash result to the battle state, removing played cards
 * from hands, adjusting HP, and advancing the turn counter.
 */
export function applyClashResult(
  state: BattleState,
  result: ClashResult,
): BattleState {
  let newPlayerHp = Math.max(0, state.playerHp - result.playerDamage);
  let newAiHp = Math.max(0, state.aiHp - result.aiDamage);

  // Heal ability: +1 HP to player (cap at maxHp)
  if (result.abilityTriggered === "heal") {
    newPlayerHp = Math.min(state.maxHp, newPlayerHp + 1);
  }

  // Remove played cards from hands
  const newPlayerHand = state.playerHand.filter(
    (c) => c.id !== state.playerPlayedCard?.id,
  );
  const newAiHand = state.aiHand.filter(
    (c) => c.id !== state.aiPlayedCard?.id,
  );

  // Peek at AI's next card if Draw ability triggered
  let peekAiCard: Card | null = null;
  if (result.abilityTriggered === "draw" && newAiHand.length > 0) {
    peekAiCard = newAiHand[0];
  }

  const newTurn = state.turn + 1;

  const newState: BattleState = {
    ...state,
    playerHp: newPlayerHp,
    aiHp: newAiHp,
    playerHand: newPlayerHand,
    aiHand: newAiHand,
    turn: newTurn,
    playerPlayedCard: null,
    aiPlayedCard: null,
    lastPlayerPower: state.playerPlayedCard?.power ?? null,
    peekAiCard,
  };

  // Check for game over
  const gameOverCheck = isGameOver(newState);
  if (gameOverCheck.over) {
    newState.gameOver = true;
    newState.winner = gameOverCheck.winner;
  }

  return newState;
}

// --- AI Card Selection ---

/**
 * AI selects a card based on simple reactive strategy:
 * - First turn (lastPlayerPower is null): random card
 * - If player played high power last turn (>= 4): play strongest
 * - Otherwise: play a medium-strength card
 */
export function aiSelectCard(
  aiHand: Card[],
  lastPlayerPower: number | null,
): Card {
  if (aiHand.length === 0) {
    throw new Error("AI has no cards to play");
  }

  if (aiHand.length === 1) {
    return aiHand[0];
  }

  const sorted = [...aiHand].sort((a, b) => a.power - b.power);

  if (lastPlayerPower === null) {
    // First turn: random
    return pickRandom(aiHand);
  }

  if (lastPlayerPower >= 4) {
    // Player played strong: AI plays strongest
    return sorted[sorted.length - 1];
  }

  // Player played low/medium: AI plays a middle card
  const midIndex = Math.floor(sorted.length / 2);
  return sorted[midIndex];
}

// --- Game Over Check ---

export function isGameOver(state: BattleState): GameOverResult {
  if (state.playerHp <= 0 && state.aiHp <= 0) {
    return { over: true, winner: "draw", reason: "Both heroes fell!" };
  }

  if (state.playerHp <= 0) {
    return { over: true, winner: "ai", reason: "Your hero has fallen!" };
  }

  if (state.aiHp <= 0) {
    return { over: true, winner: "player", reason: "Your faith is strong!" };
  }

  // Out of cards after all turns
  if (state.turn >= state.maxTurns) {
    if (state.playerHp > state.aiHp) {
      return { over: true, winner: "player", reason: "Your faith is strong!" };
    }
    if (state.aiHp > state.playerHp) {
      return { over: true, winner: "ai", reason: "Great battle! Try again?" };
    }
    return { over: true, winner: "draw", reason: "It's a draw!" };
  }

  return { over: false, winner: null, reason: "" };
}

// --- Star Calculation ---

/**
 * Stars based on final state:
 * 3 = win with HP >= 8
 * 2 = win with HP >= 4
 * 1 = any win
 * 0 = loss or draw
 */
export function calculateStars(state: BattleState): number {
  if (state.winner !== "player") return 0;
  if (state.playerHp >= 8) return 3;
  if (state.playerHp >= 4) return 2;
  return 1;
}

// --- Ability Description Helpers ---

export function getAbilityEmoji(ability: AbilityType): string {
  switch (ability) {
    case "shield":
      return "\u{1F6E1}\uFE0F";
    case "guard":
      return "\u{1F6E1}\uFE0F";
    case "heal":
      return "\u{2764}\uFE0F";
    case "draw":
      return "\u{1F441}\uFE0F";
    case "boost":
      return "\u26A1";
    case "strike":
      return "\u{1F4A5}";
  }
}

export function getAbilityName(ability: AbilityType): string {
  switch (ability) {
    case "shield":
      return "Shield";
    case "guard":
      return "Guard";
    case "heal":
      return "Heal";
    case "draw":
      return "Peek";
    case "boost":
      return "Boost";
    case "strike":
      return "Strike";
  }
}

export function getDifficultyBorder(
  difficulty: "easy" | "medium" | "hard",
): string {
  switch (difficulty) {
    case "easy":
      return "bronze";
    case "medium":
      return "silver";
    case "hard":
      return "gold";
  }
}
