import { describe, it, expect } from "vitest";
import {
  createInitialState,
  getWaves,
  canAfford,
  canUpgrade,
  placeTower,
  upgradeTower,
  answerQuestion,
  enemyDefeated,
  enemyLeaked,
  startWave,
  completeWave,
  calculateStars,
  isVillageDestroyed,
  TOWER_DEFS,
  ENEMY_DEFS,
  PRAYER_SLOW_FACTOR,
  type GameState,
} from "./tower-logic";

describe("tower-logic", () => {
  // -----------------------------------------------------------------------
  // createInitialState
  // -----------------------------------------------------------------------
  describe("createInitialState", () => {
    it("creates correct defaults for little-kids", () => {
      const state = createInitialState("little-kids");

      expect(state.coins).toBe(200);
      expect(state.villageHp).toBe(10);
      expect(state.maxVillageHp).toBe(10);
      expect(state.wave).toBe(0);
      expect(state.totalWaves).toBe(5);
      expect(state.towers).toEqual([]);
      expect(state.questionsCorrect).toBe(0);
      expect(state.questionsTotal).toBe(0);
      expect(state.phase).toBe("intro");
      expect(state.difficulty).toBe("little-kids");
      expect(state.nextTowerId).toBe(1);
    });

    it("creates correct defaults for big-kids", () => {
      const state = createInitialState("big-kids");

      expect(state.coins).toBe(150);
      expect(state.totalWaves).toBe(6);
      expect(state.difficulty).toBe("big-kids");
    });
  });

  // -----------------------------------------------------------------------
  // getWaves
  // -----------------------------------------------------------------------
  describe("getWaves", () => {
    it("returns 5 waves for little-kids", () => {
      const waves = getWaves("little-kids");
      expect(waves).toHaveLength(5);
    });

    it("returns 6 waves for big-kids", () => {
      const waves = getWaves("big-kids");
      expect(waves).toHaveLength(6);
    });

    it("wave 1 little-kids has 3 worry enemies", () => {
      const waves = getWaves("little-kids");
      expect(waves[0].enemies).toEqual(["worry", "worry", "worry"]);
    });

    it("wave 1 big-kids has 4 worry enemies", () => {
      const waves = getWaves("big-kids");
      expect(waves[0].enemies).toEqual(["worry", "worry", "worry", "worry"]);
    });

    it("last wave of little-kids includes fear enemies", () => {
      const waves = getWaves("little-kids");
      const lastWave = waves[waves.length - 1];
      expect(lastWave.enemies).toContain("fear");
    });

    it("last wave of big-kids includes fear enemies", () => {
      const waves = getWaves("big-kids");
      const lastWave = waves[waves.length - 1];
      expect(lastWave.enemies).toContain("fear");
    });
  });

  // -----------------------------------------------------------------------
  // canAfford
  // -----------------------------------------------------------------------
  describe("canAfford", () => {
    it("returns true when player has enough coins for prayer tower", () => {
      const state = createInitialState("little-kids"); // 200 coins
      expect(canAfford(state, "prayer")).toBe(true); // costs 75
    });

    it("returns true when player has enough coins for light tower", () => {
      const state = createInitialState("little-kids"); // 200 coins
      expect(canAfford(state, "light")).toBe(true); // costs 100
    });

    it("returns true when player has enough coins for bell tower", () => {
      const state = createInitialState("little-kids"); // 200 coins
      expect(canAfford(state, "bell")).toBe(true); // costs 125
    });

    it("returns false when player cannot afford tower", () => {
      const state: GameState = { ...createInitialState("big-kids"), coins: 50 };
      expect(canAfford(state, "prayer")).toBe(false);
      expect(canAfford(state, "light")).toBe(false);
      expect(canAfford(state, "bell")).toBe(false);
    });

    it("returns true when coins exactly match cost", () => {
      const state: GameState = { ...createInitialState("big-kids"), coins: 75 };
      expect(canAfford(state, "prayer")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // placeTower
  // -----------------------------------------------------------------------
  describe("placeTower", () => {
    it("places a tower and deducts coins", () => {
      const state = createInitialState("little-kids"); // 200 coins
      const next = placeTower(state, "prayer", 0);

      expect(next.towers).toHaveLength(1);
      expect(next.towers[0].type).toBe("prayer");
      expect(next.towers[0].level).toBe(1);
      expect(next.towers[0].spotIndex).toBe(0);
      expect(next.coins).toBe(200 - 75);
    });

    it("assigns incrementing IDs to towers", () => {
      let state = createInitialState("little-kids");
      state = placeTower(state, "prayer", 0);
      state = placeTower(state, "light", 1);

      expect(state.towers[0].id).toBe(1);
      expect(state.towers[1].id).toBe(2);
      expect(state.nextTowerId).toBe(3);
    });

    it("does not place tower if insufficient coins", () => {
      const state: GameState = { ...createInitialState("big-kids"), coins: 10 };
      const next = placeTower(state, "prayer", 0);

      expect(next.towers).toHaveLength(0);
      expect(next.coins).toBe(10);
    });

    it("does not place tower on occupied spot", () => {
      let state = createInitialState("little-kids");
      state = placeTower(state, "prayer", 0);
      const next = placeTower(state, "light", 0);

      expect(next.towers).toHaveLength(1);
      expect(next.towers[0].type).toBe("prayer");
    });

    it("can place multiple towers on different spots", () => {
      let state = createInitialState("little-kids"); // 200 coins
      state = placeTower(state, "prayer", 0); // -75 = 125
      state = placeTower(state, "light", 1); // -100 = 25

      expect(state.towers).toHaveLength(2);
      expect(state.coins).toBe(25);
    });
  });

  // -----------------------------------------------------------------------
  // canUpgrade / upgradeTower
  // -----------------------------------------------------------------------
  describe("canUpgrade", () => {
    it("returns true when tower is level 1 and player can afford", () => {
      let state = createInitialState("little-kids");
      state = placeTower(state, "prayer", 0); // costs 75, leaves 125
      expect(canUpgrade(state, 1)).toBe(true); // upgrade costs 75
    });

    it("returns false when tower is already level 2", () => {
      let state = createInitialState("little-kids");
      state = placeTower(state, "prayer", 0);
      state = upgradeTower(state, 1);
      expect(canUpgrade(state, 1)).toBe(false);
    });

    it("returns false when player cannot afford upgrade", () => {
      let state: GameState = { ...createInitialState("big-kids"), coins: 80 };
      state = placeTower(state, "prayer", 0); // -75 = 5 coins
      expect(canUpgrade(state, 1)).toBe(false);
    });

    it("returns false for nonexistent tower", () => {
      const state = createInitialState("little-kids");
      expect(canUpgrade(state, 999)).toBe(false);
    });
  });

  describe("upgradeTower", () => {
    it("upgrades tower to level 2 and deducts coins", () => {
      let state = createInitialState("little-kids"); // 200
      state = placeTower(state, "prayer", 0); // -75 = 125
      state = upgradeTower(state, 1); // -75 = 50

      expect(state.towers[0].level).toBe(2);
      expect(state.coins).toBe(50);
    });

    it("does not upgrade past level 2", () => {
      let state = createInitialState("little-kids");
      state = placeTower(state, "prayer", 0);
      state = upgradeTower(state, 1);
      const next = upgradeTower(state, 1);

      expect(next.towers[0].level).toBe(2);
      expect(next.coins).toBe(state.coins); // no change
    });

    it("does not upgrade when insufficient coins", () => {
      let state: GameState = { ...createInitialState("big-kids"), coins: 80 };
      state = placeTower(state, "prayer", 0); // -75 = 5
      const next = upgradeTower(state, 1);

      expect(next.towers[0].level).toBe(1);
      expect(next.coins).toBe(5);
    });

    it("returns unchanged state for nonexistent tower", () => {
      const state = createInitialState("little-kids");
      const next = upgradeTower(state, 999);

      expect(next).toEqual(state);
    });
  });

  // -----------------------------------------------------------------------
  // answerQuestion
  // -----------------------------------------------------------------------
  describe("answerQuestion", () => {
    it("correct answer gives +100 coins, +1 HP, increments correct/total", () => {
      const state = createInitialState("big-kids");
      const next = answerQuestion(state, true);

      expect(next.coins).toBe(150 + 100);
      expect(next.questionsCorrect).toBe(1);
      expect(next.questionsTotal).toBe(1);
      expect(next.villageHp).toBe(10); // already at max, clamped
    });

    it("correct answer heals village HP when below max", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 7,
      };
      const next = answerQuestion(state, true);
      expect(next.villageHp).toBe(8);
    });

    it("correct answer does not exceed max village HP", () => {
      const state = createInitialState("big-kids"); // villageHp: 10, maxVillageHp: 10
      const next = answerQuestion(state, true);
      expect(next.villageHp).toBe(10);
    });

    it("wrong answer gives +50 coins, increments total only", () => {
      const state = createInitialState("big-kids");
      const next = answerQuestion(state, false);

      expect(next.coins).toBe(150 + 50);
      expect(next.questionsCorrect).toBe(0);
      expect(next.questionsTotal).toBe(1);
      expect(next.villageHp).toBe(10); // no change
    });

    it("accumulates across multiple questions", () => {
      let state = createInitialState("big-kids");
      state = answerQuestion(state, true);
      state = answerQuestion(state, false);
      state = answerQuestion(state, true);

      expect(state.questionsCorrect).toBe(2);
      expect(state.questionsTotal).toBe(3);
      expect(state.coins).toBe(150 + 100 + 50 + 100);
    });
  });

  // -----------------------------------------------------------------------
  // enemyDefeated
  // -----------------------------------------------------------------------
  describe("enemyDefeated", () => {
    it("adds 5 coins per enemy defeated", () => {
      const state = createInitialState("big-kids");
      const next = enemyDefeated(state);

      expect(next.coins).toBe(150 + 5);
    });

    it("accumulates across multiple defeats", () => {
      let state = createInitialState("big-kids");
      for (let i = 0; i < 10; i++) {
        state = enemyDefeated(state);
      }
      expect(state.coins).toBe(150 + 50);
    });
  });

  // -----------------------------------------------------------------------
  // enemyLeaked
  // -----------------------------------------------------------------------
  describe("enemyLeaked", () => {
    it("worry enemy deals 1 damage to village", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        phase: "wave",
      };
      const next = enemyLeaked(state, "worry", 3);

      expect(next.villageHp).toBe(9);
    });

    it("fear enemy deals 2 damage to village", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        phase: "wave",
      };
      const next = enemyLeaked(state, "fear", 3);

      expect(next.villageHp).toBe(8);
    });

    it("sets defeat phase when village HP reaches 0", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 1,
        phase: "wave",
      };
      const next = enemyLeaked(state, "worry", 3);

      expect(next.villageHp).toBe(0);
      expect(next.phase).toBe("defeat");
    });

    it("clamps village HP to 0", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 1,
        phase: "wave",
      };
      const next = enemyLeaked(state, "fear", 3); // 2 damage when HP=1

      expect(next.villageHp).toBe(0);
      expect(next.phase).toBe("defeat");
    });

    it("little-kids waves 1-2 deal no damage (learning period)", () => {
      const state: GameState = {
        ...createInitialState("little-kids"),
        phase: "wave",
      };
      const afterWave1 = enemyLeaked(state, "worry", 1);
      expect(afterWave1.villageHp).toBe(10);

      const afterWave2 = enemyLeaked(state, "worry", 2);
      expect(afterWave2.villageHp).toBe(10);
    });

    it("little-kids wave 3+ deals normal damage", () => {
      const state: GameState = {
        ...createInitialState("little-kids"),
        phase: "wave",
      };
      const next = enemyLeaked(state, "worry", 3);
      expect(next.villageHp).toBe(9);
    });

    it("big-kids wave 1 does deal damage", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        phase: "wave",
      };
      const next = enemyLeaked(state, "worry", 1);
      expect(next.villageHp).toBe(9);
    });
  });

  // -----------------------------------------------------------------------
  // startWave / completeWave
  // -----------------------------------------------------------------------
  describe("startWave", () => {
    it("increments wave number and sets phase to wave", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        phase: "placement",
      };
      const next = startWave(state);

      expect(next.wave).toBe(1);
      expect(next.phase).toBe("wave");
    });

    it("increments from current wave", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        wave: 3,
        phase: "placement",
      };
      const next = startWave(state);
      expect(next.wave).toBe(4);
    });
  });

  describe("completeWave", () => {
    it("adds +25 passive income", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        wave: 1,
        phase: "wave",
      };
      const next = completeWave(state);
      expect(next.coins).toBe(150 + 25);
    });

    it("transitions to question phase when not last wave", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        wave: 1,
        phase: "wave",
      };
      const next = completeWave(state);
      expect(next.phase).toBe("question");
    });

    it("transitions to victory phase on last wave", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        wave: 6,
        totalWaves: 6,
        phase: "wave",
      };
      const next = completeWave(state);
      expect(next.phase).toBe("victory");
    });

    it("transitions to victory for little-kids last wave", () => {
      const state: GameState = {
        ...createInitialState("little-kids"),
        wave: 5,
        totalWaves: 5,
        phase: "wave",
      };
      const next = completeWave(state);
      expect(next.phase).toBe("victory");
    });
  });

  // -----------------------------------------------------------------------
  // calculateStars
  // -----------------------------------------------------------------------
  describe("calculateStars", () => {
    it("returns 3 stars for HP >= 8", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 8,
      };
      expect(calculateStars(state)).toBe(3);
    });

    it("returns 3 stars for full HP", () => {
      const state = createInitialState("big-kids");
      expect(calculateStars(state)).toBe(3);
    });

    it("returns 2 stars for HP >= 5 but < 8", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 5,
      };
      expect(calculateStars(state)).toBe(2);
    });

    it("returns 2 stars for HP = 7", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 7,
      };
      expect(calculateStars(state)).toBe(2);
    });

    it("returns 1 star for HP >= 1 but < 5", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 1,
      };
      expect(calculateStars(state)).toBe(1);
    });

    it("returns 0 stars for HP = 0", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 0,
      };
      expect(calculateStars(state)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // isVillageDestroyed
  // -----------------------------------------------------------------------
  describe("isVillageDestroyed", () => {
    it("returns false for initial state", () => {
      expect(isVillageDestroyed(createInitialState("big-kids"))).toBe(false);
    });

    it("returns true when village HP is 0", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 0,
      };
      expect(isVillageDestroyed(state)).toBe(true);
    });

    it("returns false when village has any HP", () => {
      const state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 1,
      };
      expect(isVillageDestroyed(state)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // TOWER_DEFS constants
  // -----------------------------------------------------------------------
  describe("TOWER_DEFS", () => {
    it("has 3 tower types", () => {
      const types = Object.keys(TOWER_DEFS);
      expect(types).toHaveLength(3);
      expect(types).toContain("prayer");
      expect(types).toContain("light");
      expect(types).toContain("bell");
    });

    it("prayer tower has correct stats", () => {
      const prayer = TOWER_DEFS.prayer;
      expect(prayer.cost).toBe(75);
      expect(prayer.range).toEqual([100, 140]);
      expect(prayer.damage).toEqual([1, 1]);
      expect(prayer.attackSpeed).toEqual([3000, 2000]);
      expect(prayer.upgradeCost).toBe(75);
      expect(prayer.color).toBe(0x4488ff);
    });

    it("light tower has correct stats", () => {
      const light = TOWER_DEFS.light;
      expect(light.cost).toBe(100);
      expect(light.range).toEqual([120, 120]);
      expect(light.damage).toEqual([2, 3]);
      expect(light.attackSpeed).toEqual([1500, 1000]);
    });

    it("bell tower has correct stats", () => {
      const bell = TOWER_DEFS.bell;
      expect(bell.cost).toBe(125);
      expect(bell.range).toEqual([80, 100]);
      expect(bell.damage).toEqual([1, 2]);
      expect(bell.attackSpeed).toEqual([3000, 2500]);
    });

    it("all towers have range arrays of length 2", () => {
      for (const def of Object.values(TOWER_DEFS)) {
        expect(def.range).toHaveLength(2);
        expect(def.damage).toHaveLength(2);
        expect(def.attackSpeed).toHaveLength(2);
      }
    });
  });

  // -----------------------------------------------------------------------
  // ENEMY_DEFS constants
  // -----------------------------------------------------------------------
  describe("ENEMY_DEFS", () => {
    it("has 3 enemy types", () => {
      const types = Object.keys(ENEMY_DEFS);
      expect(types).toHaveLength(3);
      expect(types).toContain("worry");
      expect(types).toContain("doubt");
      expect(types).toContain("fear");
    });

    it("worry enemy has correct stats", () => {
      const worry = ENEMY_DEFS.worry;
      expect(worry.hp).toBe(3);
      expect(worry.speed).toBe(40);
      expect(worry.villageDamage).toBe(1);
      expect(worry.size).toBe(10);
    });

    it("doubt enemy has correct stats", () => {
      const doubt = ENEMY_DEFS.doubt;
      expect(doubt.hp).toBe(6);
      expect(doubt.speed).toBe(60);
      expect(doubt.villageDamage).toBe(1);
      expect(doubt.size).toBe(14);
    });

    it("fear enemy has correct stats", () => {
      const fear = ENEMY_DEFS.fear;
      expect(fear.hp).toBe(15);
      expect(fear.speed).toBe(30);
      expect(fear.villageDamage).toBe(2);
      expect(fear.size).toBe(20);
    });
  });

  // -----------------------------------------------------------------------
  // PRAYER_SLOW_FACTOR
  // -----------------------------------------------------------------------
  describe("PRAYER_SLOW_FACTOR", () => {
    it("has correct slow percentages", () => {
      expect(PRAYER_SLOW_FACTOR[1]).toBe(0.4);
      expect(PRAYER_SLOW_FACTOR[2]).toBe(0.6);
    });
  });

  // -----------------------------------------------------------------------
  // Integration / multi-step scenarios
  // -----------------------------------------------------------------------
  describe("integration scenarios", () => {
    it("full game flow: place towers, answer questions, progress waves", () => {
      let state = createInitialState("big-kids"); // 150 coins

      // Answer first question correctly
      state = answerQuestion(state, true); // +100 = 250 coins

      // Place towers
      state = placeTower(state, "light", 0); // -100 = 150
      state = placeTower(state, "prayer", 1); // -75 = 75

      expect(state.towers).toHaveLength(2);
      expect(state.coins).toBe(75);

      // Start wave 1
      state = startWave(state);
      expect(state.wave).toBe(1);
      expect(state.phase).toBe("wave");

      // Defeat some enemies
      state = enemyDefeated(state);
      state = enemyDefeated(state);
      expect(state.coins).toBe(85);

      // One enemy leaks
      state = enemyLeaked(state, "worry", 1);
      expect(state.villageHp).toBe(9);

      // Complete wave
      state = completeWave(state); // +25 = 110
      expect(state.phase).toBe("question");
      expect(state.coins).toBe(110);
    });

    it("little-kids tutorial waves protect village", () => {
      let state = createInitialState("little-kids");

      // Start wave 1
      state = startWave(state);

      // All enemies leak through - no damage
      state = enemyLeaked(state, "worry", 1);
      state = enemyLeaked(state, "worry", 1);
      state = enemyLeaked(state, "worry", 1);
      expect(state.villageHp).toBe(10);

      // Complete wave 1
      state = completeWave(state);

      // Answer question, start wave 2
      state = answerQuestion(state, true);
      state = startWave(state);

      // All leak through wave 2 - still no damage
      for (let i = 0; i < 5; i++) {
        state = enemyLeaked(state, "worry", 2);
      }
      expect(state.villageHp).toBe(10); // still at max (but also healed from question)
    });

    it("village destruction triggers defeat", () => {
      let state: GameState = {
        ...createInitialState("big-kids"),
        villageHp: 2,
        wave: 3,
        phase: "wave",
      };

      state = enemyLeaked(state, "fear", 3); // fear does 2 damage
      expect(state.villageHp).toBe(0);
      expect(state.phase).toBe("defeat");
      expect(isVillageDestroyed(state)).toBe(true);
    });

    it("upgrade after earning coins from questions", () => {
      let state = createInitialState("big-kids"); // 150
      state = placeTower(state, "prayer", 0); // -75 = 75

      // Can't upgrade yet (need 75 for upgrade)
      expect(canUpgrade(state, 1)).toBe(true); // exactly 75

      state = upgradeTower(state, 1); // -75 = 0
      expect(state.towers[0].level).toBe(2);
      expect(state.coins).toBe(0);

      // Earn more coins
      state = answerQuestion(state, true); // +100 = 100
      expect(state.coins).toBe(100);
    });
  });
});
