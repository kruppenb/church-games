import { describe, it, expect, vi } from "vitest";
import {
  createHero,
  createEnemy,
  createBattleState,
  resolvePlayerAnswer,
  isBattleOver,
  isQuestComplete,
  createPartyState,
  rollLoot,
  applyLoot,
  rollRandomEvent,
  applyRandomEvent,
  applyEventChoice,
  getLootRarity,
  LOOT_TABLE,
  RANDOM_EVENTS,
  RARITY_COLORS,
  RARITY_LABELS,
  HERO_ABILITIES,
  type RPGState,
  type EventChoice,
} from "./rpg-logic";

describe("createHero", () => {
  it("sets correct name, color, and role-based stats", () => {
    const warrior = createHero("Warrior", "#ff0000");
    expect(warrior.name).toBe("Warrior");
    expect(warrior.color).toBe("#ff0000");
    expect(warrior.maxHp).toBe(120);
    expect(warrior.hp).toBe(120);
    expect(warrior.attack).toBe(25);
  });

  it("uses defaults for unknown hero names", () => {
    const custom = createHero("Bard", "#ff00ff");
    expect(custom.maxHp).toBe(100);
    expect(custom.hp).toBe(100);
    expect(custom.attack).toBe(20);
  });

  it("gives Mage high attack but lower HP", () => {
    const mage = createHero("Mage", "#0000ff");
    expect(mage.maxHp).toBe(80);
    expect(mage.attack).toBe(35);
  });
});

describe("createEnemy", () => {
  it("scales enemy HP and attack for little-kids difficulty", () => {
    const enemy = createEnemy("Dark Forest", "little-kids");
    expect(enemy.name).toBe("Dark Forest");
    expect(enemy.maxHp).toBe(80);
    expect(enemy.hp).toBe(80);
    expect(enemy.attack).toBe(10);
  });

  it("scales enemy HP and attack for big-kids difficulty", () => {
    const enemy = createEnemy("Dark Forest", "big-kids");
    expect(enemy.maxHp).toBe(150);
    expect(enemy.hp).toBe(150);
    expect(enemy.attack).toBe(20);
  });
});

describe("resolvePlayerAnswer", () => {
  function makeParty() {
    return [
      createHero("Warrior", "#ff0000"),
      createHero("Mage", "#0000ff"),
      createHero("Healer", "#00ff00"),
    ];
  }

  it("correct answer: enemy takes damage from current hero", () => {
    const heroes = makeParty();
    const enemy = createEnemy("Boss", "little-kids");
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, true);
    // Warrior attacks: 25 damage to enemy
    expect(next.enemy.hp).toBe(enemy.hp - 25);
    // Heroes are unharmed
    expect(next.heroes[0].hp).toBe(heroes[0].hp);
  });

  it("wrong answer: current hero takes damage from enemy (legacy mode)", () => {
    const heroes = makeParty();
    const enemy = createEnemy("Boss", "little-kids");
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, false);
    // Enemy attacks Warrior: 10 damage
    expect(next.heroes[0].hp).toBe(heroes[0].hp - 10);
    // Enemy is unharmed
    expect(next.enemy.hp).toBe(enemy.hp);
  });

  it("wrong answer with shared party HP: returns partyHpDelta", () => {
    const heroes = makeParty();
    const enemy = createEnemy("Boss", "little-kids");
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, false, 300);
    // In shared HP mode, individual hero HP is not changed
    expect(next.heroes[0].hp).toBe(heroes[0].hp);
    // partyHpDelta should be -enemy.attack
    expect(next.partyHpDelta).toBe(-10);
  });

  it("hero rotation: currentHeroIndex cycles through party", () => {
    const heroes = makeParty();
    const enemy = createEnemy("Boss", "little-kids");
    const state = createBattleState(heroes, enemy);

    expect(state.currentHeroIndex).toBe(0);
    const s1 = resolvePlayerAnswer(state, true);
    expect(s1.currentHeroIndex).toBe(1);
    const s2 = resolvePlayerAnswer(s1, true);
    expect(s2.currentHeroIndex).toBe(2);
    const s3 = resolvePlayerAnswer(s2, true);
    // Wraps back around
    expect(s3.currentHeroIndex).toBe(0);
  });

  it("skips dead heroes in rotation", () => {
    const heroes = makeParty();
    const enemy = createEnemy("Boss", "little-kids");
    const state = createBattleState(heroes, enemy);
    // Kill the second hero (Mage)
    state.heroes[1].hp = 0;

    const s1 = resolvePlayerAnswer(state, true);
    // Should skip index 1 (dead Mage) and go to index 2 (Healer)
    expect(s1.currentHeroIndex).toBe(2);
  });

  it("battle ends when enemy HP <= 0 (victory)", () => {
    const heroes = makeParty();
    const enemy = createEnemy("Boss", "little-kids");
    // Set enemy HP very low so one hit kills
    enemy.hp = 10;
    enemy.maxHp = 10;
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, true);
    expect(next.enemy.hp).toBe(0);
    expect(next.battleOver).toBe(true);
    expect(next.victory).toBe(true);
    expect(isBattleOver(next)).toBe(true);
  });

  it("battle ends when all heroes HP <= 0 (defeat)", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    const enemy = createEnemy("Boss", "big-kids");
    // Set hero HP very low so one hit kills
    heroes[0].hp = 5;
    heroes[0].maxHp = 5;
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, false);
    expect(next.heroes[0].hp).toBe(0);
    expect(next.battleOver).toBe(true);
    expect(next.victory).toBe(false);
    expect(isBattleOver(next)).toBe(true);
  });

  it("battle ends when shared party HP drops to 0 (defeat)", () => {
    const heroes = makeParty();
    const enemy = createEnemy("Boss", "big-kids"); // attack = 20
    const state = createBattleState(heroes, enemy);

    // Pass a partyHp that will drop to 0 after damage
    const next = resolvePlayerAnswer(state, false, 15);
    expect(next.partyHpDelta).toBe(-20);
    expect(next.battleOver).toBe(true);
    expect(next.victory).toBe(false);
  });

  it("HP does not go below zero", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    const enemy = createEnemy("Boss", "big-kids");
    heroes[0].hp = 1;
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, false);
    expect(next.heroes[0].hp).toBe(0);
  });
});

describe("isQuestComplete", () => {
  it("returns true when all locations are cleared", () => {
    const state: RPGState = {
      heroes: [],
      locationsCleared: [true, true, true],
      totalLocations: 3,
      currentLocation: null,
      partyHp: 300,
      maxPartyHp: 300,
      loot: [],
    };
    expect(isQuestComplete(state)).toBe(true);
  });

  it("returns false when some locations are not cleared", () => {
    const state: RPGState = {
      heroes: [],
      locationsCleared: [true, false, true],
      totalLocations: 3,
      currentLocation: null,
      partyHp: 300,
      maxPartyHp: 300,
      loot: [],
    };
    expect(isQuestComplete(state)).toBe(false);
  });

  it("returns false when no locations are cleared", () => {
    const state: RPGState = {
      heroes: [],
      locationsCleared: [false, false, false, false],
      totalLocations: 4,
      currentLocation: null,
      partyHp: 300,
      maxPartyHp: 300,
      loot: [],
    };
    expect(isQuestComplete(state)).toBe(false);
  });
});

describe("createPartyState", () => {
  it("initializes shared HP as sum of hero HPs", () => {
    const heroes = [
      createHero("Warrior", "#ff0000"), // hp: 120
      createHero("Mage", "#0000ff"),    // hp: 80
      createHero("Healer", "#00ff00"),  // hp: 100
    ];
    const state = createPartyState(heroes);
    expect(state.partyHp).toBe(300);
    expect(state.maxPartyHp).toBe(300);
  });

  it("starts with empty loot array", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    const state = createPartyState(heroes);
    expect(state.loot).toEqual([]);
  });

  it("clones heroes (immutable)", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    const state = createPartyState(heroes);
    heroes[0].hp = 0;
    expect(state.heroes[0].hp).toBe(120);
  });

  it("starts with empty locations", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    const state = createPartyState(heroes);
    expect(state.locationsCleared).toEqual([]);
    expect(state.totalLocations).toBe(0);
    expect(state.currentLocation).toBeNull();
  });
});

describe("rollLoot", () => {
  it("returns a LootItem or null", () => {
    // Run many times to confirm the type
    for (let i = 0; i < 50; i++) {
      const result = rollLoot();
      if (result !== null) {
        expect(result).toHaveProperty("name");
        expect(result).toHaveProperty("statBoost");
        expect(result).toHaveProperty("description");
      }
    }
  });

  it("drops loot roughly 40% of the time", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Under 0.4 => loot drops
    mockRandom.mockReturnValueOnce(0.39).mockReturnValueOnce(0);
    expect(rollLoot()).not.toBeNull();

    // 0.4 or above => no loot
    mockRandom.mockReturnValueOnce(0.4);
    expect(rollLoot()).toBeNull();

    mockRandom.mockRestore();
  });

  it("returns items from the LOOT_TABLE", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Force a loot drop, pick index 2 (Helmet of Salvation)
    mockRandom.mockReturnValueOnce(0.1).mockReturnValueOnce(0.4); // 0.4 * 5 = 2
    const result = rollLoot();
    expect(result).not.toBeNull();
    expect(result!.name).toBe(LOOT_TABLE[2].name);
    mockRandom.mockRestore();
  });
});

describe("applyLoot", () => {
  it("applies HP boost to all heroes", () => {
    const heroes = [
      createHero("Warrior", "#ff0000"),
      createHero("Mage", "#0000ff"),
    ];
    const loot = LOOT_TABLE[1]; // Shield of Faith: hp +30
    const boosted = applyLoot(heroes, loot);
    expect(boosted[0].maxHp).toBe(150); // 120 + 30
    expect(boosted[0].hp).toBe(150);
    expect(boosted[1].maxHp).toBe(110); // 80 + 30
    expect(boosted[1].hp).toBe(110);
  });

  it("applies attack boost to all heroes", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    const loot = LOOT_TABLE[0]; // Sword of Truth: attack +10
    const boosted = applyLoot(heroes, loot);
    expect(boosted[0].attack).toBe(35); // 25 + 10
    expect(boosted[0].maxHp).toBe(120); // unchanged
  });

  it("applies combined HP and attack boost", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    const loot = LOOT_TABLE[2]; // Helmet of Salvation: hp +20, attack +5
    const boosted = applyLoot(heroes, loot);
    expect(boosted[0].maxHp).toBe(140);
    expect(boosted[0].hp).toBe(140);
    expect(boosted[0].attack).toBe(30);
  });

  it("is immutable (does not modify original heroes)", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    const loot = LOOT_TABLE[0];
    applyLoot(heroes, loot);
    expect(heroes[0].attack).toBe(25);
  });
});

describe("rollRandomEvent", () => {
  it("returns a RandomEvent or null", () => {
    for (let i = 0; i < 50; i++) {
      const result = rollRandomEvent();
      if (result !== null) {
        expect(result).toHaveProperty("text");
        expect(result).toHaveProperty("effect");
        expect(result).toHaveProperty("value");
      }
    }
  });

  it("triggers roughly 30% of the time", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Under 0.3 => event triggers
    mockRandom.mockReturnValueOnce(0.29).mockReturnValueOnce(0);
    expect(rollRandomEvent()).not.toBeNull();

    // 0.3 or above => no event
    mockRandom.mockReturnValueOnce(0.3);
    expect(rollRandomEvent()).toBeNull();

    mockRandom.mockRestore();
  });

  it("returns items from RANDOM_EVENTS", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Force an event, pick index 0
    mockRandom.mockReturnValueOnce(0.1).mockReturnValueOnce(0);
    const result = rollRandomEvent();
    expect(result).not.toBeNull();
    expect(result!.text).toBe(RANDOM_EVENTS[0].text);
    mockRandom.mockRestore();
  });
});

describe("applyRandomEvent", () => {
  function makeState(): RPGState {
    const heroes = [
      createHero("Warrior", "#ff0000"),
      createHero("Mage", "#0000ff"),
    ];
    return {
      heroes,
      locationsCleared: [false, false],
      totalLocations: 2,
      currentLocation: null,
      partyHp: 200,
      maxPartyHp: 200,
      loot: [],
    };
  }

  it("heal event increases partyHp (capped at max)", () => {
    const state = makeState();
    state.partyHp = 180;
    const event = { text: "Healed!", effect: "heal" as const, value: 30 };
    const result = applyRandomEvent(state, event);
    // 180 + 30 = 210, capped at 200
    expect(result.partyHp).toBe(200);
  });

  it("heal event increases partyHp when below max", () => {
    const state = makeState();
    state.partyHp = 150;
    const event = { text: "Healed!", effect: "heal" as const, value: 20 };
    const result = applyRandomEvent(state, event);
    expect(result.partyHp).toBe(170);
  });

  it("damage event decreases partyHp (floored at 0)", () => {
    const state = makeState();
    state.partyHp = 10;
    const event = { text: "Ouch!", effect: "damage" as const, value: 25 };
    const result = applyRandomEvent(state, event);
    expect(result.partyHp).toBe(0);
  });

  it("boost event increases attack of all heroes", () => {
    const state = makeState();
    const event = { text: "Blessed!", effect: "boost" as const, value: 10 };
    const result = applyRandomEvent(state, event);
    expect(result.heroes[0].attack).toBe(35); // 25 + 10
    expect(result.heroes[1].attack).toBe(45); // 35 + 10
  });

  it("is immutable (does not modify original state)", () => {
    const state = makeState();
    const event = { text: "Damage!", effect: "damage" as const, value: 50 };
    applyRandomEvent(state, event);
    expect(state.partyHp).toBe(200);
  });
});

describe("ability system", () => {
  it("createHero initializes abilityCharge to 0", () => {
    const hero = createHero("Warrior", "#ff0000");
    expect(hero.abilityCharge).toBe(0);
  });

  it("correct answer increments ability charge", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    const enemy = createEnemy("Boss", "little-kids");
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, true);
    expect(next.heroes[0].abilityCharge).toBe(1);
  });

  it("ability triggers when charge reaches maxCharges", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    heroes[0].abilityCharge = 1;
    const enemy = createEnemy("Boss", "big-kids"); // hp=150
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, true);
    expect(next.abilityTriggered).toBeDefined();
    expect(next.abilityTriggered!.ability.name).toBe("Sword of the Spirit");
    // Warrior does 2x damage: 25 * 2 = 50
    expect(next.abilityTriggered!.damageDealt).toBe(50);
    expect(next.enemy.hp).toBe(150 - 50);
    // Charge resets
    expect(next.heroes[0].abilityCharge).toBe(0);
  });

  it("wrong answer does not charge ability", () => {
    const heroes = [createHero("Warrior", "#ff0000")];
    const enemy = createEnemy("Boss", "little-kids");
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, false, 300);
    expect(next.heroes[0].abilityCharge).toBe(0);
  });

  it("Healer ability heals party and attacks enemy", () => {
    const heroes = [createHero("Healer", "#00ff00")];
    heroes[0].abilityCharge = 1;
    const enemy = createEnemy("Boss", "little-kids"); // hp=80
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, true, 200, 300);
    expect(next.abilityTriggered).toBeDefined();
    expect(next.abilityTriggered!.ability.name).toBe("Living Water");
    // Normal attack damage
    expect(next.abilityTriggered!.damageDealt).toBe(15);
    expect(next.enemy.hp).toBe(80 - 15);
    // Heal: 30% of maxPartyHp (300) = 90
    expect(next.abilityTriggered!.healAmount).toBe(90);
    expect(next.partyHpDelta).toBe(90);
  });

  it("Ranger multi-hit ability deals correct total damage", () => {
    const heroes = [createHero("Ranger", "#795548")];
    heroes[0].abilityCharge = 1;
    const enemy = createEnemy("Boss", "big-kids"); // hp=150
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, true);
    expect(next.abilityTriggered).toBeDefined();
    // 3 hits * floor(30 * 0.6) = 3 * 18 = 54
    expect(next.abilityTriggered!.damageDealt).toBe(54);
    expect(next.enemy.hp).toBe(150 - 54);
  });

  it("Rogue ability deals 3x damage", () => {
    const heroes = [createHero("Rogue", "#8E24AA")];
    heroes[0].abilityCharge = 1;
    const enemy = createEnemy("Boss", "big-kids"); // hp=150
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, true);
    expect(next.abilityTriggered).toBeDefined();
    // 32 * 3 = 96
    expect(next.abilityTriggered!.damageDealt).toBe(96);
    expect(next.enemy.hp).toBe(150 - 96);
  });

  it("hero without ability entry uses normal attack", () => {
    const heroes = [createHero("Bard", "#ff00ff")];
    const enemy = createEnemy("Boss", "little-kids");
    const state = createBattleState(heroes, enemy);

    const next = resolvePlayerAnswer(state, true);
    expect(next.abilityTriggered).toBeUndefined();
    expect(next.enemy.hp).toBe(80 - 20); // default attack
  });

  it("HERO_ABILITIES has entries for all standard heroes", () => {
    const names = ["Warrior", "Mage", "Healer", "Ranger", "Paladin", "Rogue"];
    for (const name of names) {
      expect(HERO_ABILITIES[name]).toBeDefined();
      expect(HERO_ABILITIES[name].maxCharges).toBeGreaterThan(0);
    }
  });

  it("ability that kills enemy ends battle in victory", () => {
    const heroes = [createHero("Rogue", "#8E24AA")];
    heroes[0].abilityCharge = 1;
    const enemy = createEnemy("Boss", "little-kids"); // hp=80
    const state = createBattleState(heroes, enemy);

    // Rogue 3x: 32*3 = 96 damage, enemy has 80 HP
    const next = resolvePlayerAnswer(state, true);
    expect(next.enemy.hp).toBe(0);
    expect(next.battleOver).toBe(true);
    expect(next.victory).toBe(true);
  });
});

describe("getLootRarity", () => {
  it("returns bronze for low stat bonus (< 15)", () => {
    // Sword of Truth: attack +10, total = 10 => bronze
    expect(getLootRarity(LOOT_TABLE[0])).toBe("bronze");
  });

  it("returns silver for medium stat bonus (15-24)", () => {
    // Boots of Peace: hp +15, total = 15 => silver
    expect(getLootRarity(LOOT_TABLE[4])).toBe("silver");
    // Helmet of Salvation: hp +20, attack +5, total = 25 => gold (boundary)
    // So let's test a custom item
    expect(getLootRarity({ name: "Test", statBoost: { hp: 15 }, description: "" })).toBe("silver");
    expect(getLootRarity({ name: "Test", statBoost: { hp: 10, attack: 8 }, description: "" })).toBe("silver");
  });

  it("returns gold for high stat bonus (>= 25)", () => {
    // Helmet of Salvation: hp +20, attack +5, total = 25 => gold
    expect(getLootRarity(LOOT_TABLE[2])).toBe("gold");
    // Shield of Faith: hp +30, total = 30 => gold
    expect(getLootRarity(LOOT_TABLE[1])).toBe("gold");
  });

  it("treats missing stats as 0", () => {
    expect(getLootRarity({ name: "Empty", statBoost: {}, description: "" })).toBe("bronze");
  });
});

describe("rarity constants", () => {
  it("RARITY_COLORS has entries for all tiers", () => {
    expect(RARITY_COLORS.bronze).toBeDefined();
    expect(RARITY_COLORS.silver).toBeDefined();
    expect(RARITY_COLORS.gold).toBeDefined();
  });

  it("RARITY_LABELS has display names for all tiers", () => {
    expect(RARITY_LABELS.bronze).toBe("Common");
    expect(RARITY_LABELS.silver).toBe("Uncommon");
    expect(RARITY_LABELS.gold).toBe("Legendary");
  });
});

describe("event choices", () => {
  it("all RANDOM_EVENTS have choices array", () => {
    for (const event of RANDOM_EVENTS) {
      expect(event.choices).toBeDefined();
      expect(event.choices!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("each choice has label and effect", () => {
    for (const event of RANDOM_EVENTS) {
      for (const choice of event.choices!) {
        expect(choice.label).toBeTruthy();
        expect(["heal", "damage", "boost", "none"]).toContain(choice.effect);
        expect(typeof choice.value).toBe("number");
      }
    }
  });
});

describe("applyEventChoice", () => {
  function makeState(): RPGState {
    const heroes = [
      createHero("Warrior", "#ff0000"),
      createHero("Mage", "#0000ff"),
    ];
    return {
      heroes,
      locationsCleared: [false, false],
      totalLocations: 2,
      currentLocation: null,
      partyHp: 200,
      maxPartyHp: 200,
      loot: [],
    };
  }

  it("applies heal effect", () => {
    const state = makeState();
    state.partyHp = 150;
    const choice: EventChoice = { label: "Heal", effect: "heal", value: 30 };
    const result = applyEventChoice(state, choice);
    expect(result.partyHp).toBe(180);
  });

  it("applies damage effect", () => {
    const state = makeState();
    const choice: EventChoice = { label: "Damage", effect: "damage", value: 25 };
    const result = applyEventChoice(state, choice);
    expect(result.partyHp).toBe(175);
  });

  it("applies boost effect", () => {
    const state = makeState();
    const choice: EventChoice = { label: "Boost", effect: "boost", value: 10 };
    const result = applyEventChoice(state, choice);
    expect(result.heroes[0].attack).toBe(35); // 25 + 10
    expect(result.heroes[1].attack).toBe(45); // 35 + 10
  });

  it("applies none effect (no change)", () => {
    const state = makeState();
    const choice: EventChoice = { label: "Nothing", effect: "none", value: 0 };
    const result = applyEventChoice(state, choice);
    expect(result.partyHp).toBe(200);
    expect(result.heroes[0].attack).toBe(25);
  });

  it("applies secondary effect when chance succeeds", () => {
    const state = makeState();
    state.partyHp = 180;
    const choice: EventChoice = {
      label: "Combo",
      effect: "heal",
      value: 10,
      secondaryEffect: "boost",
      secondaryValue: 5,
      secondaryChance: 1, // always triggers
    };
    const result = applyEventChoice(state, choice);
    expect(result.partyHp).toBe(190); // 180 + 10
    expect(result.heroes[0].attack).toBe(30); // 25 + 5
  });

  it("skips secondary effect when chance fails", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // applyEventChoice calls Math.random for secondary chance check
    mockRandom.mockReturnValueOnce(0.99); // > 0.5 => secondary fails

    const state = makeState();
    const choice: EventChoice = {
      label: "Risky",
      effect: "none",
      value: 0,
      secondaryEffect: "damage",
      secondaryValue: 15,
      secondaryChance: 0.5,
    };
    const result = applyEventChoice(state, choice);
    // Secondary did not trigger, so HP unchanged
    expect(result.partyHp).toBe(200);
    mockRandom.mockRestore();
  });

  it("triggers secondary effect when chance succeeds", () => {
    const mockRandom = vi.spyOn(Math, "random");
    // Math.random returns 0.1 < 0.5 => secondary triggers
    mockRandom.mockReturnValueOnce(0.1);

    const state = makeState();
    const choice: EventChoice = {
      label: "Risky",
      effect: "none",
      value: 0,
      secondaryEffect: "damage",
      secondaryValue: 15,
      secondaryChance: 0.5,
    };
    const result = applyEventChoice(state, choice);
    // Secondary triggered: -15 damage
    expect(result.partyHp).toBe(185);
    mockRandom.mockRestore();
  });

  it("is immutable (does not modify original state)", () => {
    const state = makeState();
    const choice: EventChoice = { label: "Damage", effect: "damage", value: 50 };
    applyEventChoice(state, choice);
    expect(state.partyHp).toBe(200);
  });

  it("caps heal at maxPartyHp", () => {
    const state = makeState();
    state.partyHp = 195;
    const choice: EventChoice = { label: "Big heal", effect: "heal", value: 100 };
    const result = applyEventChoice(state, choice);
    expect(result.partyHp).toBe(200);
  });

  it("floors damage at 0", () => {
    const state = makeState();
    state.partyHp = 5;
    const choice: EventChoice = { label: "Big damage", effect: "damage", value: 100 };
    const result = applyEventChoice(state, choice);
    expect(result.partyHp).toBe(0);
  });
});
