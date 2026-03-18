import Phaser from "phaser";
import type { LessonConfig, Question } from "@/types/lesson";
import { QuestionPool } from "@/lib/question-pool";
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
  type TowerType,
  type EnemyType,
  type WaveConfig,
  type TowerState,
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

/** Placement spot positions (offset from path). */
const PLACEMENT_SPOTS = [
  { x: 150, y: 250 },
  { x: 250, y: 200 },
  { x: 350, y: 100 },
  { x: 450, y: 100 },
  { x: 550, y: 200 },
  { x: 550, y: 350 },
  { x: 650, y: 350 },
  { x: 700, y: 500 },
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
  type: EnemyType;
  hp: number;
  maxHp: number;
  speed: number;
  waypointIndex: number; // current target waypoint
  slowFactor: number; // 0 = no slow, 0.4 = 40% slow, etc.
  slowTimer: number; // ms remaining on slow
  alive: boolean;
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
      fontFamily: "monospace",
    });
    this.coinText.setDepth(81);

    this.hpText = this.add.text(200, 8, "", {
      fontSize: "18px",
      color: "#ff6666",
      fontFamily: "monospace",
    });
    this.hpText.setDepth(81);

    this.waveText = this.add.text(450, 8, "", {
      fontSize: "18px",
      color: "#ffffff",
      fontFamily: "monospace",
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

    const towerTypes: TowerType[] = ["prayer", "light", "bell"];
    const startX = 120;
    const spacing = 200;

    this.towerStripCircles = [];
    this.towerStripLabels = [];
    this.towerStripCosts = [];
    this.towerStripLocks = [];

    for (let i = 0; i < towerTypes.length; i++) {
      const def = TOWER_DEFS[towerTypes[i]];
      const cx = startX + i * spacing;
      const cy = TOWER_STRIP_Y + TOWER_STRIP_HEIGHT / 2;

      const circle = this.add.circle(cx, cy, 18, def.color, 0.8);
      circle.setDepth(81);
      this.towerStripCircles.push(circle);

      const label = this.add.text(cx + 25, cy - 14, def.label, {
        fontSize: "13px",
        color: "#ffffff",
        fontFamily: "monospace",
      });
      label.setDepth(81);
      this.towerStripLabels.push(label);

      const cost = this.add.text(cx + 25, cy + 2, `${def.cost}`, {
        fontSize: "12px",
        color: "#ffdd00",
        fontFamily: "monospace",
      });
      cost.setDepth(81);
      this.towerStripCosts.push(cost);

      const lock = this.add.text(cx, cy - 6, "X", {
        fontSize: "14px",
        color: "#ff0000",
        fontFamily: "monospace",
        fontStyle: "bold",
      });
      lock.setOrigin(0.5);
      lock.setDepth(82);
      lock.setVisible(false);
      this.towerStripLocks.push(lock);
    }
  }

  private updateTowerStrip(): void {
    const towerTypes: TowerType[] = ["prayer", "light", "bell"];
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
        fontFamily: "monospace",
        fontStyle: "bold",
      },
    );
    this.entranceArrow.setDepth(10);
  }

  // =========================================================================
  // OVERLAYS: Intro
  // =========================================================================

  private showIntroOverlay(): void {
    this.overlayContainer?.destroy();
    const container = this.add.container(0, 0);
    container.setDepth(100);

    // Dim background
    const bg = this.add.rectangle(
      GAME_W / 2,
      GAME_H / 2,
      GAME_W,
      GAME_H,
      0x000000,
      0.75,
    );
    container.add(bg);

    const titleText = this.add.text(GAME_W / 2, 120, "Faith Fortress", {
      fontSize: "36px",
      color: "#ffdd00",
      fontFamily: "monospace",
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
        fontFamily: "monospace",
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
        fontFamily: "monospace",
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
        fontFamily: "monospace",
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
        fontFamily: "monospace",
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
      fontFamily: "monospace",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5);
    container.add(btnBg);
    container.add(btnText);

    btnBg.on("pointerdown", () => {
      container.destroy();
      this.overlayContainer = null;
      this.transitionToQuestion();
    });

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
    const container = this.add.container(0, 0);
    container.setDepth(100);

    // Dim background
    const bg = this.add.rectangle(
      GAME_W / 2,
      GAME_H / 2,
      GAME_W,
      GAME_H,
      0x000000,
      0.8,
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
          fontFamily: "monospace",
          fontStyle: "bold",
        },
      );
      sceneTitle.setOrigin(0.5);
      container.add(sceneTitle);
      yOffset += 30;

      const sceneDesc = this.add.text(
        GAME_W / 2,
        yOffset,
        storyScene.description,
        {
          fontSize: "13px",
          color: "#aaaacc",
          fontFamily: "monospace",
          wordWrap: { width: 600 },
          align: "center",
        },
      );
      sceneDesc.setOrigin(0.5);
      container.add(sceneDesc);
      yOffset += sceneDesc.height + 20;
    }

    // Question text
    const qText = this.add.text(GAME_W / 2, yOffset + 30, question.text, {
      fontSize: "18px",
      color: "#ffffff",
      fontFamily: "monospace",
      wordWrap: { width: 650 },
      align: "center",
    });
    qText.setOrigin(0.5);
    container.add(qText);

    // Answer buttons (2x2 grid)
    const btnW = 320;
    const btnH = 50;
    const startY = yOffset + 100;
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
          fontFamily: "monospace",
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
      0.8,
    );
    container.add(bg);

    const emoji = correct ? "+" : "x";
    const resultColor = correct ? "#44ff44" : "#ff4444";
    const resultText = correct ? "Correct! +100 coins" : "Not quite! +50 coins";

    const resultLabel = this.add.text(GAME_W / 2, 200, emoji, {
      fontSize: "48px",
      color: resultColor,
      fontFamily: "monospace",
      fontStyle: "bold",
    });
    resultLabel.setOrigin(0.5);
    container.add(resultLabel);

    const msgText = this.add.text(GAME_W / 2, 270, resultText, {
      fontSize: "22px",
      color: resultColor,
      fontFamily: "monospace",
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
        fontFamily: "monospace",
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
      fontFamily: "monospace",
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
          fontFamily: "monospace",
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
        fontFamily: "monospace",
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

    const towerTypes: TowerType[] = ["prayer", "light", "bell"];
    // On tutorial wave (wave 0 for little-kids), only allow Light
    const available =
      this.gameState.wave <= 0 && this.gameState.difficulty === "little-kids"
        ? (["light"] as TowerType[])
        : towerTypes;

    const count = available.length;
    const spacing = 50;
    const startX = spot.x - ((count - 1) * spacing) / 2;

    // Background panel
    const panelW = count * spacing + 30;
    const panelBg = this.add.rectangle(spot.x, spot.y - 55, panelW, 60, 0x222233, 0.9);
    panelBg.setStrokeStyle(2, 0x4488ff, 0.6);
    container.add(panelBg);

    for (let i = 0; i < available.length; i++) {
      const tType = available[i];
      const def = TOWER_DEFS[tType];
      const cx = startX + i * spacing;
      const cy = spot.y - 55;

      const affordable = canAfford(this.gameState, tType);
      const alpha = affordable ? 1 : 0.3;

      const circle = this.add.circle(cx, cy - 8, 16, def.color, alpha);
      circle.setInteractive({ useHandCursor: affordable });
      container.add(circle);

      const costText = this.add.text(cx, cy + 14, `${def.cost}`, {
        fontSize: "11px",
        color: affordable ? "#ffdd00" : "#666666",
        fontFamily: "monospace",
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
    const closeBtn = this.add.text(spot.x + panelW / 2 - 5, spot.y - 80, "X", {
      fontSize: "14px",
      color: "#ff4444",
      fontFamily: "monospace",
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

    if (tower.state.level >= 2) return;

    const container = this.add.container(0, 0);
    container.setDepth(90);

    const affordable = canUpgrade(this.gameState, tower.state.id);
    const def = TOWER_DEFS[tower.state.type];

    const panelBg = this.add.rectangle(tower.x, tower.y - 50, 120, 45, 0x222233, 0.9);
    panelBg.setStrokeStyle(2, 0xaa44ff, 0.6);
    container.add(panelBg);

    const label = this.add.text(
      tower.x,
      tower.y - 58,
      "Upgrade",
      {
        fontSize: "13px",
        color: affordable ? "#ffffff" : "#666666",
        fontFamily: "monospace",
        fontStyle: "bold",
      },
    );
    label.setOrigin(0.5);
    container.add(label);

    const costLabel = this.add.text(
      tower.x,
      tower.y - 42,
      `${def.upgradeCost} coins`,
      {
        fontSize: "11px",
        color: affordable ? "#ffdd00" : "#666666",
        fontFamily: "monospace",
      },
    );
    costLabel.setOrigin(0.5);
    container.add(costLabel);

    if (affordable) {
      panelBg.setInteractive({ useHandCursor: true });
      panelBg.on("pointerdown", () => {
        this.gameState = upgradeTower(this.gameState, tower.state.id);
        // Update tower state reference
        const updatedState = this.gameState.towers.find(
          (t) => t.id === tower.state.id,
        );
        if (updatedState) {
          tower.state = updatedState;
          // Update range circle
          const range = def.range[updatedState.level - 1];
          tower.rangeCircle.setRadius(range);
          // Update label
          tower.labelText.setText(`${def.label} L${updatedState.level}`);
        }
        this.updateHud();
        this.updateTowerStrip();
        this.upgradeButton?.destroy();
        this.upgradeButton = null;
      });
    }

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
        fontFamily: "monospace",
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
      fontFamily: "monospace",
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

  private spawnEnemy(type: EnemyType): void {
    const def = ENEMY_DEFS[type];
    const start = PATH_WAYPOINTS[0];

    const sprite = this.add.circle(start.x, start.y, def.size, def.color, 1);
    sprite.setDepth(20);

    // HP bar background
    const hpBarBg = this.add.rectangle(
      start.x,
      start.y - def.size - 6,
      def.size * 2,
      4,
      0x333333,
      0.8,
    );
    hpBarBg.setDepth(21);

    // HP bar foreground
    const hpBar = this.add.rectangle(
      start.x,
      start.y - def.size - 6,
      def.size * 2,
      4,
      0x44ff44,
      1,
    );
    hpBar.setDepth(22);

    const enemy: ActiveEnemy = {
      sprite,
      hpBar,
      hpBarBg,
      type,
      hp: def.hp,
      maxHp: def.hp,
      speed: def.speed,
      waypointIndex: 1,
      slowFactor: 0,
      slowTimer: 0,
      alive: true,
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

      // Slow visual - blue tint
      if (enemy.slowFactor > 0) {
        enemy.sprite.setFillStyle(0x4488ff, 0.9);
      } else {
        enemy.sprite.setFillStyle(ENEMY_DEFS[enemy.type].color, 1);
      }

      // Decay slow timer
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= delta;
        if (enemy.slowTimer <= 0) {
          enemy.slowFactor = 0;
          enemy.slowTimer = 0;
        }
      }
    }
  }

  private handleEnemyLeak(enemy: ActiveEnemy): void {
    enemy.alive = false;
    enemy.sprite.destroy();
    enemy.hpBar.destroy();
    enemy.hpBarBg.destroy();

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

  private damageEnemy(enemy: ActiveEnemy, damage: number): void {
    enemy.hp -= damage;

    // White flash effect
    enemy.sprite.setFillStyle(0xffffff, 1);
    this.time.delayedCall(100, () => {
      if (enemy.alive) {
        const tint =
          enemy.slowFactor > 0
            ? 0x4488ff
            : ENEMY_DEFS[enemy.type].color;
        enemy.sprite.setFillStyle(tint, 1);
      }
    });

    if (enemy.hp <= 0) {
      this.handleEnemyDefeated(enemy);
    }
  }

  private handleEnemyDefeated(enemy: ActiveEnemy): void {
    enemy.alive = false;

    // Particle effect - small burst
    for (let i = 0; i < 5; i++) {
      const px = enemy.sprite.x + (Math.random() - 0.5) * 20;
      const py = enemy.sprite.y + (Math.random() - 0.5) * 20;
      const particle = this.add.circle(px, py, 3, ENEMY_DEFS[enemy.type].color, 0.8);
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

      // Pray boost: double attack rate
      if (this.prayActive) {
        attackSpeed = attackSpeed / 2;
      }

      tower.attackTimer -= delta;
      if (tower.attackTimer <= 0) {
        tower.attackTimer = attackSpeed;

        // Find enemies in range
        const enemiesInRange = this.activeEnemies.filter((e) => {
          if (!e.alive) return false;
          const dx = e.sprite.x - tower.x;
          const dy = e.sprite.y - tower.y;
          return Math.sqrt(dx * dx + dy * dy) <= range;
        });

        if (enemiesInRange.length === 0) {
          tower.attackTimer = 200; // Check again soon
          continue;
        }

        switch (tower.state.type) {
          case "light":
            this.lightTowerAttack(tower, enemiesInRange, def.damage[level - 1]);
            break;
          case "bell":
            this.bellTowerAttack(tower, enemiesInRange, def.damage[level - 1]);
            break;
          case "prayer":
            this.prayerTowerAttack(tower, enemiesInRange, def.damage[level - 1], level);
            break;
        }
      }
    }
  }

  private lightTowerAttack(
    tower: ActiveTower,
    enemies: ActiveEnemy[],
    damage: number,
  ): void {
    // Target nearest enemy
    let nearest = enemies[0];
    let minDist = Infinity;
    for (const e of enemies) {
      const dx = e.sprite.x - tower.x;
      const dy = e.sprite.y - tower.y;
      const d = dx * dx + dy * dy;
      if (d < minDist) {
        minDist = d;
        nearest = e;
      }
    }

    // Draw yellow beam
    const beam = this.add.graphics();
    beam.setDepth(30);
    beam.lineStyle(3, 0xffdd00, 0.8);
    beam.beginPath();
    beam.moveTo(tower.x, tower.y);
    beam.lineTo(nearest.sprite.x, nearest.sprite.y);
    beam.strokePath();

    this.time.delayedCall(150, () => beam.destroy());

    this.damageEnemy(nearest, damage);
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

    // Clean up remaining enemy sprites
    for (const e of this.activeEnemies) {
      if (e.alive) {
        e.sprite.destroy();
        e.hpBar.destroy();
        e.hpBarBg.destroy();
      }
    }
    this.activeEnemies = [];
  }

  // =========================================================================
  // Victory / Defeat overlays
  // =========================================================================

  private showVictoryOverlay(): void {
    this.overlayContainer?.destroy();
    const container = this.add.container(0, 0);
    container.setDepth(100);

    const bg = this.add.rectangle(
      GAME_W / 2,
      GAME_H / 2,
      GAME_W,
      GAME_H,
      0x000000,
      0.8,
    );
    container.add(bg);

    const title = this.add.text(GAME_W / 2, 120, "Victory!", {
      fontSize: "40px",
      color: "#ffdd00",
      fontFamily: "monospace",
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
        fontFamily: "monospace",
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
      fontFamily: "monospace",
    });
    starsText.setOrigin(0.5);
    container.add(starsText);

    const statsText = this.add.text(
      GAME_W / 2,
      290,
      `Village HP: ${this.gameState.villageHp}/${this.gameState.maxVillageHp}\nQuestions: ${this.gameState.questionsCorrect}/${this.gameState.questionsTotal} correct\nTowers Built: ${this.gameState.towers.length}`,
      {
        fontSize: "14px",
        color: "#cccccc",
        fontFamily: "monospace",
        align: "center",
      },
    );
    statsText.setOrigin(0.5);
    container.add(statsText);

    // Verse reminder
    const verseText = this.add.text(
      GAME_W / 2,
      370,
      `"${this.lesson.meta.verseText}"\n- ${this.lesson.meta.verseReference}`,
      {
        fontSize: "13px",
        color: "#aaddff",
        fontFamily: "monospace",
        fontStyle: "italic",
        wordWrap: { width: 550 },
        align: "center",
      },
    );
    verseText.setOrigin(0.5);
    container.add(verseText);

    // Play again button
    const btnBg = this.add.rectangle(GAME_W / 2 - 100, 460, 150, 45, 0x44aa44, 1);
    btnBg.setInteractive({ useHandCursor: true });
    const btnText = this.add.text(GAME_W / 2 - 100, 460, "Play Again", {
      fontSize: "16px",
      color: "#ffffff",
      fontFamily: "monospace",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5);
    container.add(btnBg);
    container.add(btnText);

    btnBg.on("pointerdown", () => {
      this.scene.restart();
    });

    // Back button
    const backBg = this.add.rectangle(GAME_W / 2 + 100, 460, 150, 45, 0x4466aa, 1);
    backBg.setInteractive({ useHandCursor: true });
    const backText = this.add.text(GAME_W / 2 + 100, 460, "Back", {
      fontSize: "16px",
      color: "#ffffff",
      fontFamily: "monospace",
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
    const container = this.add.container(0, 0);
    container.setDepth(100);

    const bg = this.add.rectangle(
      GAME_W / 2,
      GAME_H / 2,
      GAME_W,
      GAME_H,
      0x000000,
      0.8,
    );
    container.add(bg);

    const title = this.add.text(GAME_W / 2, 150, "Oh no!", {
      fontSize: "36px",
      color: "#ff4444",
      fontFamily: "monospace",
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
        fontFamily: "monospace",
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
        fontFamily: "monospace",
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
      fontFamily: "monospace",
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
      fontFamily: "monospace",
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
      fontFamily: "monospace",
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

  private drawPrayerAuras(): void {
    // Draw subtle blue circles for Prayer towers
    for (const tower of this.activeTowers) {
      if (tower.state.type !== "prayer") continue;
      const range = TOWER_DEFS.prayer.range[tower.state.level - 1];
      const pulse = 0.04 + 0.02 * Math.sin(this.time.now / 600);
      this.effectsGraphics.lineStyle(1, 0x4488ff, pulse * 3);
      this.effectsGraphics.strokeCircle(tower.x, tower.y, range);
      this.effectsGraphics.fillStyle(0x4488ff, pulse);
      this.effectsGraphics.fillCircle(tower.x, tower.y, range);
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

      case "wave":
        // Spawn enemies
        if (this.enemiesToSpawn.length > 0) {
          this.spawnTimer += delta;
          if (this.spawnTimer >= ENEMY_SPAWN_INTERVAL) {
            this.spawnTimer -= ENEMY_SPAWN_INTERVAL;
            const nextType = this.enemiesToSpawn.shift()!;
            this.spawnEnemy(nextType);
          }
        }

        // Move enemies
        this.moveEnemies(delta);

        // Tower attacks
        this.updateTowerAttacks(delta);

        // Check wave completion
        this.checkWaveComplete();
        break;

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
