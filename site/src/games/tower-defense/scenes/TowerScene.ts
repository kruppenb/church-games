import Phaser from "phaser";
import type { LessonConfig, Question } from "@/types/lesson";
import { QuestionPool } from "@/lib/question-pool";
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
  getBossHp,
  cycleTowerTargeting,
  hasPrayerLightSynergy,
  selectHero,
  TOWER_DEFS,
  HERO_DEFS,
  ENEMY_DEFS,
  PRAYER_SLOW_FACTOR,
  SHIELD_BUFF_FACTOR,
  SHEPHERD_PUSHBACK,
  MAX_TOWER_LEVEL,
  type GameState,
  type TowerType,
  type EnemyType,
  type WaveConfig,
  type TowerState,
  type HeroType,
} from "../logic/tower-logic";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const GAME_W = 800;
const GAME_H = 600;

/** Path waypoints that enemies follow. */
const PATH_WAYPOINTS = [
  { x: 0, y: 300 },
  { x: 200, y: 300 },
  { x: 200, y: 150 },
  { x: 600, y: 150 },
  { x: 600, y: 450 },
  { x: 800, y: 450 },
];

/** Placement spot positions (offset from path). 16 spots for 30 waves. */
const PLACEMENT_SPOTS = [
  // First horizontal segment (y=300)
  { x: 100, y: 360 },
  { x: 150, y: 250 },
  // First turn (x=200)
  { x: 140, y: 190 },
  { x: 250, y: 200 },
  // Middle horizontal segment (y=150)
  { x: 300, y: 210 },
  { x: 350, y: 100 },
  { x: 400, y: 210 },
  { x: 450, y: 100 },
  { x: 500, y: 210 },
  // Second turn (x=600)
  { x: 550, y: 200 },
  { x: 660, y: 220 },
  { x: 550, y: 350 },
  { x: 660, y: 340 },
  // Final horizontal segment (y=450)
  { x: 650, y: 400 },
  { x: 700, y: 500 },
  { x: 750, y: 400 },
];

const HUD_HEIGHT = 40;
const TOWER_STRIP_HEIGHT = 60;
const TOWER_STRIP_Y = GAME_H - TOWER_STRIP_HEIGHT;

const ANSWER_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00];
const ANSWER_LABELS = ["A", "B", "C", "D"];

// Enemy spawn interval during wave (ms)
const ENEMY_SPAWN_INTERVAL = 800;

// Pray button cooldown (ms)
const PRAY_COOLDOWN = 8000;
const PRAY_BOOST_DURATION = 2000;

// Tutorial auto-place delay (ms)
const AUTO_PLACE_DELAY = 8000;

// ---------------------------------------------------------------------------
// Runtime enemy data
// ---------------------------------------------------------------------------

interface ActiveEnemy {
  sprite: Phaser.GameObjects.Arc;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  shieldSprite?: Phaser.GameObjects.Arc; // Pride Golem shield visual
  type: EnemyType;
  hp: number;
  maxHp: number;
  speed: number;
  waypointIndex: number; // current target waypoint
  slowFactor: number; // 0 = no slow, 0.4 = 40% slow, etc.
  slowTimer: number; // ms remaining on slow
  alive: boolean;
  stealthed: boolean; // Temptation: currently invisible
  shieldHitsRemaining: number; // Pride Golem: hits left before shield breaks
  isSplit: boolean; // Whether this is a split mini-enemy from Envy Swarm
  summonTimer: number; // Pharaoh: ms until next summon
  regenAccum: number; // Serpent: accumulated regen time
}

interface ActiveTower {
  state: TowerState;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Arc;
  rangeCircle: Phaser.GameObjects.Arc;
  labelText: Phaser.GameObjects.Text;
  attackTimer: number; // ms until next attack
  glowing: boolean;
  praiseChargeTimer?: number; // ms elapsed for Praise Tower charge
  praiseGlow?: Phaser.GameObjects.Arc; // visual glow for Praise Tower
  shieldAura?: Phaser.GameObjects.Arc; // visual aura for Shield Tower buff
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export class TowerScene extends Phaser.Scene {
  // Game state (logic layer)
  private gameState!: GameState;
  private waves!: WaveConfig[];
  private questionPool!: QuestionPool;
  private currentQuestion: Question | null = null;
  private lesson!: LessonConfig;

  // Runtime collections
  private activeEnemies: ActiveEnemy[] = [];
  private activeTowers: ActiveTower[] = [];

  // Wave spawning
  private enemiesToSpawn: EnemyType[] = [];
  private spawnTimer = 0;

  // Graphics layers
  private pathGraphics!: Phaser.GameObjects.Graphics;
  private spotGraphics!: Phaser.GameObjects.Graphics;
  private effectsGraphics!: Phaser.GameObjects.Graphics;

  // HUD elements
  private coinText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;

  // Tower strip elements
  private towerStripBg!: Phaser.GameObjects.Rectangle;
  private towerStripCircles: Phaser.GameObjects.Arc[] = [];
  private towerStripLabels: Phaser.GameObjects.Text[] = [];
  private towerStripCosts: Phaser.GameObjects.Text[] = [];
  private towerStripLocks: Phaser.GameObjects.Text[] = [];

  // Placement UI
  private selectedSpot: number | null = null;
  private spotCircles: Phaser.GameObjects.Arc[] = [];
  private towerSelectionGroup: Phaser.GameObjects.Container | null = null;
  private upgradeButton: Phaser.GameObjects.Container | null = null;

  // Buttons
  private startWaveButton: Phaser.GameObjects.Container | null = null;
  private prayButton: Phaser.GameObjects.Container | null = null;
  private prayOnCooldown = false;
  private prayActive = false;

  // Question overlay
  private questionOverlay: Phaser.GameObjects.Container | null = null;

  // Village
  private villageGraphics!: Phaser.GameObjects.Graphics;
  private villageGlow!: Phaser.GameObjects.Arc;

  // Floating texts
  private floatingTexts: { text: Phaser.GameObjects.Text; life: number }[] = [];

  // Intro / Victory / Defeat overlays
  private overlayContainer: Phaser.GameObjects.Container | null = null;

  // Fast forward
  private fastForward = false;
  private fastForwardButton: Phaser.GameObjects.Container | null = null;

  // Hero ability
  private heroAbilityButton: Phaser.GameObjects.Container | null = null;
  private heroAbilityCooldown = 0; // ms remaining
  private heroAbilityActive = false;
  private estherBoostActive = false;

  // Pulsing entrance arrow
  private entranceArrow!: Phaser.GameObjects.Text;

  // Tutorial tracking
  private autoPlaceTimer = 0;
  private tutorialPlaced = false;

  // Wave 1 only Light tower available flag
  private get isFirstWave(): boolean {
    return this.gameState.wave === 0 || this.gameState.wave === 1;
  }

  constructor() {
    super({ key: "TowerScene" });
  }

  // =========================================================================
  // CREATE
  // =========================================================================

  create(): void {
    this.lesson = this.registry.get("lesson") as LessonConfig;
    const difficulty = this.registry.get("difficulty") as
      | "little-kids"
      | "big-kids";

    this.gameState = createInitialState(difficulty);
    this.waves = getWaves(difficulty);
    this.questionPool = new QuestionPool(this.lesson.questions, difficulty);

    this.activeEnemies = [];
    this.activeTowers = [];
    this.floatingTexts = [];
    this.enemiesToSpawn = [];

    this.createPath();
    this.createVillage();
    this.createPlacementSpots();
    this.createHud();
    this.createTowerStrip();
    this.createEntranceArrow();

    // Effects layer (drawn each frame)
    this.effectsGraphics = this.add.graphics();
    this.effectsGraphics.setDepth(50);

    this.showIntroOverlay();
  }

  // =========================================================================
  // Path rendering
  // =========================================================================

  private createPath(): void {
    this.pathGraphics = this.add.graphics();
    this.pathGraphics.lineStyle(6, 0x554433, 0.6);
    this.pathGraphics.beginPath();
    this.pathGraphics.moveTo(PATH_WAYPOINTS[0].x, PATH_WAYPOINTS[0].y);
    for (let i = 1; i < PATH_WAYPOINTS.length; i++) {
      this.pathGraphics.lineTo(PATH_WAYPOINTS[i].x, PATH_WAYPOINTS[i].y);
    }
    this.pathGraphics.strokePath();

    // Draw a wider faint background path
    const bgPath = this.add.graphics();
    bgPath.lineStyle(20, 0x443322, 0.2);
    bgPath.beginPath();
    bgPath.moveTo(PATH_WAYPOINTS[0].x, PATH_WAYPOINTS[0].y);
    for (let i = 1; i < PATH_WAYPOINTS.length; i++) {
      bgPath.lineTo(PATH_WAYPOINTS[i].x, PATH_WAYPOINTS[i].y);
    }
    bgPath.strokePath();
    bgPath.setDepth(0);
    this.pathGraphics.setDepth(1);
  }

  // =========================================================================
  // Village (simple house shape at end of path)
  // =========================================================================

  private createVillage(): void {
    const vx = PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1].x - 30;
    const vy = PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1].y - 30;

    this.villageGraphics = this.add.graphics();
    this.villageGraphics.setDepth(2);

    // Body
    this.villageGraphics.fillStyle(0x886644, 1);
    this.villageGraphics.fillRect(vx - 15, vy, 30, 25);

    // Roof (triangle)
    this.villageGraphics.fillStyle(0xcc4444, 1);
    this.villageGraphics.fillTriangle(vx - 20, vy, vx + 20, vy, vx, vy - 18);

    // Door
    this.villageGraphics.fillStyle(0x553311, 1);
    this.villageGraphics.fillRect(vx - 5, vy + 10, 10, 15);

    // Warning glow (shown when HP low)
    this.villageGlow = this.add.circle(vx, vy + 5, 35, 0xff0000, 0);
    this.villageGlow.setDepth(1);
  }

  // =========================================================================
  // Placement spots
  // =========================================================================

  private createPlacementSpots(): void {
    this.spotGraphics = this.add.graphics();
    this.spotGraphics.setDepth(5);
    this.spotCircles = [];

    for (let i = 0; i < PLACEMENT_SPOTS.length; i++) {
      const spot = PLACEMENT_SPOTS[i];
      const circle = this.add.circle(spot.x, spot.y, 18, 0x88ff88, 0.15);
      circle.setStrokeStyle(2, 0x88ff88, 0.5);
      circle.setDepth(5);
      circle.setInteractive({ useHandCursor: true });
      circle.on("pointerdown", () => this.onSpotClicked(i));
      this.spotCircles.push(circle);
    }
  }

  // =========================================================================
  // HUD (top bar)
  // =========================================================================

  private createHud(): void {
    // Background bar
    const hudBg = this.add.rectangle(
      GAME_W / 2,
      HUD_HEIGHT / 2,
      GAME_W,
      HUD_HEIGHT,
      0x000000,
      0.6,
    );
    hudBg.setDepth(80);

    this.coinText = this.add.text(10, 8, "", {
      fontSize: "18px",
      color: "#ffdd00",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    });
    this.coinText.setDepth(81);

    this.hpText = this.add.text(200, 8, "", {
      fontSize: "18px",
      color: "#ff6666",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    });
    this.hpText.setDepth(81);

    this.waveText = this.add.text(450, 8, "", {
      fontSize: "18px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    });
    this.waveText.setDepth(81);

    this.updateHud();
  }

  private updateHud(): void {
    this.coinText.setText(`Coins: ${this.gameState.coins}`);
    this.hpText.setText(
      `Village HP: ${this.gameState.villageHp}/${this.gameState.maxVillageHp}`,
    );
    const waveDisplay = Math.max(1, this.gameState.wave);
    this.waveText.setText(
      `Wave: ${waveDisplay}/${this.gameState.totalWaves}`,
    );

    // Village warning glow
    if (this.villageGlow) {
      this.villageGlow.setAlpha(
        this.gameState.villageHp <= 3 ? 0.3 + 0.15 * Math.sin(this.time.now / 300) : 0,
      );
    }
  }

  // =========================================================================
  // Tower strip (bottom bar)
  // =========================================================================

  private createTowerStrip(): void {
    this.towerStripBg = this.add.rectangle(
      GAME_W / 2,
      TOWER_STRIP_Y + TOWER_STRIP_HEIGHT / 2,
      GAME_W,
      TOWER_STRIP_HEIGHT,
      0x000000,
      0.7,
    );
    this.towerStripBg.setDepth(80);

    const towerTypes: TowerType[] = ["prayer", "light", "bell", "shield", "praise", "shepherd"];
    const spacing = 125;
    const totalWidth = (towerTypes.length - 1) * spacing;
    const startX = (GAME_W - totalWidth) / 2;

    this.towerStripCircles = [];
    this.towerStripLabels = [];
    this.towerStripCosts = [];
    this.towerStripLocks = [];

    for (let i = 0; i < towerTypes.length; i++) {
      const def = TOWER_DEFS[towerTypes[i]];
      const cx = startX + i * spacing;
      const cy = TOWER_STRIP_Y + TOWER_STRIP_HEIGHT / 2;

      const circle = this.add.circle(cx - 30, cy, 14, def.color, 0.8);
      circle.setDepth(81);
      this.towerStripCircles.push(circle);

      const label = this.add.text(cx - 10, cy - 14, def.label, {
        fontSize: "11px",
        color: "#ffffff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      });
      label.setDepth(81);
      this.towerStripLabels.push(label);

      const cost = this.add.text(cx - 10, cy + 2, `${def.cost}`, {
        fontSize: "10px",
        color: "#ffdd00",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      });
      cost.setDepth(81);
      this.towerStripCosts.push(cost);

      const lock = this.add.text(cx - 30, cy - 4, "", {
        fontSize: "10px",
        color: "#ff6666",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "bold",
      });
      lock.setOrigin(0.5);
      lock.setDepth(82);
      lock.setVisible(false);
      this.towerStripLocks.push(lock);
    }
  }

  private updateTowerStrip(): void {
    const towerTypes: TowerType[] = ["prayer", "light", "bell", "shield", "praise", "shepherd"];
    for (let i = 0; i < towerTypes.length; i++) {
      const affordable = canAfford(this.gameState, towerTypes[i]);
      // On wave 1 (tutorial), only Light tower available
      const available =
        this.gameState.wave <= 1 && this.gameState.difficulty === "little-kids"
          ? towerTypes[i] === "light"
          : true;

      const locked = !affordable || !available;
      this.towerStripCircles[i].setAlpha(locked ? 0.3 : 0.8);
      this.towerStripLocks[i].setVisible(locked);
      if (locked) {
        if (!available) {
          this.towerStripLocks[i].setText("Locked");
        } else {
          this.towerStripLocks[i].setText("Low $");
        }
      }
    }
  }

  // =========================================================================
  // Entrance arrow
  // =========================================================================

  private createEntranceArrow(): void {
    this.entranceArrow = this.add.text(
      PATH_WAYPOINTS[0].x + 10,
      PATH_WAYPOINTS[0].y - 30,
      ">>>",
      {
        fontSize: "20px",
        color: "#ff8800",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "bold",
      },
    );
    this.entranceArrow.setDepth(10);
  }

  // =========================================================================
  // Show/hide game elements during overlays
  // =========================================================================

  private setGameElementsVisible(visible: boolean): void {
    // Tower labels
    for (const tower of this.activeTowers) {
      tower.labelText.setVisible(visible);
    }
    // Placement circles
    for (const circle of this.spotCircles) {
      if (visible) {
        // Only show unoccupied spots
        const idx = this.spotCircles.indexOf(circle);
        const occupied = this.activeTowers.some((t) => t.state.spotIndex === idx);
        circle.setVisible(!occupied);
      } else {
        circle.setVisible(false);
      }
    }
    // Tower strip
    this.towerStripBg.setVisible(visible);
    for (const c of this.towerStripCircles) c.setVisible(visible);
    for (const l of this.towerStripLabels) l.setVisible(visible);
    for (const c of this.towerStripCosts) c.setVisible(visible);
    for (const l of this.towerStripLocks) l.setVisible(visible);
  }

  // =========================================================================
  // OVERLAYS: Intro
  // =========================================================================

  private showIntroOverlay(): void {
    this.overlayContainer?.destroy();
    this.setGameElementsVisible(false);
    const container = this.add.container(0, 0);
    container.setDepth(100);

    // Dim background
    const bg = this.add.rectangle(
      GAME_W / 2,
      GAME_H / 2,
      GAME_W,
      GAME_H,
      0x000000,
      0.95,
    );
    container.add(bg);

    const titleText = this.add.text(GAME_W / 2, 120, "Faith Fortress", {
      fontSize: "36px",
      color: "#ffdd00",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    titleText.setOrigin(0.5);
    container.add(titleText);

    const subtitleText = this.add.text(
      GAME_W / 2,
      170,
      this.lesson.meta.title,
      {
        fontSize: "18px",
        color: "#ffffff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        wordWrap: { width: 600 },
      },
    );
    subtitleText.setOrigin(0.5);
    container.add(subtitleText);

    const verseText = this.add.text(
      GAME_W / 2,
      220,
      `"${this.lesson.meta.verseText}"`,
      {
        fontSize: "14px",
        color: "#aaddff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "italic",
        wordWrap: { width: 550 },
        align: "center",
      },
    );
    verseText.setOrigin(0.5);
    container.add(verseText);

    const refText = this.add.text(
      GAME_W / 2,
      verseText.y + verseText.height / 2 + 20,
      `- ${this.lesson.meta.verseReference}`,
      {
        fontSize: "13px",
        color: "#88bbdd",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      },
    );
    refText.setOrigin(0.5);
    container.add(refText);

    const infoText = this.add.text(
      GAME_W / 2,
      350,
      "Defend your village from Worry, Doubt, and Fear!\nPlace towers between waves to protect the path.",
      {
        fontSize: "14px",
        color: "#cccccc",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        align: "center",
        wordWrap: { width: 600 },
      },
    );
    infoText.setOrigin(0.5);
    container.add(infoText);

    // Start button
    const btnBg = this.add.rectangle(GAME_W / 2, 450, 180, 50, 0x44aa44, 1);
    btnBg.setInteractive({ useHandCursor: true });
    const btnText = this.add.text(GAME_W / 2, 450, "Start!", {
      fontSize: "22px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5);
    container.add(btnBg);
    container.add(btnText);

    btnBg.on("pointerdown", () => {
      container.destroy();
      this.overlayContainer = null;
      this.showHeroSelectOverlay();
    });

    this.overlayContainer = container;
  }

  // =========================================================================
  // HERO SELECTION
  // =========================================================================

  private showHeroSelectOverlay(): void {
    this.overlayContainer?.destroy();
    this.setGameElementsVisible(false);
    this.gameState = { ...this.gameState, phase: "hero-select" };

    const container = this.add.container(0, 0);
    container.setDepth(100);

    const bg = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.95);
    container.add(bg);

    const title = this.add.text(GAME_W / 2, 80, "Choose Your Hero", {
      fontSize: "28px",
      color: "#ffdd00",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    title.setOrigin(0.5);
    container.add(title);

    const heroTypes: HeroType[] = ["david", "moses", "esther"];
    const cardW = 200;
    const spacing = 220;
    const startX = GAME_W / 2 - spacing;

    for (let i = 0; i < heroTypes.length; i++) {
      const heroDef = HERO_DEFS[heroTypes[i]];
      const cx = startX + i * spacing;
      const cy = 300;

      // Card background
      const cardBg = this.add.rectangle(cx, cy, cardW, 250, 0x222244, 0.9);
      cardBg.setStrokeStyle(2, heroDef.color, 0.8);
      cardBg.setInteractive({ useHandCursor: true });
      container.add(cardBg);

      // Hero icon (colored circle)
      const icon = this.add.circle(cx, cy - 70, 30, heroDef.color, 0.9);
      icon.setStrokeStyle(2, 0xffffff, 0.5);
      container.add(icon);

      // Hero name
      const name = this.add.text(cx, cy - 25, heroDef.label, {
        fontSize: "18px",
        color: "#ffffff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "bold",
      });
      name.setOrigin(0.5);
      container.add(name);

      // Ability name
      const abilName = this.add.text(cx, cy + 5, heroDef.abilityName, {
        fontSize: "14px",
        color: "#ffaa00",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "bold",
      });
      abilName.setOrigin(0.5);
      container.add(abilName);

      // Ability description
      const abilDesc = this.add.text(cx, cy + 35, heroDef.abilityDesc, {
        fontSize: "11px",
        color: "#cccccc",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        wordWrap: { width: cardW - 20 },
        align: "center",
      });
      abilDesc.setOrigin(0.5);
      container.add(abilDesc);

      // Cooldown info
      const cdText = this.add.text(cx, cy + 75, `Cooldown: ${heroDef.cooldown / 1000}s`, {
        fontSize: "10px",
        color: "#888888",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      });
      cdText.setOrigin(0.5);
      container.add(cdText);

      // Select button
      const selectBg = this.add.rectangle(cx, cy + 105, 100, 30, heroDef.color, 0.8);
      selectBg.setInteractive({ useHandCursor: true });
      container.add(selectBg);

      const selectText = this.add.text(cx, cy + 105, "Select", {
        fontSize: "14px",
        color: "#ffffff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "bold",
      });
      selectText.setOrigin(0.5);
      container.add(selectText);

      const heroType = heroTypes[i];
      selectBg.on("pointerdown", () => {
        this.gameState = selectHero(this.gameState, heroType);
        container.destroy();
        this.overlayContainer = null;
        this.transitionToQuestion();
      });

      cardBg.on("pointerdown", () => {
        this.gameState = selectHero(this.gameState, heroType);
        container.destroy();
        this.overlayContainer = null;
        this.transitionToQuestion();
      });
    }

    this.overlayContainer = container;
  }

  // =========================================================================
  // QUESTION PHASE
  // =========================================================================

  private transitionToQuestion(): void {
    this.gameState = { ...this.gameState, phase: "question" };

    // Get next question (reset pool if exhausted)
    if (!this.questionPool.hasMore()) {
      this.questionPool.reset();
    }
    this.currentQuestion = this.questionPool.next();
    if (!this.currentQuestion) {
      // No questions at all, skip to placement
      this.transitionToPlacement();
      return;
    }

    this.showQuestionOverlay(this.currentQuestion);
  }

  private showQuestionOverlay(question: Question): void {
    this.questionOverlay?.destroy();
    this.setGameElementsVisible(false);
    const container = this.add.container(0, 0);
    container.setDepth(100);

    // Dim background
    const bg = this.add.rectangle(
      GAME_W / 2,
      GAME_H / 2,
      GAME_W,
      GAME_H,
      0x000000,
      0.95,
    );
    container.add(bg);

    // Show story scene description if available
    const sceneIndex = Math.max(0, this.gameState.wave); // wave 0 -> scene 0, etc.
    const storyScene = this.lesson.story?.scenes?.[sceneIndex];
    let yOffset = 80;

    if (storyScene) {
      const sceneTitle = this.add.text(
        GAME_W / 2,
        yOffset,
        storyScene.title,
        {
          fontSize: "16px",
          color: "#ffdd00",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          fontStyle: "bold",
        },
      );
      sceneTitle.setOrigin(0.5);
      container.add(sceneTitle);
      yOffset += 45;

      const sceneDesc = this.add.text(
        GAME_W / 2,
        yOffset,
        storyScene.description,
        {
          fontSize: "14px",
          color: "#ccccdd",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          wordWrap: { width: 600 },
          align: "center",
        },
      );
      sceneDesc.setOrigin(0.5);
      container.add(sceneDesc);
      yOffset += sceneDesc.height + 25;
    }

    // Question text
    const qText = this.add.text(GAME_W / 2, yOffset + 20, question.text, {
      fontSize: "18px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      wordWrap: { width: 650 },
      align: "center",
    });
    qText.setOrigin(0.5);
    container.add(qText);

    // Answer buttons (2x2 grid) — positioned below question text dynamically
    const btnW = 320;
    const btnH = 50;
    const startY = Math.min(430, qText.y + qText.height / 2 + 25);
    const positions = [
      { x: GAME_W / 2 - btnW / 2 - 10, y: startY },
      { x: GAME_W / 2 + btnW / 2 + 10, y: startY },
      { x: GAME_W / 2 - btnW / 2 - 10, y: startY + btnH + 15 },
      { x: GAME_W / 2 + btnW / 2 + 10, y: startY + btnH + 15 },
    ];

    for (let i = 0; i < question.options.length; i++) {
      const pos = positions[i];
      const btnBg = this.add.rectangle(pos.x, pos.y, btnW, btnH, ANSWER_COLORS[i], 0.85);
      btnBg.setInteractive({ useHandCursor: true });
      container.add(btnBg);

      const optionText = this.add.text(
        pos.x,
        pos.y,
        `${ANSWER_LABELS[i]}. ${question.options[i]}`,
        {
          fontSize: "14px",
          color: "#ffffff",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          wordWrap: { width: btnW - 20 },
          align: "center",
        },
      );
      optionText.setOrigin(0.5);
      container.add(optionText);

      btnBg.on("pointerdown", () => {
        this.handleAnswer(i, question, container);
      });
    }

    this.questionOverlay = container;
  }

  private handleAnswer(
    selectedIndex: number,
    question: Question,
    container: Phaser.GameObjects.Container,
  ): void {
    const correct = selectedIndex === question.correctIndex;
    this.gameState = answerQuestion(this.gameState, correct);
    this.updateHud();

    // Show feedback
    this.showAnswerFeedback(correct, question, container);
  }

  private showAnswerFeedback(
    correct: boolean,
    question: Question,
    container: Phaser.GameObjects.Container,
  ): void {
    // Clear existing content and show feedback
    container.removeAll(true);

    const bg = this.add.rectangle(
      GAME_W / 2,
      GAME_H / 2,
      GAME_W,
      GAME_H,
      0x000000,
      0.95,
    );
    container.add(bg);

    const emoji = correct ? "+" : "x";
    const resultColor = correct ? "#44ff44" : "#ff4444";
    const resultText = correct ? "Correct! +100 coins" : "Not quite! +50 coins";

    const resultLabel = this.add.text(GAME_W / 2, 200, emoji, {
      fontSize: "48px",
      color: resultColor,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    resultLabel.setOrigin(0.5);
    container.add(resultLabel);

    const msgText = this.add.text(GAME_W / 2, 270, resultText, {
      fontSize: "22px",
      color: resultColor,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    msgText.setOrigin(0.5);
    container.add(msgText);

    const explainText = this.add.text(
      GAME_W / 2,
      330,
      question.explanation,
      {
        fontSize: "14px",
        color: "#cccccc",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        wordWrap: { width: 600 },
        align: "center",
      },
    );
    explainText.setOrigin(0.5);
    container.add(explainText);

    // Floating coin text at HUD
    this.spawnFloatingText(
      100,
      50,
      correct ? "+100" : "+50",
      correct ? "#44ff44" : "#ffaa00",
    );

    // Continue button
    const btnBg = this.add.rectangle(GAME_W / 2, 430, 180, 50, 0x4488ff, 1);
    btnBg.setInteractive({ useHandCursor: true });
    const btnText = this.add.text(GAME_W / 2, 430, "Continue", {
      fontSize: "20px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5);
    container.add(btnBg);
    container.add(btnText);

    btnBg.on("pointerdown", () => {
      container.destroy();
      this.questionOverlay = null;
      this.transitionToPlacement();
    });
  }

  // =========================================================================
  // PLACEMENT PHASE
  // =========================================================================

  private transitionToPlacement(): void {
    this.gameState = { ...this.gameState, phase: "placement" };
    this.autoPlaceTimer = 0;
    this.tutorialPlaced = false;
    this.setGameElementsVisible(true);
    this.updateHud();
    this.updateTowerStrip();
    this.updateSpotVisuals();
    this.showRangeCircles(true);
    this.showStartWaveButton();

    // Show hint text for early waves
    if (this.gameState.wave <= 1) {
      const hint = this.add.text(
        GAME_W / 2,
        GAME_H / 2 + 60,
        "Tap a green circle to place a tower!",
        {
          fontSize: "16px",
          color: "#88ff88",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          fontStyle: "bold",
        },
      );
      hint.setOrigin(0.5);
      hint.setDepth(70);
      this.time.delayedCall(5000, () => hint.destroy());
    }
  }

  private updateSpotVisuals(): void {
    for (let i = 0; i < this.spotCircles.length; i++) {
      const occupied = this.activeTowers.some(
        (t) => t.state.spotIndex === i,
      );
      const circle = this.spotCircles[i];
      circle.setVisible(!occupied);
    }
  }

  private showRangeCircles(visible: boolean): void {
    for (const tower of this.activeTowers) {
      tower.rangeCircle.setVisible(visible);
    }
  }

  private showStartWaveButton(): void {
    this.startWaveButton?.destroy();
    const container = this.add.container(0, 0);
    container.setDepth(90);

    const btnBg = this.add.rectangle(GAME_W - 100, HUD_HEIGHT + 30, 150, 40, 0x44aa44, 1);
    btnBg.setInteractive({ useHandCursor: true });
    const btnText = this.add.text(
      GAME_W - 100,
      HUD_HEIGHT + 30,
      "Start Wave!",
      {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "bold",
      },
    );
    btnText.setOrigin(0.5);
    container.add(btnBg);
    container.add(btnText);

    btnBg.on("pointerdown", () => {
      this.startWaveButton?.destroy();
      this.startWaveButton = null;
      this.transitionToWave();
    });

    this.startWaveButton = container;
  }

  private onSpotClicked(spotIndex: number): void {
    if (this.gameState.phase !== "placement") return;

    // Check if spot has a tower (for upgrade)
    const existing = this.activeTowers.find(
      (t) => t.state.spotIndex === spotIndex,
    );
    if (existing) {
      this.showUpgradeUI(existing);
      return;
    }

    // Show tower selection
    this.selectedSpot = spotIndex;
    this.showTowerSelection(spotIndex);
  }

  private showTowerSelection(spotIndex: number): void {
    this.towerSelectionGroup?.destroy();
    this.upgradeButton?.destroy();
    this.upgradeButton = null;

    const spot = PLACEMENT_SPOTS[spotIndex];
    const container = this.add.container(0, 0);
    container.setDepth(90);

    const towerTypes: TowerType[] = ["prayer", "light", "bell", "shield", "praise", "shepherd"];
    // On tutorial wave (wave 0 for little-kids), only allow Light
    const available =
      this.gameState.wave <= 0 && this.gameState.difficulty === "little-kids"
        ? (["light"] as TowerType[])
        : towerTypes;

    const count = available.length;
    const spacing = 50;
    const panelW = count * spacing + 30;
    // Clamp panel center to stay within screen bounds
    const selMargin = 5;
    let selPanelX = spot.x;
    if (selPanelX - panelW / 2 < selMargin) {
      selPanelX = selMargin + panelW / 2;
    } else if (selPanelX + panelW / 2 > GAME_W - selMargin) {
      selPanelX = GAME_W - selMargin - panelW / 2;
    }
    const startX = selPanelX - ((count - 1) * spacing) / 2;

    // Background panel
    const panelBg = this.add.rectangle(selPanelX, spot.y - 55, panelW, 75, 0x222233, 0.9);
    panelBg.setStrokeStyle(2, 0x4488ff, 0.6);
    container.add(panelBg);

    for (let i = 0; i < available.length; i++) {
      const tType = available[i];
      const def = TOWER_DEFS[tType];
      const cx = startX + i * spacing;
      const cy = spot.y - 55;

      const affordable = canAfford(this.gameState, tType);
      const alpha = affordable ? 1 : 0.3;

      // Tower name label above the circle
      const nameText = this.add.text(cx, cy - 28, def.label, {
        fontSize: "9px",
        color: affordable ? "#ffffff" : "#666666",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      });
      nameText.setOrigin(0.5);
      container.add(nameText);

      const circle = this.add.circle(cx, cy - 8, 16, def.color, alpha);
      circle.setInteractive({ useHandCursor: affordable });
      container.add(circle);

      const costText = this.add.text(cx, cy + 14, `${def.cost}`, {
        fontSize: "11px",
        color: affordable ? "#ffdd00" : "#666666",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      });
      costText.setOrigin(0.5);
      container.add(costText);

      if (affordable) {
        circle.on("pointerdown", () => {
          this.handlePlaceTower(tType, spotIndex);
          this.towerSelectionGroup?.destroy();
          this.towerSelectionGroup = null;
        });
      }
    }

    // Close button
    const closeBtn = this.add.text(selPanelX + panelW / 2 - 5, spot.y - 80, "X", {
      fontSize: "14px",
      color: "#ff4444",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    closeBtn.setOrigin(0.5);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on("pointerdown", () => {
      this.towerSelectionGroup?.destroy();
      this.towerSelectionGroup = null;
    });
    container.add(closeBtn);

    this.towerSelectionGroup = container;
  }

  private showUpgradeUI(tower: ActiveTower): void {
    this.towerSelectionGroup?.destroy();
    this.towerSelectionGroup = null;
    this.upgradeButton?.destroy();

    const container = this.add.container(0, 0);
    container.setDepth(90);

    const def = TOWER_DEFS[tower.state.type];
    const canUpg = tower.state.level < MAX_TOWER_LEVEL && canUpgrade(this.gameState, tower.state.id);
    const atMax = tower.state.level >= MAX_TOWER_LEVEL;

    // Clamp panel position to stay within screen bounds
    const panelW = 160;
    const panelH = 80;
    const margin = 5;
    let panelX = tower.x;
    const panelY = tower.y - 60;
    // Clamp horizontally
    if (panelX - panelW / 2 < margin) {
      panelX = margin + panelW / 2;
    } else if (panelX + panelW / 2 > GAME_W - margin) {
      panelX = GAME_W - margin - panelW / 2;
    }

    const panelBg = this.add.rectangle(panelX, panelY, panelW, panelH, 0x222233, 0.9);
    panelBg.setStrokeStyle(2, 0xaa44ff, 0.6);
    container.add(panelBg);

    // -- Upgrade section (top row) --
    if (!atMax) {
      const upgCost = getUpgradeCost(tower.state.type, tower.state.level);
      const affordable = canUpg;

      const upgBtn = this.add.rectangle(panelX - 30, panelY - 20, 90, 22, affordable ? 0x4488ff : 0x333333, 0.8);
      if (affordable) upgBtn.setInteractive({ useHandCursor: true });
      container.add(upgBtn);

      const upgText = this.add.text(panelX - 30, panelY - 20, `Upg L${tower.state.level + 1} (${upgCost})`, {
        fontSize: "10px",
        color: affordable ? "#ffffff" : "#666666",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      });
      upgText.setOrigin(0.5);
      container.add(upgText);

      if (affordable) {
        upgBtn.on("pointerdown", () => {
          this.gameState = upgradeTower(this.gameState, tower.state.id);
          const updatedState = this.gameState.towers.find((t) => t.id === tower.state.id);
          if (updatedState) {
            tower.state = updatedState;
            const range = def.range[updatedState.level - 1];
            tower.rangeCircle.setRadius(range);
            tower.labelText.setText(`${def.label} L${updatedState.level}`);
          }
          this.updateHud();
          this.updateTowerStrip();
          this.upgradeButton?.destroy();
          this.upgradeButton = null;
        });
      }
    } else {
      const maxText = this.add.text(panelX - 30, panelY - 20, "MAX LEVEL", {
        fontSize: "10px",
        color: "#ffdd00",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "bold",
      });
      maxText.setOrigin(0.5);
      container.add(maxText);
    }

    // -- Sell button (top right) --
    const refund = getSellRefund(tower.state.type, tower.state.level);
    const sellBtn = this.add.rectangle(panelX + 50, panelY - 20, 50, 22, 0xcc3333, 0.8);
    sellBtn.setInteractive({ useHandCursor: true });
    container.add(sellBtn);

    const sellText = this.add.text(panelX + 50, panelY - 20, `Sell +${refund}`, {
      fontSize: "9px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    });
    sellText.setOrigin(0.5);
    container.add(sellText);

    sellBtn.on("pointerdown", () => {
      // Remove tower visuals
      tower.sprite.destroy();
      tower.rangeCircle.destroy();
      tower.labelText.destroy();
      tower.praiseGlow?.destroy();
      tower.shieldAura?.destroy();

      this.activeTowers = this.activeTowers.filter((t) => t !== tower);
      this.gameState = sellTower(this.gameState, tower.state.id);
      this.updateHud();
      this.updateTowerStrip();
      this.updateSpotVisuals();
      this.spawnFloatingText(tower.x, tower.y - 20, `+${refund}`, "#ffdd00");

      this.upgradeButton?.destroy();
      this.upgradeButton = null;
    });

    // -- Targeting priority button (bottom row) --
    const targetingLabel = tower.state.targeting.charAt(0).toUpperCase() + tower.state.targeting.slice(1);
    const targetBtn = this.add.rectangle(panelX, panelY + 12, 140, 22, 0x336633, 0.8);
    targetBtn.setInteractive({ useHandCursor: true });
    container.add(targetBtn);

    const targetText = this.add.text(panelX, panelY + 12, `Target: ${targetingLabel}`, {
      fontSize: "10px",
      color: "#88ff88",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    });
    targetText.setOrigin(0.5);
    container.add(targetText);

    targetBtn.on("pointerdown", () => {
      this.gameState = cycleTowerTargeting(this.gameState, tower.state.id);
      const updatedState = this.gameState.towers.find((t) => t.id === tower.state.id);
      if (updatedState) {
        tower.state = updatedState;
        const newLabel = updatedState.targeting.charAt(0).toUpperCase() + updatedState.targeting.slice(1);
        targetText.setText(`Target: ${newLabel}`);
      }
    });

    // Close on click elsewhere after brief delay
    this.time.delayedCall(100, () => {
      this.input.once("pointerdown", () => {
        this.upgradeButton?.destroy();
        this.upgradeButton = null;
      });
    });

    this.upgradeButton = container;
  }

  private handlePlaceTower(towerType: TowerType, spotIndex: number): void {
    if (!canAfford(this.gameState, towerType)) return;

    this.gameState = placeTower(this.gameState, towerType, spotIndex);
    const newTowerState = this.gameState.towers[this.gameState.towers.length - 1];
    this.createTowerVisual(newTowerState);
    this.updateHud();
    this.updateTowerStrip();
    this.updateSpotVisuals();
    this.tutorialPlaced = true;
  }

  private createTowerVisual(towerState: TowerState): void {
    const spot = PLACEMENT_SPOTS[towerState.spotIndex];
    const def = TOWER_DEFS[towerState.type];
    const range = def.range[towerState.level - 1];

    const sprite = this.add.circle(spot.x, spot.y, 14, def.color, 1);
    sprite.setStrokeStyle(2, 0xffffff, 0.5);
    sprite.setDepth(10);
    sprite.setInteractive({ useHandCursor: true });

    const rangeCircle = this.add.circle(spot.x, spot.y, range, def.color, 0.08);
    rangeCircle.setStrokeStyle(1, def.color, 0.3);
    rangeCircle.setDepth(4);
    rangeCircle.setVisible(this.gameState.phase === "placement");

    const labelText = this.add.text(
      spot.x,
      spot.y + 20,
      `${def.label} L${towerState.level}`,
      {
        fontSize: "10px",
        color: "#ffffff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      },
    );
    labelText.setOrigin(0.5);
    labelText.setDepth(11);

    const activeTower: ActiveTower = {
      state: towerState,
      x: spot.x,
      y: spot.y,
      sprite,
      rangeCircle,
      labelText,
      attackTimer: 0,
      glowing: false,
    };

    sprite.on("pointerdown", () => {
      if (this.gameState.phase === "placement") {
        this.showUpgradeUI(activeTower);
      }
    });

    this.activeTowers.push(activeTower);
  }

  // =========================================================================
  // WAVE PHASE
  // =========================================================================

  private transitionToWave(): void {
    this.towerSelectionGroup?.destroy();
    this.towerSelectionGroup = null;
    this.upgradeButton?.destroy();
    this.upgradeButton = null;

    this.gameState = startWave(this.gameState);
    this.updateHud();
    this.showRangeCircles(false);

    // Get wave config
    const waveIndex = this.gameState.wave - 1;
    const waveConfig = this.waves[waveIndex];
    if (!waveConfig) {
      // Should not happen
      this.gameState = { ...this.gameState, phase: "victory" };
      this.showVictoryOverlay();
      return;
    }

    // Queue enemies for spawning
    this.enemiesToSpawn = [...waveConfig.enemies];
    this.spawnTimer = 0;

    // Boss wave announcement
    if (waveConfig.isBossWave && waveConfig.bossType) {
      const bossName = ENEMY_DEFS[waveConfig.bossType].label;
      this.showBossAnnouncement(bossName);
    }

    // Show Pray button
    this.showPrayButton();
  }

  private showPrayButton(): void {
    this.prayButton?.destroy();
    const container = this.add.container(0, 0);
    container.setDepth(85);

    const btnBg = this.add.rectangle(GAME_W - 80, HUD_HEIGHT + 30, 120, 36, 0x6644cc, 1);
    btnBg.setInteractive({ useHandCursor: true });
    const btnText = this.add.text(GAME_W - 80, HUD_HEIGHT + 30, "Pray!", {
      fontSize: "16px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5);
    container.add(btnBg);
    container.add(btnText);

    btnBg.on("pointerdown", () => {
      if (!this.prayOnCooldown) {
        this.activatePrayBoost();
      }
    });

    this.prayButton = container;
    this.prayOnCooldown = false;
    this.prayActive = false;

    // Fast forward button
    this.showFastForwardButton();

    // Hero ability button
    this.showHeroAbilityButton();
  }

  private showFastForwardButton(): void {
    this.fastForwardButton?.destroy();
    // Preserve the current fast forward state across waves (don't reset)

    const container = this.add.container(0, 0);
    container.setDepth(85);

    const btnBg = this.add.rectangle(GAME_W - 80, HUD_HEIGHT + 70, 80, 30,
      this.fastForward ? 0x886600 : 0x444444, 0.8);
    btnBg.setInteractive({ useHandCursor: true });
    const btnText = this.add.text(GAME_W - 80, HUD_HEIGHT + 70, this.fastForward ? "2x" : "1x", {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5);
    container.add(btnBg);
    container.add(btnText);

    btnBg.on("pointerdown", () => {
      this.fastForward = !this.fastForward;
      btnText.setText(this.fastForward ? "2x" : "1x");
      btnBg.setFillStyle(this.fastForward ? 0x886600 : 0x444444, 0.8);
    });

    this.fastForwardButton = container;
  }

  private showHeroAbilityButton(): void {
    this.heroAbilityButton?.destroy();
    if (!this.gameState.hero) return;

    const heroDef = HERO_DEFS[this.gameState.hero];
    const container = this.add.container(0, 0);
    container.setDepth(85);

    const btnX = 80;
    const btnY = HUD_HEIGHT + 30;

    const btnBg = this.add.rectangle(btnX, btnY, 130, 36, heroDef.color, 0.8);
    btnBg.setInteractive({ useHandCursor: true });
    container.add(btnBg);

    const btnText = this.add.text(btnX, btnY - 6, heroDef.abilityName, {
      fontSize: "12px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5);
    container.add(btnText);

    const cdText = this.add.text(btnX, btnY + 10, "Ready!", {
      fontSize: "10px",
      color: "#88ff88",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    });
    cdText.setOrigin(0.5);
    container.add(cdText);

    btnBg.on("pointerdown", () => {
      if (this.heroAbilityCooldown <= 0) {
        this.activateHeroAbility();
        this.heroAbilityCooldown = heroDef.cooldown;
      }
    });

    // Store references for cooldown display updates
    (container as unknown as { cdText: Phaser.GameObjects.Text; btnBg: Phaser.GameObjects.Rectangle }).cdText = cdText;
    (container as unknown as { btnBg: Phaser.GameObjects.Rectangle }).btnBg = btnBg;

    this.heroAbilityButton = container;
  }

  private activateHeroAbility(): void {
    if (!this.gameState.hero) return;

    switch (this.gameState.hero) {
      case "david":
        this.activateDavidAbility();
        break;
      case "moses":
        this.activateMosesAbility();
        break;
      case "esther":
        this.activateEstherAbility();
        break;
    }
  }

  private activateDavidAbility(): void {
    // Deal 50 damage to strongest enemy
    const aliveEnemies = this.activeEnemies.filter((e) => e.alive);
    if (aliveEnemies.length === 0) return;

    let strongest = aliveEnemies[0];
    for (const e of aliveEnemies) {
      if (e.hp > strongest.hp) strongest = e;
    }

    this.damageEnemy(strongest, 50);
    this.spawnFloatingText(strongest.sprite.x, strongest.sprite.y - 30, "Slingshot! -50", "#aa8844");

    // Visual: projectile arc
    const proj = this.add.circle(GAME_W / 2, GAME_H, 6, 0xaa8844, 1);
    proj.setDepth(35);
    this.tweens.add({
      targets: proj,
      x: strongest.sprite.x,
      y: strongest.sprite.y,
      duration: 300,
      ease: "Quad.easeOut",
      onComplete: () => proj.destroy(),
    });
  }

  private activateMosesAbility(): void {
    // Freeze all enemies for 3 seconds
    for (const e of this.activeEnemies) {
      if (!e.alive) continue;
      e.slowFactor = 1; // Complete freeze
      e.slowTimer = 3000;
    }
    this.spawnFloatingText(GAME_W / 2, GAME_H / 2, "Part the Waters!", "#4488cc");

    // Visual: blue wave across screen
    const wave = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, 40, 0x4488cc, 0.3);
    wave.setDepth(35);
    this.tweens.add({
      targets: wave,
      height: GAME_H,
      alpha: 0,
      duration: 800,
      onComplete: () => wave.destroy(),
    });
  }

  private activateEstherAbility(): void {
    // All towers 3x faster for 5 seconds
    this.estherBoostActive = true;
    this.spawnFloatingText(GAME_W / 2, GAME_H / 2, "Brave Petition!", "#cc44aa");

    // Visual: pink glow on all towers
    for (const tower of this.activeTowers) {
      tower.sprite.setStrokeStyle(3, 0xcc44aa, 1);
    }

    this.time.delayedCall(5000, () => {
      this.estherBoostActive = false;
      for (const tower of this.activeTowers) {
        if (!tower.glowing) {
          tower.sprite.setStrokeStyle(2, 0xffffff, 0.5);
        }
      }
    });
  }

  private activatePrayBoost(): void {
    this.prayActive = true;
    this.prayOnCooldown = true;

    // All towers glow gold
    for (const tower of this.activeTowers) {
      tower.glowing = true;
      tower.sprite.setStrokeStyle(3, 0xffdd00, 1);
    }

    // End boost after duration
    this.time.delayedCall(PRAY_BOOST_DURATION, () => {
      this.prayActive = false;
      for (const tower of this.activeTowers) {
        tower.glowing = false;
        tower.sprite.setStrokeStyle(2, 0xffffff, 0.5);
      }
    });

    // Cooldown reset
    this.time.delayedCall(PRAY_COOLDOWN, () => {
      this.prayOnCooldown = false;
    });

    this.spawnFloatingText(GAME_W / 2, 100, "Pray boost!", "#ffdd00");
  }

  // =========================================================================
  // Enemy spawning & management
  // =========================================================================

  private spawnEnemy(type: EnemyType, atPosition?: { x: number; y: number; waypointIndex: number }, overrideHp?: number, overrideSpeed?: number): void {
    const def = ENEMY_DEFS[type];
    const startX = atPosition?.x ?? PATH_WAYPOINTS[0].x;
    const startY = atPosition?.y ?? PATH_WAYPOINTS[0].y;
    const startWaypoint = atPosition?.waypointIndex ?? 1;

    const alpha = def.alpha ?? 1;
    const isStealth = def.stealth ?? false;

    const sprite = this.add.circle(startX, startY, def.size, def.color, isStealth ? 0 : alpha);
    sprite.setDepth(20);

    // HP bar background
    const hpBarBg = this.add.rectangle(
      startX,
      startY - def.size - 6,
      def.size * 2,
      4,
      0x333333,
      0.8,
    );
    hpBarBg.setDepth(21);

    // HP bar foreground
    const hpBar = this.add.rectangle(
      startX,
      startY - def.size - 6,
      def.size * 2,
      4,
      0x44ff44,
      1,
    );
    hpBar.setDepth(22);

    // Scale enemy stats with wave number so late waves stay challenging
    const hpMultiplier = 1 + (this.gameState.wave - 1) * 0.1;
    const speedMultiplier = 1 + (this.gameState.wave - 1) * 0.015;

    let scaledHp: number;
    if (overrideHp) {
      scaledHp = overrideHp;
    } else if (def.isBoss) {
      // Boss HP uses getBossHp for difficulty scaling, no wave scaling
      scaledHp = getBossHp(type, this.gameState.difficulty);
    } else {
      scaledHp = Math.round(def.hp * hpMultiplier);
    }
    const scaledSpeed = overrideSpeed ?? def.speed * speedMultiplier;

    // Pride Golem shield visual
    let shieldSprite: Phaser.GameObjects.Arc | undefined;
    if (def.shieldHits) {
      shieldSprite = this.add.circle(startX, startY, def.size + 4, 0xddaa44, 0.3);
      shieldSprite.setStrokeStyle(2, 0xddaa44, 0.6);
      shieldSprite.setDepth(19);
    }

    // Stealth enemies: hide HP bars initially
    if (isStealth) {
      hpBarBg.setAlpha(0);
      hpBar.setAlpha(0);
    }

    const enemy: ActiveEnemy = {
      sprite,
      hpBar,
      hpBarBg,
      shieldSprite,
      type,
      hp: scaledHp,
      maxHp: scaledHp,
      speed: scaledSpeed,
      waypointIndex: startWaypoint,
      slowFactor: 0,
      slowTimer: 0,
      alive: true,
      stealthed: isStealth,
      shieldHitsRemaining: def.shieldHits ?? 0,
      isSplit: !!atPosition,
      summonTimer: def.summonInterval ?? 0,
      regenAccum: 0,
    };

    this.activeEnemies.push(enemy);
  }

  private moveEnemies(delta: number): void {
    for (const enemy of this.activeEnemies) {
      if (!enemy.alive) continue;

      const target = PATH_WAYPOINTS[enemy.waypointIndex];
      if (!target) {
        // Reached end of path - leak
        this.handleEnemyLeak(enemy);
        continue;
      }

      // Calculate movement
      const dx = target.x - enemy.sprite.x;
      const dy = target.y - enemy.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        // Reached waypoint, move to next
        enemy.waypointIndex++;
        if (enemy.waypointIndex >= PATH_WAYPOINTS.length) {
          this.handleEnemyLeak(enemy);
        }
        continue;
      }

      const effectiveSpeed = enemy.speed * (1 - enemy.slowFactor);
      const move = (effectiveSpeed * delta) / 1000;
      const ratio = Math.min(move / dist, 1);

      enemy.sprite.x += dx * ratio;
      enemy.sprite.y += dy * ratio;

      // Update HP bar position
      const def = ENEMY_DEFS[enemy.type];
      enemy.hpBarBg.x = enemy.sprite.x;
      enemy.hpBarBg.y = enemy.sprite.y - def.size - 6;
      enemy.hpBar.x = enemy.sprite.x;
      enemy.hpBar.y = enemy.sprite.y - def.size - 6;

      // Update HP bar width
      const fraction = enemy.hp / enemy.maxHp;
      enemy.hpBar.width = def.size * 2 * fraction;

      // HP bar color
      if (fraction < 0.3) {
        enemy.hpBar.setFillStyle(0xff4444, 1);
      } else if (fraction < 0.6) {
        enemy.hpBar.setFillStyle(0xffaa00, 1);
      }

      // Update Pride Golem shield position
      if (enemy.shieldSprite) {
        enemy.shieldSprite.x = enemy.sprite.x;
        enemy.shieldSprite.y = enemy.sprite.y;
      }

      // Stealth: check proximity to towers
      if (enemy.stealthed) {
        const revealRange = ENEMY_DEFS[enemy.type].stealthRevealRange ?? 80;
        let nearTower = false;
        for (const tower of this.activeTowers) {
          const tdx = enemy.sprite.x - tower.x;
          const tdy = enemy.sprite.y - tower.y;
          if (Math.sqrt(tdx * tdx + tdy * tdy) <= revealRange) {
            nearTower = true;
            break;
          }
        }
        if (nearTower) {
          enemy.stealthed = false;
          const baseAlpha = ENEMY_DEFS[enemy.type].alpha ?? 1;
          enemy.sprite.setAlpha(baseAlpha);
          enemy.hpBarBg.setAlpha(0.8);
          enemy.hpBar.setAlpha(1);
        }
      }

      // Slow visual - blue tint
      const def2 = ENEMY_DEFS[enemy.type];
      const baseAlpha = def2.alpha ?? 1;
      if (enemy.slowFactor > 0) {
        enemy.sprite.setFillStyle(0x4488ff, enemy.stealthed ? 0 : baseAlpha * 0.9);
      } else {
        enemy.sprite.setFillStyle(def2.color, enemy.stealthed ? 0 : baseAlpha);
      }

      // Decay slow timer
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= delta;
        if (enemy.slowTimer <= 0) {
          enemy.slowFactor = 0;
          enemy.slowTimer = 0;
        }
      }

      // Pharaoh: summon enemies periodically
      const eDef = ENEMY_DEFS[enemy.type];
      if (eDef.summonType && eDef.summonInterval && eDef.summonCount) {
        enemy.summonTimer -= delta;
        if (enemy.summonTimer <= 0) {
          enemy.summonTimer = eDef.summonInterval;
          for (let s = 0; s < eDef.summonCount; s++) {
            this.spawnEnemy(eDef.summonType, {
              x: enemy.sprite.x + (Math.random() - 0.5) * 30,
              y: enemy.sprite.y + (Math.random() - 0.5) * 30,
              waypointIndex: enemy.waypointIndex,
            });
          }
          this.spawnFloatingText(enemy.sprite.x, enemy.sprite.y - 30, "Summon!", "#aa8800");
        }
      }

      // Serpent: regenerate HP
      if (eDef.regenPerSecond && eDef.regenPerSecond > 0) {
        enemy.regenAccum += delta;
        if (enemy.regenAccum >= 1000) {
          const regenTicks = Math.floor(enemy.regenAccum / 1000);
          enemy.regenAccum -= regenTicks * 1000;
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + eDef.regenPerSecond * regenTicks);
        }
      }
    }
  }

  private handleEnemyLeak(enemy: ActiveEnemy): void {
    enemy.alive = false;
    enemy.sprite.destroy();
    enemy.hpBar.destroy();
    enemy.hpBarBg.destroy();
    enemy.shieldSprite?.destroy();

    this.gameState = enemyLeaked(
      this.gameState,
      enemy.type,
      this.gameState.wave,
    );
    this.updateHud();

    if (isVillageDestroyed(this.gameState)) {
      this.gameState = { ...this.gameState, phase: "defeat" };
      this.endWave();
      this.showDefeatOverlay();
    }
  }

  private damageEnemy(enemy: ActiveEnemy, damage: number, isSingleTarget = false): void {
    // Pride Golem shield: absorbs hits
    if (enemy.shieldHitsRemaining > 0) {
      enemy.shieldHitsRemaining--;
      // Visual: flash shield
      if (enemy.shieldSprite) {
        enemy.shieldSprite.setFillStyle(0xffdd00, 0.6);
        this.time.delayedCall(100, () => {
          if (enemy.shieldSprite && enemy.shieldHitsRemaining > 0) {
            enemy.shieldSprite.setFillStyle(0xddaa44, 0.3);
          }
        });
      }
      if (enemy.shieldHitsRemaining <= 0) {
        // Shield breaks
        if (enemy.shieldSprite) {
          enemy.shieldSprite.destroy();
          enemy.shieldSprite = undefined;
        }
        this.spawnFloatingText(enemy.sprite.x, enemy.sprite.y - 20, "Shield broke!", "#ffaa00");
      }
      return; // Shield absorbed the hit
    }

    // Goliath: 50% damage reduction from single-target towers
    let actualDamage = damage;
    const def = ENEMY_DEFS[enemy.type];
    if (isSingleTarget && def.singleTargetReduction) {
      actualDamage = Math.max(1, Math.round(damage * (1 - def.singleTargetReduction)));
    }

    enemy.hp -= actualDamage;

    // White flash effect
    const baseAlpha = def.alpha ?? 1;
    enemy.sprite.setFillStyle(0xffffff, baseAlpha);
    this.time.delayedCall(100, () => {
      if (enemy.alive) {
        const tint =
          enemy.slowFactor > 0
            ? 0x4488ff
            : def.color;
        enemy.sprite.setFillStyle(tint, baseAlpha);
      }
    });

    if (enemy.hp <= 0) {
      this.handleEnemyDefeated(enemy);
    }
  }

  private handleEnemyDefeated(enemy: ActiveEnemy): void {
    enemy.alive = false;

    const def = ENEMY_DEFS[enemy.type];

    // Envy Swarm: splits into mini-swarms on death (but not if already a split)
    if (def.splitsOnDeath && !enemy.isSplit && def.splitCount && def.splitHp && def.splitSpeed) {
      for (let i = 0; i < def.splitCount; i++) {
        const offsetX = (Math.random() - 0.5) * 20;
        const offsetY = (Math.random() - 0.5) * 20;
        this.spawnEnemy(
          enemy.type,
          {
            x: enemy.sprite.x + offsetX,
            y: enemy.sprite.y + offsetY,
            waypointIndex: enemy.waypointIndex,
          },
          def.splitHp,
          def.splitSpeed,
        );
      }
      this.spawnFloatingText(enemy.sprite.x, enemy.sprite.y - 20, "Split!", "#44aa44");
    }

    // Particle effect - small burst
    for (let i = 0; i < 5; i++) {
      const px = enemy.sprite.x + (Math.random() - 0.5) * 20;
      const py = enemy.sprite.y + (Math.random() - 0.5) * 20;
      const particle = this.add.circle(px, py, 3, def.color, 0.8);
      particle.setDepth(25);
      this.tweens.add({
        targets: particle,
        x: px + (Math.random() - 0.5) * 40,
        y: py - 20 - Math.random() * 20,
        alpha: 0,
        duration: 400,
        onComplete: () => particle.destroy(),
      });
    }

    // "+5" floating text
    this.spawnFloatingText(enemy.sprite.x, enemy.sprite.y - 20, "+5", "#ffdd00");

    enemy.sprite.destroy();
    enemy.hpBar.destroy();
    enemy.hpBarBg.destroy();
    enemy.shieldSprite?.destroy();

    this.gameState = enemyDefeated(this.gameState);
    this.updateHud();
  }

  // =========================================================================
  // Tower attacks
  // =========================================================================

  private updateTowerAttacks(delta: number): void {
    for (const tower of this.activeTowers) {
      const def = TOWER_DEFS[tower.state.type];
      const level = tower.state.level;
      const range = def.range[level - 1];
      let attackSpeed = def.attackSpeed[level - 1];

      // Shield tower doesn't attack
      if (tower.state.type === "shield") continue;

      // Praise tower uses its own charge mechanic
      if (tower.state.type === "praise") {
        this.updatePraiseTower(tower, delta);
        continue;
      }

      // Pray boost: double attack rate
      if (this.prayActive) {
        attackSpeed = attackSpeed / 2;
      }
      // Esther boost: triple attack rate
      if (this.estherBoostActive) {
        attackSpeed = attackSpeed / 3;
      }

      tower.attackTimer -= delta;
      if (tower.attackTimer <= 0) {
        tower.attackTimer = attackSpeed;

        // Find enemies in range
        // Bell Tower can hit stealthed enemies, others cannot
        const canHitStealth = tower.state.type === "bell";
        const enemiesInRange = this.activeEnemies.filter((e) => {
          if (!e.alive) return false;
          if (e.stealthed && !canHitStealth) return false;
          const dx = e.sprite.x - tower.x;
          const dy = e.sprite.y - tower.y;
          return Math.sqrt(dx * dx + dy * dy) <= range;
        });

        if (enemiesInRange.length === 0) {
          tower.attackTimer = 200; // Check again soon
          continue;
        }

        // Calculate Shield Tower buff
        const shieldBuff = getShieldBuff(
          tower.x, tower.y,
          this.gameState.towers,
          PLACEMENT_SPOTS,
        );

        switch (tower.state.type) {
          case "light":
            this.lightTowerAttack(tower, enemiesInRange, Math.round(def.damage[level - 1] * (1 + shieldBuff)));
            break;
          case "bell":
            this.bellTowerAttack(tower, enemiesInRange, Math.round(def.damage[level - 1] * (1 + shieldBuff)));
            break;
          case "prayer":
            this.prayerTowerAttack(tower, enemiesInRange, Math.round(def.damage[level - 1] * (1 + shieldBuff)), level);
            break;
          case "shepherd":
            this.shepherdTowerAttack(tower, enemiesInRange);
            break;
        }
      }
    }
  }

  private selectTarget(tower: ActiveTower, enemies: ActiveEnemy[]): ActiveEnemy {
    const targeting = tower.state.targeting;
    if (targeting === "strongest") {
      let best = enemies[0];
      for (const e of enemies) {
        if (e.hp > best.hp) best = e;
      }
      return best;
    }
    if (targeting === "fastest") {
      let best = enemies[0];
      for (const e of enemies) {
        if (e.speed > best.speed) best = e;
      }
      return best;
    }
    // Default: nearest
    let best = enemies[0];
    let minDist = Infinity;
    for (const e of enemies) {
      const dx = e.sprite.x - tower.x;
      const dy = e.sprite.y - tower.y;
      const d = dx * dx + dy * dy;
      if (d < minDist) {
        minDist = d;
        best = e;
      }
    }
    return best;
  }

  private lightTowerAttack(
    tower: ActiveTower,
    enemies: ActiveEnemy[],
    damage: number,
  ): void {
    const nearest = this.selectTarget(tower, enemies);

    // Draw yellow beam
    const beam = this.add.graphics();
    beam.setDepth(30);
    beam.lineStyle(3, 0xffdd00, 0.8);
    beam.beginPath();
    beam.moveTo(tower.x, tower.y);
    beam.lineTo(nearest.sprite.x, nearest.sprite.y);
    beam.strokePath();

    this.time.delayedCall(150, () => beam.destroy());

    this.damageEnemy(nearest, damage, true); // single-target

    // Tower Synergy: Prayer + Light adjacency applies slow
    if (hasPrayerLightSynergy(tower.state.spotIndex, this.gameState.towers, PLACEMENT_SPOTS)) {
      nearest.slowFactor = 0.3;
      nearest.slowTimer = 1000; // 1-second slow
    }
  }

  private bellTowerAttack(
    tower: ActiveTower,
    enemies: ActiveEnemy[],
    damage: number,
  ): void {
    // AoE damage to all in range
    for (const e of enemies) {
      this.damageEnemy(e, damage);
    }

    // Expanding purple ring visual
    const ring = this.add.circle(tower.x, tower.y, 10, 0xaa44ff, 0);
    ring.setStrokeStyle(2, 0xaa44ff, 0.6);
    ring.setDepth(30);

    const range = TOWER_DEFS.bell.range[tower.state.level - 1];
    this.tweens.add({
      targets: ring,
      radius: range,
      alpha: 0,
      duration: 200,
      onUpdate: () => {
        ring.setStrokeStyle(2, 0xaa44ff, ring.alpha * 0.6);
      },
      onComplete: () => ring.destroy(),
    });
  }

  private prayerTowerAttack(
    tower: ActiveTower,
    enemies: ActiveEnemy[],
    damage: number,
    level: number,
  ): void {
    // Slow all enemies in range + tiny damage
    const slowAmount = PRAYER_SLOW_FACTOR[level];
    for (const e of enemies) {
      e.slowFactor = slowAmount;
      e.slowTimer = 2000; // Slow lasts 2 seconds
      this.damageEnemy(e, damage);
    }
  }

  private updatePraiseTower(tower: ActiveTower, delta: number): void {
    const level = tower.state.level;
    const chargeTime = TOWER_DEFS.praise.attackSpeed[level - 1];

    if (tower.praiseChargeTimer === undefined) {
      tower.praiseChargeTimer = 0;
    }

    tower.praiseChargeTimer += delta;

    // Visual: growing golden glow based on charge progress
    const chargePct = Math.min(tower.praiseChargeTimer / chargeTime, 1);
    if (!tower.praiseGlow) {
      tower.praiseGlow = this.add.circle(tower.x, tower.y, 5, 0xffaa00, 0);
      tower.praiseGlow.setDepth(9);
    }
    tower.praiseGlow.setRadius(5 + chargePct * 25);
    tower.praiseGlow.setAlpha(chargePct * 0.4);

    if (tower.praiseChargeTimer >= chargeTime) {
      tower.praiseChargeTimer = 0;

      // Calculate Shield Tower buff
      const shieldBuff = getShieldBuff(
        tower.x, tower.y,
        this.gameState.towers,
        PLACEMENT_SPOTS,
      );

      // Fire AoE burst hitting ALL alive enemies
      const damage = Math.round(TOWER_DEFS.praise.damage[level - 1] * (1 + shieldBuff));
      const aliveEnemies = this.activeEnemies.filter((e) => e.alive);
      for (const e of aliveEnemies) {
        this.damageEnemy(e, damage);
      }

      // Burst visual: expanding gold ring from tower
      const ring = this.add.circle(tower.x, tower.y, 10, 0xffaa00, 0);
      ring.setStrokeStyle(3, 0xffaa00, 0.8);
      ring.setDepth(30);
      this.tweens.add({
        targets: ring,
        radius: 300,
        alpha: 0,
        duration: 500,
        onUpdate: () => {
          ring.setStrokeStyle(3, 0xffaa00, ring.alpha * 0.8);
        },
        onComplete: () => ring.destroy(),
      });

      // Flash the praise glow
      if (tower.praiseGlow) {
        tower.praiseGlow.setAlpha(0.8);
        tower.praiseGlow.setRadius(30);
      }

      this.spawnFloatingText(tower.x, tower.y - 30, "PRAISE!", "#ffaa00");
    }
  }

  private shepherdTowerAttack(
    tower: ActiveTower,
    enemies: ActiveEnemy[],
  ): void {
    const level = tower.state.level;
    const pushback = SHEPHERD_PUSHBACK[level];

    const nearest = this.selectTarget(tower, enemies);
    if (!nearest) return;

    // Push enemy backward along the path
    // Find which segment the enemy is on and push it backward
    const wpIdx = nearest.waypointIndex;
    if (wpIdx <= 0) return; // Already at start

    // Calculate direction from previous waypoint to current (the direction enemy is traveling)
    const prev = PATH_WAYPOINTS[wpIdx - 1];
    const curr = PATH_WAYPOINTS[wpIdx];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (segLen === 0) return;

    // Push backward (opposite to travel direction)
    const pushX = -(dx / segLen) * pushback;
    const pushY = -(dy / segLen) * pushback;

    nearest.sprite.x += pushX;
    nearest.sprite.y += pushY;

    // Visual: white wave effect
    const wave = this.add.circle(tower.x, tower.y, 10, 0xffffff, 0);
    wave.setStrokeStyle(2, 0xffffff, 0.6);
    wave.setDepth(30);
    this.tweens.add({
      targets: wave,
      radius: TOWER_DEFS.shepherd.range[level - 1],
      alpha: 0,
      duration: 300,
      onUpdate: () => {
        wave.setStrokeStyle(2, 0xffffff, wave.alpha * 0.6);
      },
      onComplete: () => wave.destroy(),
    });
  }

  // =========================================================================
  // Wave completion check
  // =========================================================================

  private checkWaveComplete(): void {
    if (this.gameState.phase !== "wave") return;

    // All enemies spawned and all dead or leaked
    if (
      this.enemiesToSpawn.length === 0 &&
      this.activeEnemies.every((e) => !e.alive)
    ) {
      this.endWave();

      if (isVillageDestroyed(this.gameState)) return;

      this.gameState = completeWave(this.gameState);
      this.updateHud();

      // +25 passive floating text
      this.spawnFloatingText(100, 50, "+25", "#88ff88");

      if (this.gameState.phase === "victory") {
        this.showVictoryOverlay();
      } else {
        // Next question
        this.time.delayedCall(800, () => {
          this.transitionToQuestion();
        });
      }
    }
  }

  private endWave(): void {
    this.prayButton?.destroy();
    this.prayButton = null;
    this.prayActive = false;
    this.prayOnCooldown = false;
    this.fastForwardButton?.destroy();
    this.fastForwardButton = null;
    // Preserve this.fastForward state across waves (don't reset)
    this.heroAbilityButton?.destroy();
    this.heroAbilityButton = null;
    this.estherBoostActive = false;

    // Clean up remaining enemy sprites
    for (const e of this.activeEnemies) {
      if (e.alive) {
        e.sprite.destroy();
        e.hpBar.destroy();
        e.hpBarBg.destroy();
        e.shieldSprite?.destroy();
      }
    }
    this.activeEnemies = [];
  }

  // =========================================================================
  // Victory / Defeat overlays
  // =========================================================================

  private showVictoryOverlay(): void {
    this.overlayContainer?.destroy();
    this.setGameElementsVisible(false);
    const container = this.add.container(0, 0);
    container.setDepth(100);

    const bg = this.add.rectangle(
      GAME_W / 2,
      GAME_H / 2,
      GAME_W,
      GAME_H,
      0x000000,
      0.95,
    );
    container.add(bg);

    const title = this.add.text(GAME_W / 2, 120, "Victory!", {
      fontSize: "40px",
      color: "#ffdd00",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    title.setOrigin(0.5);
    container.add(title);

    const subtitle = this.add.text(
      GAME_W / 2,
      170,
      "The village is safe!",
      {
        fontSize: "18px",
        color: "#88ff88",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      },
    );
    subtitle.setOrigin(0.5);
    container.add(subtitle);

    // Stars
    const stars = calculateStars(this.gameState);
    const starStr = Array.from({ length: 3 }, (_, i) =>
      i < stars ? "*" : ".",
    ).join(" ");
    const starsText = this.add.text(GAME_W / 2, 220, starStr, {
      fontSize: "48px",
      color: "#ffdd00",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    });
    starsText.setOrigin(0.5);
    container.add(starsText);

    const wavesCleared = `Waves Cleared: ${this.gameState.wave}/${this.gameState.totalWaves}`;
    const statsText = this.add.text(
      GAME_W / 2,
      280,
      `${wavesCleared}\nVillage HP: ${this.gameState.villageHp}/${this.gameState.maxVillageHp}\nQuestions: ${this.gameState.questionsCorrect}/${this.gameState.questionsTotal} correct\nTowers Built: ${this.gameState.towers.length}`,
      {
        fontSize: "14px",
        color: "#cccccc",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        align: "center",
      },
    );
    statsText.setOrigin(0.5);
    container.add(statsText);

    // Verse reminder — positioned dynamically below stats
    const verseY = statsText.y + statsText.height / 2 + 20;
    const verseText = this.add.text(
      GAME_W / 2,
      verseY,
      `"${this.lesson.meta.verseText}"\n- ${this.lesson.meta.verseReference}`,
      {
        fontSize: "13px",
        color: "#aaddff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "italic",
        wordWrap: { width: 550 },
        align: "center",
      },
    );
    verseText.setOrigin(0.5);
    container.add(verseText);

    // Play again button — positioned below verse
    const btnY = Math.min(520, verseText.y + verseText.height / 2 + 30);
    const btnBg = this.add.rectangle(GAME_W / 2 - 100, btnY, 150, 45, 0x44aa44, 1);
    btnBg.setInteractive({ useHandCursor: true });
    const btnText = this.add.text(GAME_W / 2 - 100, btnY, "Play Again", {
      fontSize: "16px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5);
    container.add(btnBg);
    container.add(btnText);

    btnBg.on("pointerdown", () => {
      this.scene.restart();
    });

    // Back button
    const backBg = this.add.rectangle(GAME_W / 2 + 100, btnY, 150, 45, 0x4466aa, 1);
    backBg.setInteractive({ useHandCursor: true });
    const backText = this.add.text(GAME_W / 2 + 100, btnY, "Back", {
      fontSize: "16px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    backText.setOrigin(0.5);
    container.add(backBg);
    container.add(backText);

    backBg.on("pointerdown", () => {
      window.location.hash = "#/";
    });

    this.overlayContainer = container;
  }

  private showDefeatOverlay(): void {
    this.overlayContainer?.destroy();
    this.setGameElementsVisible(false);
    const container = this.add.container(0, 0);
    container.setDepth(100);

    const bg = this.add.rectangle(
      GAME_W / 2,
      GAME_H / 2,
      GAME_W,
      GAME_H,
      0x000000,
      0.95,
    );
    container.add(bg);

    const title = this.add.text(GAME_W / 2, 150, "Oh no!", {
      fontSize: "36px",
      color: "#ff4444",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    title.setOrigin(0.5);
    container.add(title);

    const subtitle = this.add.text(
      GAME_W / 2,
      210,
      "The village needs you!\nTry again?",
      {
        fontSize: "18px",
        color: "#ffaaaa",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        align: "center",
      },
    );
    subtitle.setOrigin(0.5);
    container.add(subtitle);

    const encourageText = this.add.text(
      GAME_W / 2,
      280,
      `"${this.lesson.meta.verseText}"\n- ${this.lesson.meta.verseReference}`,
      {
        fontSize: "13px",
        color: "#aaddff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "italic",
        wordWrap: { width: 550 },
        align: "center",
      },
    );
    encourageText.setOrigin(0.5);
    container.add(encourageText);

    // Try again button
    const btnBg = this.add.rectangle(GAME_W / 2 - 100, 380, 150, 45, 0x44aa44, 1);
    btnBg.setInteractive({ useHandCursor: true });
    const btnText = this.add.text(GAME_W / 2 - 100, 380, "Try Again!", {
      fontSize: "16px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5);
    container.add(btnBg);
    container.add(btnText);

    btnBg.on("pointerdown", () => {
      this.scene.restart();
    });

    // Back button
    const backBg = this.add.rectangle(GAME_W / 2 + 100, 380, 150, 45, 0x4466aa, 1);
    backBg.setInteractive({ useHandCursor: true });
    const backText = this.add.text(GAME_W / 2 + 100, 380, "Back", {
      fontSize: "16px",
      color: "#ffffff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    backText.setOrigin(0.5);
    container.add(backBg);
    container.add(backText);

    backBg.on("pointerdown", () => {
      window.location.hash = "#/";
    });

    this.overlayContainer = container;
  }

  // =========================================================================
  // Floating text
  // =========================================================================

  private spawnFloatingText(
    x: number,
    y: number,
    message: string,
    color: string,
  ): void {
    const text = this.add.text(x, y, message, {
      fontSize: "16px",
      color,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    text.setOrigin(0.5);
    text.setDepth(60);

    this.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 1200,
      onComplete: () => text.destroy(),
    });
  }

  // =========================================================================
  // Prayer aura visual (drawn each frame)
  // =========================================================================

  private showBossAnnouncement(bossName: string): void {
    const text = this.add.text(GAME_W / 2, GAME_H / 2 - 40, `BOSS: ${bossName}!`, {
      fontSize: "32px",
      color: "#ff4444",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 4,
    });
    text.setOrigin(0.5);
    text.setDepth(95);

    this.tweens.add({
      targets: text,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 500,
      yoyo: true,
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          y: text.y - 50,
          duration: 800,
          onComplete: () => text.destroy(),
        });
      },
    });
  }

  private drawPrayerAuras(): void {
    // Draw subtle blue circles for Prayer towers
    for (const tower of this.activeTowers) {
      if (tower.state.type === "prayer") {
        const range = TOWER_DEFS.prayer.range[tower.state.level - 1];
        const pulse = 0.04 + 0.02 * Math.sin(this.time.now / 600);
        this.effectsGraphics.lineStyle(1, 0x4488ff, pulse * 3);
        this.effectsGraphics.strokeCircle(tower.x, tower.y, range);
        this.effectsGraphics.fillStyle(0x4488ff, pulse);
        this.effectsGraphics.fillCircle(tower.x, tower.y, range);
      }

      // Shield Tower: green glow aura
      if (tower.state.type === "shield") {
        const range = TOWER_DEFS.shield.range[tower.state.level - 1];
        const pulse = 0.06 + 0.03 * Math.sin(this.time.now / 500);
        this.effectsGraphics.lineStyle(1, 0x44cc44, pulse * 3);
        this.effectsGraphics.strokeCircle(tower.x, tower.y, range);
        this.effectsGraphics.fillStyle(0x44cc44, pulse);
        this.effectsGraphics.fillCircle(tower.x, tower.y, range);

        // Draw green glow on buffed towers within range
        for (const other of this.activeTowers) {
          if (other === tower || other.state.type === "shield") continue;
          const dx = other.x - tower.x;
          const dy = other.y - tower.y;
          if (Math.sqrt(dx * dx + dy * dy) <= range) {
            this.effectsGraphics.lineStyle(2, 0x44cc44, 0.3 + 0.1 * Math.sin(this.time.now / 400));
            this.effectsGraphics.strokeCircle(other.x, other.y, 18);
          }
        }
      }

      // Prayer-Light synergy: blue tint on Light towers adjacent to Prayer towers
      if (tower.state.type === "light") {
        if (hasPrayerLightSynergy(tower.state.spotIndex, this.gameState.towers, PLACEMENT_SPOTS)) {
          this.effectsGraphics.lineStyle(2, 0x4488ff, 0.25 + 0.1 * Math.sin(this.time.now / 500));
          this.effectsGraphics.strokeCircle(tower.x, tower.y, 20);
          this.effectsGraphics.fillStyle(0x4488ff, 0.05);
          this.effectsGraphics.fillCircle(tower.x, tower.y, 20);
        }
      }
    }
  }

  // =========================================================================
  // Tutorial auto-place logic
  // =========================================================================

  private updateTutorial(delta: number): void {
    if (this.gameState.phase !== "placement") return;
    if (this.tutorialPlaced) return;
    if (this.gameState.wave > 0) return; // Only for wave 1 (before first wave start)

    this.autoPlaceTimer += delta;
    if (this.autoPlaceTimer >= AUTO_PLACE_DELAY) {
      // Auto-place Light tower on first empty spot
      for (let i = 0; i < PLACEMENT_SPOTS.length; i++) {
        const occupied = this.activeTowers.some((t) => t.state.spotIndex === i);
        if (!occupied) {
          this.handlePlaceTower("light", i);
          this.spawnFloatingText(
            PLACEMENT_SPOTS[i].x,
            PLACEMENT_SPOTS[i].y - 30,
            "Auto-placed!",
            "#88ff88",
          );
          break;
        }
      }
      this.tutorialPlaced = true;
    }
  }

  // =========================================================================
  // UPDATE (main game loop)
  // =========================================================================

  update(_time: number, delta: number): void {
    // Entrance arrow pulse
    if (this.entranceArrow?.active) {
      this.entranceArrow.setAlpha(0.5 + 0.5 * Math.sin(_time / 400));
    }

    // HUD refresh
    this.updateHud();

    // Effects clear & redraw
    this.effectsGraphics.clear();
    this.drawPrayerAuras();

    // Phase-specific updates
    switch (this.gameState.phase) {
      case "placement":
        this.updateTutorial(delta);
        this.updateTowerStrip();
        break;

      case "wave": {
        // Apply fast forward multiplier
        const effectiveDelta = this.fastForward ? delta * 2 : delta;

        // Spawn enemies
        if (this.enemiesToSpawn.length > 0) {
          this.spawnTimer += effectiveDelta;
          if (this.spawnTimer >= ENEMY_SPAWN_INTERVAL) {
            this.spawnTimer -= ENEMY_SPAWN_INTERVAL;
            const nextType = this.enemiesToSpawn.shift()!;
            this.spawnEnemy(nextType);
          }
        }

        // Move enemies
        this.moveEnemies(effectiveDelta);

        // Tower attacks
        this.updateTowerAttacks(effectiveDelta);

        // Hero ability cooldown
        if (this.heroAbilityCooldown > 0) {
          this.heroAbilityCooldown -= effectiveDelta;
          if (this.heroAbilityCooldown < 0) this.heroAbilityCooldown = 0;
        }
        // Update hero ability button display
        if (this.heroAbilityButton && this.gameState.hero) {
          const btnRef = this.heroAbilityButton as unknown as { cdText?: Phaser.GameObjects.Text; btnBg?: Phaser.GameObjects.Rectangle };
          if (btnRef.cdText) {
            if (this.heroAbilityCooldown > 0) {
              btnRef.cdText.setText(`${Math.ceil(this.heroAbilityCooldown / 1000)}s`);
              btnRef.cdText.setColor("#ff6666");
            } else {
              btnRef.cdText.setText("Ready!");
              btnRef.cdText.setColor("#88ff88");
            }
          }
          if (btnRef.btnBg) {
            btnRef.btnBg.setAlpha(this.heroAbilityCooldown > 0 ? 0.4 : 0.8);
          }
        }

        // Check wave completion
        this.checkWaveComplete();
        break;
      }

      case "victory":
      case "defeat":
        // No updates needed
        break;
    }

    // Spot circle pulsing during placement
    if (this.gameState.phase === "placement") {
      for (const circle of this.spotCircles) {
        if (circle.visible) {
          const pulse = 0.15 + 0.1 * Math.sin(_time / 500);
          circle.setFillStyle(0x88ff88, pulse);
        }
      }
    }
  }
}
