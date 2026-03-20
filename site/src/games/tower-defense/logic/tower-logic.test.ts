import { describe, it, expect } from "vitest";
import {
  createInitialState,
  getWaves,
  canAfford,
  canUpgrade,
  getUpgradeCost,
  placeTower,
  upgradeTower,
  answerQuestion,
  enemyDefeated,
  enemyLeaked,
  startWave,
  completeWave,
  calculateStars,
  isVillageDestroyed,
  getShieldBuff,
  getSellRefund,
  sellTower,
  TOWER_DEFS,
  ENEMY_DEFS,
  PRAYER_SLOW_FACTOR,
  SHIELD_BUFF_FACTOR,
  SHEPHERD_PUSHBACK,
  MAX_TOWER_LEVEL,
  WAVE_COUNT,
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
      expect(state.totalWaves).toBe(WAVE_COUNT);
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
      expect(state.totalWaves).toBe(WAVE_COUNT);
      expect(state.difficulty).toBe("big-kids");
    });
  });

  // -----------------------------------------------------------------------
  // getWaves
  // -----------------------------------------------------------------------
  describe("getWaves", () => {
    it("returns 30 waves for little-kids", () => {
      const waves = getWaves("little-kids");
      expect(waves).toHaveLength(WAVE_COUNT);
    });

    it("returns 30 waves for big-kids", () => {
      const waves = getWaves("big-kids");
      expect(waves).toHaveLength(WAVE_COUNT);
    });

    it("wave 1 little-kids has only worry enemies", () => {
      const waves = getWaves("little-kids");
      expect(waves[0].enemies.every((e) => e === "worry")).toBe(true);
      expect(waves[0].enemies.length).toBeGreaterThanOrEqual(3);
    });

    it("big-kids wave 1 has more enemies than little-kids wave 1", () => {
      const lk = getWaves("little-kids");
      const bk = getWaves("big-kids");
      expect(bk[0].enemies.length).toBeGreaterThanOrEqual(lk[0].enemies.length);
    });

    it("later waves include doubt and fear enemies", () => {
      const waves = getWaves("little-kids");
      // By wave 10 there should be doubts
      expect(waves[9].enemies).toContain("doubt");
      // By wave 15 there should be fears
      expect(waves[14].enemies).toContain("fear");
    });

    it("last wave includes all enemy types", () => {
      const waves = getWaves("little-kids");
      const lastWave = waves[waves.length - 1];
      expect(lastWave.enemies).toContain("worry");
      expect(lastWave.enemies).toContain("doubt");
      expect(lastWave.enemies).toContain("fear");
    });

    it("enemy count increases across waves", () => {
      const waves = getWaves("little-kids");
      expect(waves[29].enemies.length).toBeGreaterThan(waves[0].enemies.length);
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
  // getUpgradeCost
  // -----------------------------------------------------------------------
  describe("getUpgradeCost", () => {
    it("returns base cost for level 1 upgrade", () => {
      expect(getUpgradeCost("prayer", 1)).toBe(75);
      expect(getUpgradeCost("light", 1)).toBe(75);
      expect(getUpgradeCost("bell", 1)).toBe(75);
    });

    it("scales cost with level", () => {
      expect(getUpgradeCost("prayer", 2)).toBe(100); // 75 + 25
      expect(getUpgradeCost("prayer", 3)).toBe(125); // 75 + 50
      expect(getUpgradeCost("prayer", 4)).toBe(150); // 75 + 75
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

    it("returns false when tower is at max level", () => {
      let state: GameState = { ...createInitialState("little-kids"), coins: 10000 };
      state = placeTower(state, "prayer", 0);
      for (let i = 0; i < MAX_TOWER_LEVEL - 1; i++) {
        state = upgradeTower(state, 1);
      }
      expect(state.towers[0].level).toBe(MAX_TOWER_LEVEL);
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

    it("can upgrade to max level with enough coins", () => {
      let state: GameState = { ...createInitialState("little-kids"), coins: 10000 };
      state = placeTower(state, "prayer", 0);
      for (let i = 0; i < MAX_TOWER_LEVEL - 1; i++) {
        state = upgradeTower(state, 1);
      }
      expect(state.towers[0].level).toBe(MAX_TOWER_LEVEL);
    });

    it("does not upgrade past max level", () => {
      let state: GameState = { ...createInitialState("little-kids"), coins: 10000 };
      state = placeTower(state, "prayer", 0);
      for (let i = 0; i < MAX_TOWER_LEVEL; i++) {
        state = upgradeTower(state, 1);
      }
      expect(state.towers[0].level).toBe(MAX_TOWER_LEVEL);
    });

    it("upgrade cost increases with level", () => {
      let state: GameState = { ...createInitialState("little-kids"), coins: 10000 };
      state = placeTower(state, "prayer", 0);
      const coinsAfterPlace = state.coins;

      state = upgradeTower(state, 1); // level 1→2, costs 75
      expect(state.coins).toBe(coinsAfterPlace - 75);

      state = upgradeTower(state, 1); // level 2→3, costs 100
      expect(state.coins).toBe(coinsAfterPlace - 75 - 100);
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
        wave: WAVE_COUNT,
        totalWaves: WAVE_COUNT,
        phase: "wave",
      };
      const next = completeWave(state);
      expect(next.phase).toBe("victory");
    });

    it("transitions to victory for little-kids last wave", () => {
      const state: GameState = {
        ...createInitialState("little-kids"),
        wave: WAVE_COUNT,
        totalWaves: WAVE_COUNT,
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
    it("has 6 tower types", () => {
      const types = Object.keys(TOWER_DEFS);
      expect(types).toHaveLength(6);
      expect(types).toContain("prayer");
      expect(types).toContain("light");
      expect(types).toContain("bell");
      expect(types).toContain("shield");
      expect(types).toContain("praise");
      expect(types).toContain("shepherd");
    });

    it("prayer tower has correct base stats", () => {
      const prayer = TOWER_DEFS.prayer;
      expect(prayer.cost).toBe(75);
      expect(prayer.range).toHaveLength(MAX_TOWER_LEVEL);
      expect(prayer.range[0]).toBe(100);
      expect(prayer.damage).toHaveLength(MAX_TOWER_LEVEL);
      expect(prayer.attackSpeed).toHaveLength(MAX_TOWER_LEVEL);
      expect(prayer.upgradeCost).toBe(75);
      expect(prayer.color).toBe(0x4488ff);
    });

    it("light tower has correct base stats", () => {
      const light = TOWER_DEFS.light;
      expect(light.cost).toBe(100);
      expect(light.range).toHaveLength(MAX_TOWER_LEVEL);
      expect(light.damage[0]).toBe(2);
      expect(light.damage[1]).toBe(3);
    });

    it("bell tower has correct base stats", () => {
      const bell = TOWER_DEFS.bell;
      expect(bell.cost).toBe(125);
      expect(bell.range).toHaveLength(MAX_TOWER_LEVEL);
      expect(bell.damage[0]).toBe(1);
      expect(bell.damage[1]).toBe(2);
    });

    it("all towers have stat arrays of length MAX_TOWER_LEVEL", () => {
      for (const def of Object.values(TOWER_DEFS)) {
        expect(def.range).toHaveLength(MAX_TOWER_LEVEL);
        expect(def.damage).toHaveLength(MAX_TOWER_LEVEL);
        expect(def.attackSpeed).toHaveLength(MAX_TOWER_LEVEL);
      }
    });

    it("tower stats improve with level", () => {
      for (const def of Object.values(TOWER_DEFS)) {
        // Higher levels should have equal or better range
        for (let i = 1; i < MAX_TOWER_LEVEL; i++) {
          expect(def.range[i]).toBeGreaterThanOrEqual(def.range[i - 1]);
          expect(def.damage[i]).toBeGreaterThanOrEqual(def.damage[i - 1]);
          // Lower attack speed = faster = better
          expect(def.attackSpeed[i]).toBeLessThanOrEqual(def.attackSpeed[i - 1]);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // ENEMY_DEFS constants
  // -----------------------------------------------------------------------
  describe("ENEMY_DEFS", () => {
    it("has 7 enemy types", () => {
      const types = Object.keys(ENEMY_DEFS);
      expect(types).toHaveLength(7);
      expect(types).toContain("worry");
      expect(types).toContain("doubt");
      expect(types).toContain("fear");
      expect(types).toContain("temptation");
      expect(types).toContain("pride");
      expect(types).toContain("envy");
      expect(types).toContain("deception");
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
    it("has correct slow percentages for all levels", () => {
      expect(PRAYER_SLOW_FACTOR[0]).toBe(0); // unused
      expect(PRAYER_SLOW_FACTOR[1]).toBe(0.4);
      expect(PRAYER_SLOW_FACTOR).toHaveLength(MAX_TOWER_LEVEL + 1);
      // Each level should slow more than the previous
      for (let i = 2; i <= MAX_TOWER_LEVEL; i++) {
        expect(PRAYER_SLOW_FACTOR[i]).toBeGreaterThan(PRAYER_SLOW_FACTOR[i - 1]);
      }
    });
  });

  // -----------------------------------------------------------------------
  // MAX_TOWER_LEVEL / WAVE_COUNT
  // -----------------------------------------------------------------------
  describe("constants", () => {
    it("MAX_TOWER_LEVEL is 5", () => {
      expect(MAX_TOWER_LEVEL).toBe(5);
    });

    it("WAVE_COUNT is 30", () => {
      expect(WAVE_COUNT).toBe(30);
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

    it("upgrade tower through multiple levels", () => {
      let state: GameState = { ...createInitialState("little-kids"), coins: 10000 };
      state = placeTower(state, "light", 0);

      // Upgrade from 1 to MAX
      for (let i = 1; i < MAX_TOWER_LEVEL; i++) {
        expect(canUpgrade(state, 1)).toBe(true);
        state = upgradeTower(state, 1);
        expect(state.towers[0].level).toBe(i + 1);
      }

      // Can't upgrade further
      expect(canUpgrade(state, 1)).toBe(false);
      expect(state.towers[0].level).toBe(MAX_TOWER_LEVEL);
    });
  });
});
