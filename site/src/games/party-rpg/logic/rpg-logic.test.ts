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
  LOOT_TABLE,
  RANDOM_EVENTS,
  type RPGState,
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
