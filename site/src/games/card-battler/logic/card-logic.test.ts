import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TermPair } from "@/types/lesson";
import {
  generateCards,
  dealHands,
  mulligan,
  createBattleState,
  resolveClash,
  applyClashResult,
  aiSelectCard,
  isGameOver,
  calculateStars,
  getAbilityEmoji,
  getAbilityName,
  getDifficultyBorder,
} from "./card-logic";
import type { Card, BattleState } from "./card-logic";

// --- Test Data ---

const testTermPairs: TermPair[] = [
  { term: "Humble", definition: "Putting others first", difficulty: "easy" },
  { term: "Upside Down", definition: "Living the opposite way", difficulty: "easy" },
  { term: "Enemies", definition: "People who are not kind", difficulty: "easy" },
  { term: "Holy Spirit", definition: "God's Spirit who helps", difficulty: "medium" },
  { term: "Philippians", definition: "The memory verse", difficulty: "medium" },
  { term: "Matthew", definition: "A book of the Bible", difficulty: "hard" },
  { term: "Patience", definition: "Waiting calmly", difficulty: "medium" },
  { term: "Obedience", definition: "Following God's commands", difficulty: "medium" },
  { term: "Mountainside", definition: "Where Jesus taught", difficulty: "hard" },
  { term: "Bottom Line", definition: "The main point", difficulty: "easy" },
  { term: "Value Others", definition: "Seeing others as important", difficulty: "medium" },
  { term: "Proud", definition: "Thinking you are better", difficulty: "easy" },
];

// Helper to create a card for tests
function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "test-card-1",
    name: "Test Card",
    description: "A test card",
    power: 3,
    ability: "shield",
    difficulty: "easy",
    ...overrides,
  };
}

function makeBattleState(overrides: Partial<BattleState> = {}): BattleState {
  return {
    playerHp: 10,
    aiHp: 10,
    maxHp: 10,
    playerHand: [makeCard({ id: "p1" }), makeCard({ id: "p2" })],
    aiHand: [makeCard({ id: "a1" }), makeCard({ id: "a2" })],
    turn: 0,
    maxTurns: 5,
    playerPlayedCard: null,
    aiPlayedCard: null,
    lastPlayerPower: null,
    gameOver: false,
    winner: null,
    peekAiCard: null,
    ...overrides,
  };
}

// --- Tests ---

describe("generateCards", () => {
  it("generates one card per termPair", () => {
    const cards = generateCards(testTermPairs);
    expect(cards.length).toBe(testTermPairs.length);
  });

  it("assigns card names from term and descriptions from definition", () => {
    const cards = generateCards(testTermPairs);
    expect(cards[0].name).toBe("Humble");
    expect(cards[0].description).toBe("Putting others first");
  });

  it("assigns unique IDs to each card", () => {
    const cards = generateCards(testTermPairs);
    const ids = new Set(cards.map((c) => c.id));
    expect(ids.size).toBe(cards.length);
  });

  it("easy cards have power in range 1-3", () => {
    // Run multiple times to test variance
    for (let run = 0; run < 20; run++) {
      const cards = generateCards(testTermPairs);
      const easyCards = cards.filter((c) => c.difficulty === "easy");
      for (const card of easyCards) {
        expect(card.power).toBeGreaterThanOrEqual(1);
        expect(card.power).toBeLessThanOrEqual(3);
      }
    }
  });

  it("medium cards have power in range 2-4", () => {
    for (let run = 0; run < 20; run++) {
      const cards = generateCards(testTermPairs);
      const medCards = cards.filter((c) => c.difficulty === "medium");
      for (const card of medCards) {
        expect(card.power).toBeGreaterThanOrEqual(2);
        expect(card.power).toBeLessThanOrEqual(4);
      }
    }
  });

  it("hard cards have power in range 4-6", () => {
    for (let run = 0; run < 20; run++) {
      const cards = generateCards(testTermPairs);
      const hardCards = cards.filter((c) => c.difficulty === "hard");
      for (const card of hardCards) {
        expect(card.power).toBeGreaterThanOrEqual(4);
        expect(card.power).toBeLessThanOrEqual(6);
      }
    }
  });

  it("easy cards get shield or guard abilities", () => {
    for (let run = 0; run < 20; run++) {
      const cards = generateCards(testTermPairs);
      const easyCards = cards.filter((c) => c.difficulty === "easy");
      for (const card of easyCards) {
        expect(["shield", "guard"]).toContain(card.ability);
      }
    }
  });

  it("medium cards get heal or draw abilities", () => {
    for (let run = 0; run < 20; run++) {
      const cards = generateCards(testTermPairs);
      const medCards = cards.filter((c) => c.difficulty === "medium");
      for (const card of medCards) {
        expect(["heal", "draw"]).toContain(card.ability);
      }
    }
  });

  it("hard cards get boost or strike abilities", () => {
    for (let run = 0; run < 20; run++) {
      const cards = generateCards(testTermPairs);
      const hardCards = cards.filter((c) => c.difficulty === "hard");
      for (const card of hardCards) {
        expect(["boost", "strike"]).toContain(card.ability);
      }
    }
  });

  it("preserves difficulty from termPair", () => {
    const cards = generateCards(testTermPairs);
    for (let i = 0; i < testTermPairs.length; i++) {
      expect(cards[i].difficulty).toBe(testTermPairs[i].difficulty);
    }
  });
});

describe("dealHands", () => {
  it("deals 5 cards to each player", () => {
    const cards = generateCards(testTermPairs);
    const { playerHand, aiHand } = dealHands(cards);
    expect(playerHand.length).toBe(5);
    expect(aiHand.length).toBe(5);
  });

  it("returns remaining pool after dealing player hand", () => {
    const cards = generateCards(testTermPairs);
    const { remainingPool } = dealHands(cards);
    // 12 total - 5 dealt to player = 7 remaining
    expect(remainingPool.length).toBe(testTermPairs.length - 5);
  });

  it("handles small card pools by duplicating", () => {
    const smallPairs: TermPair[] = [
      { term: "Faith", definition: "Trusting God", difficulty: "easy" },
      { term: "Love", definition: "Caring deeply", difficulty: "medium" },
    ];
    const cards = generateCards(smallPairs);
    const { playerHand, aiHand } = dealHands(cards);
    expect(playerHand.length).toBe(5);
    expect(aiHand.length).toBe(5);
  });
});

describe("mulligan", () => {
  it("swaps specified cards with pool cards", () => {
    const hand = [
      makeCard({ id: "h1", name: "Card1" }),
      makeCard({ id: "h2", name: "Card2" }),
      makeCard({ id: "h3", name: "Card3" }),
      makeCard({ id: "h4", name: "Card4" }),
      makeCard({ id: "h5", name: "Card5" }),
    ];
    const pool = [
      makeCard({ id: "p1", name: "PoolCard1" }),
      makeCard({ id: "p2", name: "PoolCard2" }),
      makeCard({ id: "p3", name: "PoolCard3" }),
    ];

    const newHand = mulligan(hand, pool, [0, 2]);
    expect(newHand.length).toBe(5);
    // Original cards at indices 1, 3, 4 should be unchanged
    expect(newHand[1].id).toBe("h2");
    expect(newHand[3].id).toBe("h4");
    expect(newHand[4].id).toBe("h5");
    // Swapped indices should be different from original
    expect(newHand[0].id).not.toBe("h1");
    expect(newHand[2].id).not.toBe("h3");
  });

  it("limits to 2 swaps maximum", () => {
    const hand = [
      makeCard({ id: "h1" }),
      makeCard({ id: "h2" }),
      makeCard({ id: "h3" }),
      makeCard({ id: "h4" }),
      makeCard({ id: "h5" }),
    ];
    const pool = [
      makeCard({ id: "p1" }),
      makeCard({ id: "p2" }),
      makeCard({ id: "p3" }),
    ];

    // Try to swap 3 but only 2 should be swapped
    const newHand = mulligan(hand, pool, [0, 1, 2]);
    const changed = newHand.filter((c, i) => c.id !== hand[i].id);
    expect(changed.length).toBeLessThanOrEqual(2);
  });

  it("returns same hand if no swap indices", () => {
    const hand = [makeCard({ id: "h1" }), makeCard({ id: "h2" })];
    const pool = [makeCard({ id: "p1" })];
    const newHand = mulligan(hand, pool, []);
    expect(newHand[0].id).toBe("h1");
    expect(newHand[1].id).toBe("h2");
  });

  it("returns same hand if pool is empty", () => {
    const hand = [makeCard({ id: "h1" })];
    const newHand = mulligan(hand, [], [0]);
    expect(newHand[0].id).toBe("h1");
  });
});

describe("createBattleState", () => {
  it("initializes with correct default values", () => {
    const playerHand = [makeCard({ id: "p1" }), makeCard({ id: "p2" })];
    const aiHand = [makeCard({ id: "a1" }), makeCard({ id: "a2" })];
    const state = createBattleState(playerHand, aiHand);

    expect(state.playerHp).toBe(10);
    expect(state.aiHp).toBe(10);
    expect(state.maxHp).toBe(10);
    expect(state.turn).toBe(0);
    expect(state.maxTurns).toBe(5);
    expect(state.playerPlayedCard).toBeNull();
    expect(state.aiPlayedCard).toBeNull();
    expect(state.lastPlayerPower).toBeNull();
    expect(state.gameOver).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.peekAiCard).toBeNull();
  });

  it("copies hands without mutation", () => {
    const playerHand = [makeCard({ id: "p1" })];
    const aiHand = [makeCard({ id: "a1" })];
    const state = createBattleState(playerHand, aiHand);

    // Verify hands are copies, not references
    expect(state.playerHand).toEqual(playerHand);
    expect(state.playerHand).not.toBe(playerHand);
  });
});

describe("resolveClash", () => {
  it("gives player +2 power bonus on correct answer", () => {
    const playerCard = makeCard({ power: 3, ability: "shield" });
    const aiCard = makeCard({ power: 3, ability: "shield" });
    const result = resolveClash(playerCard, aiCard, true);

    expect(result.playerEffectivePower).toBe(5); // 3 + 2
    expect(result.aiEffectivePower).toBe(3);
  });

  it("gives AI +1 power bonus on wrong answer", () => {
    const playerCard = makeCard({ power: 3, ability: "shield" });
    const aiCard = makeCard({ power: 3, ability: "shield" });
    const result = resolveClash(playerCard, aiCard, false);

    expect(result.playerEffectivePower).toBe(3);
    expect(result.aiEffectivePower).toBe(4); // 3 + 1
  });

  it("player wins: deals difference as damage to AI (min 1)", () => {
    const playerCard = makeCard({ power: 5, ability: "guard" });
    const aiCard = makeCard({ power: 2, ability: "shield" });
    const result = resolveClash(playerCard, aiCard, true);

    // Player: 5 + 2 = 7, AI: 2 - 1 (guard) = 1
    expect(result.aiDamage).toBe(7 - 1); // 6
    expect(result.playerDamage).toBe(0);
  });

  it("AI wins: deals difference as damage to player (min 1)", () => {
    const playerCard = makeCard({ power: 1, ability: "shield" });
    const aiCard = makeCard({ power: 5, ability: "shield" });
    const result = resolveClash(playerCard, aiCard, false);

    // Player: 1, AI: 5 + 1 = 6
    expect(result.playerDamage).toBeGreaterThanOrEqual(1);
    expect(result.aiDamage).toBe(0);
  });

  it("tie: both take 1 damage", () => {
    const playerCard = makeCard({ power: 3, ability: "heal" });
    const aiCard = makeCard({ power: 4, ability: "shield" });
    // Correct: player 3+2=5, AI 4, player wins, not a tie
    // Wrong: player 3, AI 4+1=5, AI wins, not a tie
    // For a tie: we need player 3 correct (+2=5) vs AI power 5
    const aiCard2 = makeCard({ power: 5, ability: "shield" });
    const result = resolveClash(
      makeCard({ power: 3, ability: "heal" }),
      aiCard2,
      true,
    );
    // Player: 3 + 2 = 5, AI: 5, TIE
    expect(result.playerDamage).toBe(1);
    expect(result.aiDamage).toBe(1);
  });

  describe("abilities on correct answer", () => {
    it("shield reduces player damage by 1", () => {
      // Need AI to win so player takes damage, but player answered correctly
      const playerCard = makeCard({ power: 1, ability: "shield" });
      const aiCard = makeCard({ power: 6, ability: "guard" });
      const result = resolveClash(playerCard, aiCard, true);

      // Player: 1 + 2 = 3, AI: 6, AI wins
      // Damage to player = 6 - 3 = 3, but shield -1 = 2
      expect(result.playerDamage).toBe(2);
      expect(result.abilityTriggered).toBe("shield");
    });

    it("guard reduces AI power by 1", () => {
      const playerCard = makeCard({ power: 3, ability: "guard" });
      const aiCard = makeCard({ power: 3, ability: "shield" });
      const result = resolveClash(playerCard, aiCard, true);

      // Player: 3 + 2 = 5, AI: 3 - 1 = 2
      expect(result.aiEffectivePower).toBe(2);
      expect(result.abilityTriggered).toBe("guard");
    });

    it("heal ability is flagged (applied during applyClashResult)", () => {
      const playerCard = makeCard({ power: 3, ability: "heal" });
      const aiCard = makeCard({ power: 2, ability: "shield" });
      const result = resolveClash(playerCard, aiCard, true);

      expect(result.abilityTriggered).toBe("heal");
      expect(result.abilityText).toContain("Heal");
    });

    it("draw ability is flagged (peek applied during applyClashResult)", () => {
      const playerCard = makeCard({ power: 3, ability: "draw" });
      const aiCard = makeCard({ power: 2, ability: "shield" });
      const result = resolveClash(playerCard, aiCard, true);

      expect(result.abilityTriggered).toBe("draw");
    });

    it("boost adds +1 additional power", () => {
      const playerCard = makeCard({ power: 3, ability: "boost" });
      const aiCard = makeCard({ power: 2, ability: "shield" });
      const result = resolveClash(playerCard, aiCard, true);

      // Player: 3 + 2 (correct) + 1 (boost) = 6
      expect(result.playerEffectivePower).toBe(6);
      expect(result.abilityTriggered).toBe("boost");
    });

    it("strike adds 1 direct damage to AI", () => {
      const playerCard = makeCard({ power: 3, ability: "strike" });
      const aiCard = makeCard({ power: 2, ability: "shield" });
      const result = resolveClash(playerCard, aiCard, true);

      // Player: 3 + 2 = 5 vs AI: 2 -> damage = 3 + 1 (strike) = 4
      expect(result.aiDamage).toBe(4);
      expect(result.abilityTriggered).toBe("strike");
    });
  });

  it("no ability triggers on wrong answer", () => {
    const playerCard = makeCard({ power: 3, ability: "boost" });
    const aiCard = makeCard({ power: 2, ability: "shield" });
    const result = resolveClash(playerCard, aiCard, false);

    expect(result.abilityTriggered).toBeNull();
    expect(result.abilityText).toBe("");
  });
});

describe("applyClashResult", () => {
  it("reduces HP based on clash damage", () => {
    const state = makeBattleState({
      playerPlayedCard: makeCard({ id: "p1" }),
      aiPlayedCard: makeCard({ id: "a1" }),
    });
    const result = {
      playerEffectivePower: 5,
      aiEffectivePower: 3,
      playerDamage: 0,
      aiDamage: 2,
      abilityTriggered: null as any,
      abilityText: "",
    };

    const newState = applyClashResult(state, result);
    expect(newState.playerHp).toBe(10);
    expect(newState.aiHp).toBe(8);
  });

  it("removes played cards from hands", () => {
    const state = makeBattleState({
      playerPlayedCard: makeCard({ id: "p1" }),
      aiPlayedCard: makeCard({ id: "a1" }),
    });
    const result = {
      playerEffectivePower: 3,
      aiEffectivePower: 3,
      playerDamage: 1,
      aiDamage: 1,
      abilityTriggered: null as any,
      abilityText: "",
    };

    const newState = applyClashResult(state, result);
    expect(newState.playerHand.find((c) => c.id === "p1")).toBeUndefined();
    expect(newState.aiHand.find((c) => c.id === "a1")).toBeUndefined();
  });

  it("advances the turn counter", () => {
    const state = makeBattleState({
      turn: 2,
      playerPlayedCard: makeCard({ id: "p1" }),
      aiPlayedCard: makeCard({ id: "a1" }),
    });
    const result = {
      playerEffectivePower: 3,
      aiEffectivePower: 3,
      playerDamage: 1,
      aiDamage: 1,
      abilityTriggered: null as any,
      abilityText: "",
    };

    const newState = applyClashResult(state, result);
    expect(newState.turn).toBe(3);
  });

  it("heal ability restores 1 HP (capped at maxHp)", () => {
    const state = makeBattleState({
      playerHp: 10,
      playerPlayedCard: makeCard({ id: "p1" }),
      aiPlayedCard: makeCard({ id: "a1" }),
    });
    const result = {
      playerEffectivePower: 5,
      aiEffectivePower: 3,
      playerDamage: 0,
      aiDamage: 2,
      abilityTriggered: "heal" as const,
      abilityText: "Heal: +1 HP",
    };

    const newState = applyClashResult(state, result);
    // Already at max, should stay at 10
    expect(newState.playerHp).toBe(10);

    // With lower HP
    const state2 = makeBattleState({
      playerHp: 7,
      playerPlayedCard: makeCard({ id: "p1" }),
      aiPlayedCard: makeCard({ id: "a1" }),
    });
    const newState2 = applyClashResult(state2, result);
    expect(newState2.playerHp).toBe(8); // 7 + 1
  });

  it("draw ability sets peekAiCard to AI's next card", () => {
    const nextAiCard = makeCard({ id: "a2", name: "NextCard" });
    const state = makeBattleState({
      aiHand: [makeCard({ id: "a1" }), nextAiCard],
      playerPlayedCard: makeCard({ id: "p1" }),
      aiPlayedCard: makeCard({ id: "a1" }),
    });
    const result = {
      playerEffectivePower: 5,
      aiEffectivePower: 3,
      playerDamage: 0,
      aiDamage: 2,
      abilityTriggered: "draw" as const,
      abilityText: "Draw: peek at AI's next card",
    };

    const newState = applyClashResult(state, result);
    expect(newState.peekAiCard).not.toBeNull();
    expect(newState.peekAiCard?.id).toBe("a2");
  });

  it("sets lastPlayerPower from the played card", () => {
    const state = makeBattleState({
      playerPlayedCard: makeCard({ id: "p1", power: 4 }),
      aiPlayedCard: makeCard({ id: "a1" }),
    });
    const result = {
      playerEffectivePower: 6,
      aiEffectivePower: 3,
      playerDamage: 0,
      aiDamage: 3,
      abilityTriggered: null as any,
      abilityText: "",
    };

    const newState = applyClashResult(state, result);
    expect(newState.lastPlayerPower).toBe(4);
  });

  it("detects game over when HP drops to 0", () => {
    const state = makeBattleState({
      aiHp: 2,
      playerPlayedCard: makeCard({ id: "p1" }),
      aiPlayedCard: makeCard({ id: "a1" }),
    });
    const result = {
      playerEffectivePower: 5,
      aiEffectivePower: 1,
      playerDamage: 0,
      aiDamage: 4,
      abilityTriggered: null as any,
      abilityText: "",
    };

    const newState = applyClashResult(state, result);
    expect(newState.gameOver).toBe(true);
    expect(newState.winner).toBe("player");
    expect(newState.aiHp).toBe(0);
  });
});

describe("aiSelectCard", () => {
  it("returns a random card on first turn (lastPlayerPower null)", () => {
    const hand = [
      makeCard({ id: "a1", power: 1 }),
      makeCard({ id: "a2", power: 3 }),
      makeCard({ id: "a3", power: 5 }),
    ];
    const card = aiSelectCard(hand, null);
    expect(hand.some((c) => c.id === card.id)).toBe(true);
  });

  it("returns strongest card when player played high power (>= 4)", () => {
    const hand = [
      makeCard({ id: "a1", power: 1 }),
      makeCard({ id: "a2", power: 3 }),
      makeCard({ id: "a3", power: 5 }),
    ];
    const card = aiSelectCard(hand, 5);
    expect(card.power).toBe(5);
  });

  it("returns mid-strength card when player played low power", () => {
    const hand = [
      makeCard({ id: "a1", power: 1 }),
      makeCard({ id: "a2", power: 3 }),
      makeCard({ id: "a3", power: 5 }),
    ];
    const card = aiSelectCard(hand, 2);
    expect(card.power).toBe(3); // middle card
  });

  it("returns the only card when hand has one card", () => {
    const hand = [makeCard({ id: "a1", power: 2 })];
    const card = aiSelectCard(hand, 5);
    expect(card.id).toBe("a1");
  });

  it("throws if hand is empty", () => {
    expect(() => aiSelectCard([], null)).toThrow("AI has no cards to play");
  });
});

describe("isGameOver", () => {
  it("not over when both have HP and turns remain", () => {
    const state = makeBattleState({ playerHp: 5, aiHp: 5, turn: 2 });
    const result = isGameOver(state);
    expect(result.over).toBe(false);
  });

  it("player wins when AI HP is 0", () => {
    const state = makeBattleState({ aiHp: 0 });
    const result = isGameOver(state);
    expect(result.over).toBe(true);
    expect(result.winner).toBe("player");
  });

  it("AI wins when player HP is 0", () => {
    const state = makeBattleState({ playerHp: 0 });
    const result = isGameOver(state);
    expect(result.over).toBe(true);
    expect(result.winner).toBe("ai");
  });

  it("draw when both HP are 0", () => {
    const state = makeBattleState({ playerHp: 0, aiHp: 0 });
    const result = isGameOver(state);
    expect(result.over).toBe(true);
    expect(result.winner).toBe("draw");
  });

  it("player wins on HP when turns exhausted", () => {
    const state = makeBattleState({ playerHp: 7, aiHp: 3, turn: 5 });
    const result = isGameOver(state);
    expect(result.over).toBe(true);
    expect(result.winner).toBe("player");
  });

  it("AI wins on HP when turns exhausted", () => {
    const state = makeBattleState({ playerHp: 3, aiHp: 7, turn: 5 });
    const result = isGameOver(state);
    expect(result.over).toBe(true);
    expect(result.winner).toBe("ai");
  });

  it("draw when HP equal and turns exhausted", () => {
    const state = makeBattleState({ playerHp: 5, aiHp: 5, turn: 5 });
    const result = isGameOver(state);
    expect(result.over).toBe(true);
    expect(result.winner).toBe("draw");
  });
});

describe("calculateStars", () => {
  it("returns 3 stars for win with HP >= 8", () => {
    const state = makeBattleState({ playerHp: 9, winner: "player" });
    expect(calculateStars(state)).toBe(3);
  });

  it("returns 2 stars for win with HP >= 4 and < 8", () => {
    const state = makeBattleState({ playerHp: 5, winner: "player" });
    expect(calculateStars(state)).toBe(2);
  });

  it("returns 1 star for win with HP < 4", () => {
    const state = makeBattleState({ playerHp: 2, winner: "player" });
    expect(calculateStars(state)).toBe(1);
  });

  it("returns 0 stars for loss", () => {
    const state = makeBattleState({ playerHp: 0, winner: "ai" });
    expect(calculateStars(state)).toBe(0);
  });

  it("returns 0 stars for draw", () => {
    const state = makeBattleState({ playerHp: 5, winner: "draw" });
    expect(calculateStars(state)).toBe(0);
  });
});

describe("helper functions", () => {
  it("getAbilityEmoji returns emoji for each ability", () => {
    expect(getAbilityEmoji("shield")).toBeTruthy();
    expect(getAbilityEmoji("guard")).toBeTruthy();
    expect(getAbilityEmoji("heal")).toBeTruthy();
    expect(getAbilityEmoji("draw")).toBeTruthy();
    expect(getAbilityEmoji("boost")).toBeTruthy();
    expect(getAbilityEmoji("strike")).toBeTruthy();
  });

  it("getAbilityName returns readable name for each ability", () => {
    expect(getAbilityName("shield")).toBe("Shield");
    expect(getAbilityName("guard")).toBe("Guard");
    expect(getAbilityName("heal")).toBe("Heal");
    expect(getAbilityName("draw")).toBe("Peek");
    expect(getAbilityName("boost")).toBe("Boost");
    expect(getAbilityName("strike")).toBe("Strike");
  });

  it("getDifficultyBorder returns correct tier name", () => {
    expect(getDifficultyBorder("easy")).toBe("bronze");
    expect(getDifficultyBorder("medium")).toBe("silver");
    expect(getDifficultyBorder("hard")).toBe("gold");
  });
});
