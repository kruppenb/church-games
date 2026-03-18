import Phaser from "phaser";
import type { LessonConfig, Question } from "@/types/lesson";
import { filterByDifficulty } from "@/lib/difficulty";
import { QuestionPool } from "@/lib/question-pool";
import {
  createInitialState,
  answerQuestion,
  addWeapon,
  getWeaponLevel,
  defeatEnemy,
  takeDamage,
  healPlayer,
  boostMaxHp,
  calculateStars,
  isGameOver,
  WEAPON_OPTIONS,
  MAX_WEAPON_LEVEL,
  type SurvivorsState,
  type WeaponUpgrade,
  type WeaponType,
} from "../logic/survivors-logic";

/** How often the player auto-fires base projectile (ms). */
const AUTO_ATTACK_INTERVAL = 500;
/** Time between questions (ms). */
const QUESTION_INTERVAL = 18000;
/** Enemy base speed (px/s). */
const ENEMY_BASE_SPEED = 50;
/** Projectile speed (px/s). */
const PROJECTILE_SPEED = 350;
/** Base enemy spawn interval (ms) — gets faster each wave. */
const BASE_SPAWN_INTERVAL = 2200;

const ANSWER_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00];
const ANSWER_LABELS = ["A", "B", "C", "D"];

/** Fire ring intervals/radius by level */
const FIRE_RING_INTERVAL = [0, 5000, 4000, 3000]; // level 0-3
const FIRE_RING_RADIUS = [0, 120, 180, 280]; // increased for better screen coverage
/** Lightning intervals/targets by level — much more frequent */
const LIGHTNING_INTERVAL = [0, 2500, 1800, 1200];
const LIGHTNING_TARGETS = [0, 3, 5, 8];
const LIGHTNING_RANGE = 300;
/** Shield regen interval by level (ms) */
const SHIELD_REGEN_INTERVAL = [0, 10000, 7000, 4000];

/** Divine Orbit — orbs orbiting the player */
const ORBIT_COUNT = [0, 2, 3, 4];
const ORBIT_RADIUS = [0, 60, 80, 100];
const ORBIT_SPEED = 2.5; // radians per second
const ORBIT_ORB_SIZE = 8;

/** Holy Water — ground damage pools */
const HOLY_WATER_INTERVAL = [0, 7000, 5000, 4000];
const HOLY_WATER_COUNT = [0, 1, 2, 3];
const HOLY_WATER_RADIUS = [0, 50, 60, 70];
const HOLY_WATER_DURATION = 3000;
const HOLY_WATER_TICK = 500;

/** Throwing Axe — piercing projectiles */
const AXE_INTERVAL = [0, 4000, 2800, 2000];
const AXE_COUNT = [0, 1, 1, 2];
const AXE_SPEED = 200;
const AXE_SIZE = 10;

/** Radiant Beam — line attack */
const BEAM_INTERVAL = [0, 5000, 3500, 2500];
const BEAM_WIDTH = [0, 20, 30, 40];

const WEAPON_COLOR_MAP: Record<string, number> = {
  "fire-ring": 0xef5350, lightning: 0xffee58, shield: 0x42a5f5,
  orbit: 0xba68c8, "holy-water": 0x4fc3f7, axe: 0xff8a65, beam: 0xffd54f,
};
const WEAPON_ICON_MAP: Record<string, string> = {
  "fire-ring": "\u{1F525}", lightning: "\u{26A1}", shield: "\u{1F6E1}\u{FE0F}",
  orbit: "\u{1F52E}", "holy-water": "\u{1F4A7}", axe: "\u{1FA93}", beam: "\u{2728}",
};

export class SurvivorsScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private enemies!: Phaser.GameObjects.Group;
  private projectiles!: Phaser.GameObjects.Group;
  private axeProjectiles!: Phaser.GameObjects.Group;

  private state!: SurvivorsState;
  private questionPool!: QuestionPool;
  private currentQuestion: Question | null = null;
  private waveNumber = 0; // increments each question cycle

  // Timers
  private spawnTimer!: Phaser.Time.TimerEvent;
  private attackTimer!: Phaser.Time.TimerEvent;
  private questionTimer!: Phaser.Time.TimerEvent;
  private elapsedTimer!: Phaser.Time.TimerEvent;

  // Passive weapon timers
  private fireRingTimer: Phaser.Time.TimerEvent | null = null;
  private lightningTimer: Phaser.Time.TimerEvent | null = null;
  private shieldTimer: Phaser.Time.TimerEvent | null = null;
  private holyWaterTimer: Phaser.Time.TimerEvent | null = null;
  private axeTimer: Phaser.Time.TimerEvent | null = null;
  private beamTimer: Phaser.Time.TimerEvent | null = null;

  // Orbit weapon visuals
  private orbitOrbs: Phaser.GameObjects.Arc[] = [];

  // UI
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private enemyCountText!: Phaser.GameObjects.Text;
  private weaponHudText!: Phaser.GameObjects.Text;

  // Overlay state
  private questionPanel: Phaser.GameObjects.Container | null = null;
  private weaponPanel: Phaser.GameObjects.Container | null = null;
  private isShowingOverlay = false;
  private isComplete = false;

  constructor() {
    super({ key: "SurvivorsScene" });
  }

  create(): void {
    const lesson = this.registry.get("lesson") as LessonConfig;
    const difficulty = this.registry.get("difficulty") as string;

    this.questionPool = new QuestionPool(
      lesson.questions,
      difficulty as "little-kids" | "big-kids",
    );

    this.state = createInitialState();
    this.isShowingOverlay = false;
    this.isComplete = false;
    this.currentQuestion = null;
    this.waveNumber = 0;
    this.questionPanel = null;
    this.weaponPanel = null;
    this.fireRingTimer = null;
    this.lightningTimer = null;
    this.shieldTimer = null;
    this.holyWaterTimer = null;
    this.axeTimer = null;
    this.beamTimer = null;
    this.orbitOrbs = [];

    const { width, height } = this.scale;

    // Arena background
    this.drawArenaBackground(width, height);

    // Player
    this.player = this.add.circle(width / 2, height / 2, 16, 0x42a5f5);
    this.player.setStrokeStyle(2, 0x1565c0);
    this.physics.add.existing(this.player);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setCircle(16);
    playerBody.setCollideWorldBounds(true);

    // Groups
    this.enemies = this.add.group();
    this.projectiles = this.add.group();
    this.axeProjectiles = this.add.group();

    // Collision: projectile hits enemy
    this.physics.add.overlap(
      this.projectiles,
      this.enemies,
      this.onProjectileHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    // Collision: axe hits enemy (piercing — axe survives)
    this.physics.add.overlap(
      this.axeProjectiles,
      this.enemies,
      this.onAxeHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    // Collision: enemy reaches player
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.onEnemyReachPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    // Spawn timer — starts easy, gets faster each wave
    this.spawnTimer = this.time.addEvent({
      delay: BASE_SPAWN_INTERVAL,
      callback: this.spawnEnemy,
      callbackScope: this,
      loop: true,
    });

    // Auto-attack timer
    this.attackTimer = this.time.addEvent({
      delay: AUTO_ATTACK_INTERVAL,
      callback: this.autoAttack,
      callbackScope: this,
      loop: true,
    });

    // Question timer
    this.questionTimer = this.time.addEvent({
      delay: QUESTION_INTERVAL,
      callback: this.triggerQuestion,
      callbackScope: this,
      loop: true,
    });

    // Elapsed timer
    this.elapsedTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (!this.isShowingOverlay && !this.isComplete) {
          this.state = { ...this.state, elapsedSeconds: this.state.elapsedSeconds + 1 };
          this.updateHUD();
        }
      },
      callbackScope: this,
      loop: true,
    });

    this.createHUD();
    this.setupMovement();
  }

  update(): void {
    if (this.isComplete) return;

    // Clean up off-screen projectiles
    for (const proj of this.projectiles.getChildren()) {
      const go = proj as Phaser.GameObjects.Arc;
      if (
        go.x < -20 || go.x > this.scale.width + 20 ||
        go.y < -20 || go.y > this.scale.height + 20
      ) {
        go.destroy();
      }
    }

    // Clean up off-screen axe projectiles
    for (const proj of this.axeProjectiles.getChildren()) {
      const go = proj as Phaser.GameObjects.Arc;
      if (
        go.x < -20 || go.x > this.scale.width + 20 ||
        go.y < -20 || go.y > this.scale.height + 20
      ) {
        go.destroy();
      }
    }

    // Update orbit weapon (positions always, collisions only when not overlaying)
    this.updateOrbitWeapon();

    // Move enemies toward player
    if (!this.isShowingOverlay) {
      const speedScale = this.state.enemySpeedMultiplier * (1 + this.waveNumber * 0.08);
      for (const enemy of this.enemies.getChildren()) {
        const go = enemy as Phaser.GameObjects.Arc;
        const body = go.body as Phaser.Physics.Arcade.Body;
        if (!body) continue;

        const angle = Phaser.Math.Angle.Between(go.x, go.y, this.player.x, this.player.y);
        const speed = ENEMY_BASE_SPEED * speedScale;
        body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      }
    }
  }

  // ---- Arena ----

  private drawArenaBackground(width: number, height: number): void {
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a2a1a);
    const gridSize = 40;
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x2a3a2a, 0.5);
    for (let x = 0; x <= width; x += gridSize) gfx.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += gridSize) gfx.lineBetween(0, y, width, y);
  }

  // ---- Movement ----

  private setupMovement(): void {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const speed = 180;

    if (this.input.keyboard) {
      const cursors = this.input.keyboard.createCursorKeys();
      const wasd = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
      }) as Record<string, Phaser.Input.Keyboard.Key>;

      this.events.on("update", () => {
        if (this.isShowingOverlay || this.isComplete) {
          playerBody.setVelocity(0, 0);
          return;
        }
        let vx = 0, vy = 0;
        if (cursors.left.isDown || wasd.left.isDown) vx = -speed;
        else if (cursors.right.isDown || wasd.right.isDown) vx = speed;
        if (cursors.up.isDown || wasd.up.isDown) vy = -speed;
        else if (cursors.down.isDown || wasd.down.isDown) vy = speed;
        playerBody.setVelocity(vx, vy);
      });
    }

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isShowingOverlay || this.isComplete || !pointer.isDown) return;
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.x, pointer.y);
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, pointer.x, pointer.y);
      if (dist > 10) {
        playerBody.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      } else {
        playerBody.setVelocity(0, 0);
      }
    });

    this.input.on("pointerup", () => {
      if (!this.isShowingOverlay && !this.isComplete) playerBody.setVelocity(0, 0);
    });
  }

  // ---- Enemy spawning ----

  private spawnEnemy(): void {
    if (this.isShowingOverlay || this.isComplete) return;
    const { width, height } = this.scale;

    // Spawn count scales with wave number + wrong-answer multiplier
    const count = Math.max(1, Math.round(1 + this.waveNumber * 0.3 + (this.state.enemySpawnMultiplier - 1) * 0.5));

    for (let i = 0; i < count; i++) {
      const side = Phaser.Math.Between(0, 3);
      let ex: number, ey: number;
      switch (side) {
        case 0: ex = Phaser.Math.Between(0, width); ey = -15; break;
        case 1: ex = width + 15; ey = Phaser.Math.Between(0, height); break;
        case 2: ex = Phaser.Math.Between(0, width); ey = height + 15; break;
        default: ex = -15; ey = Phaser.Math.Between(0, height); break;
      }

      const enemyColors = [0xef5350, 0xab47bc, 0xff7043, 0xec407a, 0x8d6e63];
      const color = enemyColors[Phaser.Math.Between(0, enemyColors.length - 1)];
      // Enemy size grows slightly with wave
      const radius = 8 + Math.min(this.waveNumber, 6);

      const enemy = this.add.circle(ex, ey, radius, color);
      enemy.setStrokeStyle(1, 0x000000);
      this.physics.add.existing(enemy);
      (enemy.body as Phaser.Physics.Arcade.Body).setCircle(radius);
      this.enemies.add(enemy);
    }
  }

  // ---- Auto-attack ----

  private autoAttack(): void {
    if (this.isShowingOverlay || this.isComplete) return;
    if (this.enemies.getLength() === 0) return;

    let nearest: Phaser.GameObjects.Arc | null = null;
    let minDist = Infinity;
    for (const enemy of this.enemies.getChildren()) {
      const go = enemy as Phaser.GameObjects.Arc;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, go.x, go.y);
      if (dist < minDist) { minDist = dist; nearest = go; }
    }
    if (!nearest) return;

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, nearest.x, nearest.y);
    const proj = this.add.circle(this.player.x, this.player.y, 5, 0xffee58);
    proj.setStrokeStyle(1, 0xf9a825);
    this.physics.add.existing(proj);
    const projBody = proj.body as Phaser.Physics.Arcade.Body;
    projBody.setCircle(5);
    projBody.setVelocity(Math.cos(angle) * PROJECTILE_SPEED, Math.sin(angle) * PROJECTILE_SPEED);
    this.projectiles.add(proj);
  }

  // ---- Collision ----

  private onProjectileHitEnemy(
    projectile: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void {
    if (!(enemy as Phaser.GameObjects.Arc).active) return;
    projectile.destroy();
    enemy.destroy();
    this.state = defeatEnemy(this.state);
    this.updateHUD();
    const go = enemy as Phaser.GameObjects.Arc;
    this.spawnDeathParticles(go.x, go.y);
  }

  private onAxeHitEnemy(
    _axe: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void {
    if (!(enemy as Phaser.GameObjects.Arc).active) return;
    const go = enemy as Phaser.GameObjects.Arc;
    this.spawnDeathParticles(go.x, go.y);
    enemy.destroy();
    this.state = defeatEnemy(this.state);
    this.updateHUD();
  }

  private onEnemyReachPlayer(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void {
    if (!(enemy as Phaser.GameObjects.Arc).active) return;
    enemy.destroy();
    this.state = takeDamage(this.state, 1);
    this.updateHUD();
    this.cameras.main.shake(150, 0.008);
    if (isGameOver(this.state)) this.endGame(false);
  }

  private spawnDeathParticles(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      const p = this.add.circle(
        x + Phaser.Math.Between(-5, 5), y + Phaser.Math.Between(-5, 5), 3, 0xffcc80,
      );
      this.tweens.add({
        targets: p, x: p.x + Phaser.Math.Between(-30, 30), y: p.y + Phaser.Math.Between(-30, 30),
        alpha: 0, scale: 0, duration: 300, onComplete: () => p.destroy(),
      });
    }
  }

  // ---- Question system ----

  private triggerQuestion(): void {
    if (this.isShowingOverlay || this.isComplete) return;
    if (!this.questionPool.hasMore()) {
      this.endGame(true);
      return;
    }

    this.currentQuestion = this.questionPool.next();
    if (!this.currentQuestion) return;

    this.isShowingOverlay = true;
    this.waveNumber++;

    // Pause enemies
    for (const enemy of this.enemies.getChildren()) {
      const body = (enemy as Phaser.GameObjects.Arc).body as Phaser.Physics.Arcade.Body;
      if (body) body.setVelocity(0, 0);
    }
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.showQuestionOverlay(this.currentQuestion);
  }

  private showQuestionOverlay(question: Question): void {
    const { width, height } = this.scale;
    const container = this.add.container(0, 0).setDepth(200);

    const backdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);
    container.add(backdrop);

    const panelW = Math.min(width - 40, 600);
    const panelH = 320;
    const panelBg = this.add.rectangle(width / 2, height / 2, panelW, panelH, 0xffffff, 0.95);
    panelBg.setStrokeStyle(3, 0x333333);
    container.add(panelBg);

    // Wave indicator
    const waveLabel = this.add.text(width / 2, height / 2 - panelH / 2 + 18, `Wave ${this.waveNumber}`, {
      fontSize: "13px", fontFamily: "sans-serif", color: "#999999", fontStyle: "bold",
    }).setOrigin(0.5, 0);
    container.add(waveLabel);

    const qText = this.add.text(width / 2, height / 2 - panelH / 2 + 42, question.text, {
      fontSize: "18px", fontFamily: "sans-serif", color: "#333333", fontStyle: "bold",
      wordWrap: { width: panelW - 60 }, align: "center",
    }).setOrigin(0.5, 0);
    container.add(qText);

    const btnW = (panelW - 60) / 2 - 5;
    const btnH = 44;
    const btnStartY = height / 2 - 10;
    const btnStartX = width / 2 - (panelW - 60) / 4;

    question.options.forEach((option, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const bx = btnStartX + col * (btnW + 10);
      const by = btnStartY + row * (btnH + 10);

      const btn = this.add.rectangle(bx, by, btnW, btnH, ANSWER_COLORS[idx]);
      btn.setStrokeStyle(2, 0x000000);
      btn.setInteractive({ useHandCursor: true });

      const label = this.add.text(bx, by, `${ANSWER_LABELS[idx]}: ${option}`, {
        fontSize: "13px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
        wordWrap: { width: btnW - 16 }, align: "center",
      }).setOrigin(0.5);

      container.add(btn);
      container.add(label);

      btn.on("pointerdown", () => this.handleAnswer(idx === question.correctIndex, container));
    });

    this.questionPanel = container;
  }

  private handleAnswer(correct: boolean, container: Phaser.GameObjects.Container): void {
    this.state = answerQuestion(this.state, correct);
    this.updateHUD();

    const { width, height } = this.scale;

    if (correct) {
      const feedback = this.add.text(width / 2, height / 2 + 130, "Correct!", {
        fontSize: "28px", fontFamily: "sans-serif", color: "#43a047", fontStyle: "bold",
      }).setOrigin(0.5).setDepth(201);
      container.add(feedback);

      this.time.delayedCall(600, () => {
        container.destroy();
        this.questionPanel = null;
        this.showWeaponSelection();
      });
    } else {
      const feedback = this.add.text(width / 2, height / 2 + 130, "Wrong! Enemies grow stronger...", {
        fontSize: "20px", fontFamily: "sans-serif", color: "#e53935", fontStyle: "bold",
      }).setOrigin(0.5).setDepth(201);
      container.add(feedback);

      this.cameras.main.shake(200, 0.01);

      this.time.delayedCall(1000, () => {
        container.destroy();
        this.questionPanel = null;
        this.isShowingOverlay = false;
        // Ramp up difficulty — tighten spawn interval
        this.updateSpawnRate();
      });
    }
  }

  // ---- Weapon selection (progressive, VS-style random 3) ----

  private showWeaponSelection(): void {
    // Filter to non-maxed weapons
    const available = WEAPON_OPTIONS.filter(
      (w) => getWeaponLevel(this.state, w.type) < MAX_WEAPON_LEVEL,
    );

    if (available.length === 0) {
      // All weapons maxed — show +1 Max HP option
      this.showMaxHpSelection();
      return;
    }

    // Shuffle and pick up to 3 (like Vampire Survivors)
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const options = shuffled.slice(0, 3);

    const { width, height } = this.scale;
    const container = this.add.container(0, 0).setDepth(200);

    const backdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);
    container.add(backdrop);

    const title = this.add.text(width / 2, height * 0.18, "Choose a Power-Up!", {
      fontSize: "28px", fontFamily: "sans-serif", color: "#FFD700", fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(title);

    const cardW = 180;
    const cardH = 180;
    const gap = 20;
    const totalW = options.length * cardW + (options.length - 1) * gap;
    const startX = width / 2 - totalW / 2 + cardW / 2;

    const descLines: Record<string, string[]> = {
      "fire-ring": ["Lv1: AoE burst every 5s", "Lv2: Every 4s, bigger", "Lv3: Every 3s, huge"],
      "lightning": ["Lv1: Chain 3 enemies/2.5s", "Lv2: Chain 5/1.8s", "Lv3: Chain 8/1.2s"],
      "shield": ["Lv1: Regen 1 HP/10s", "Lv2: 1 HP/7s", "Lv3: 1 HP/4s"],
      "orbit": ["Lv1: 2 orbs orbit you", "Lv2: 3 orbs, wider", "Lv3: 4 orbs, widest"],
      "holy-water": ["Lv1: 1 pool every 7s", "Lv2: 2 pools/5s", "Lv3: 3 pools/4s"],
      "axe": ["Lv1: Piercing axe/4s", "Lv2: Every 2.8s", "Lv3: 2 axes/2s"],
      "beam": ["Lv1: Beam every 5s", "Lv2: Every 3.5s, wider", "Lv3: Every 2.5s, widest"],
    };

    options.forEach((weapon, idx) => {
      const cx = startX + idx * (cardW + gap);
      const cy = height * 0.5;
      const currentLevel = getWeaponLevel(this.state, weapon.type);

      const card = this.add.rectangle(cx, cy, cardW, cardH, 0x2a2a3a, 0.95);
      card.setStrokeStyle(3, WEAPON_COLOR_MAP[weapon.type] ?? 0xffffff);
      card.setInteractive({ useHandCursor: true });
      container.add(card);

      // Icon
      container.add(this.add.text(cx, cy - 50, WEAPON_ICON_MAP[weapon.type] ?? "\u{2694}", { fontSize: "32px" }).setOrigin(0.5));

      // Name
      container.add(this.add.text(cx, cy - 8, weapon.name, {
        fontSize: "16px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
      }).setOrigin(0.5));

      // Level indicator
      const levelStr = currentLevel === 0 ? "NEW!" : `Lv ${currentLevel} \u2192 ${currentLevel + 1}`;
      const levelColor = currentLevel === 0 ? "#00ff88" : "#ffd700";
      container.add(this.add.text(cx, cy + 18, levelStr, {
        fontSize: "14px", fontFamily: "sans-serif", color: levelColor, fontStyle: "bold",
      }).setOrigin(0.5));

      // Description
      const nextLevel = Math.min(currentLevel + 1, 3);
      const descText = descLines[weapon.type]?.[nextLevel - 1] ?? weapon.description;
      container.add(this.add.text(cx, cy + 45, descText, {
        fontSize: "11px", fontFamily: "sans-serif", color: "#cccccc",
        wordWrap: { width: cardW - 20 }, align: "center",
      }).setOrigin(0.5));

      card.on("pointerdown", () => this.selectWeapon(weapon, container));
    });

    this.weaponPanel = container;
  }

  private selectWeapon(weapon: WeaponUpgrade, container: Phaser.GameObjects.Container): void {
    this.state = addWeapon(this.state, weapon);

    // Restart the passive timer for this weapon at new level
    this.setupPassiveWeapon(weapon.type);

    container.destroy();
    this.weaponPanel = null;
    this.isShowingOverlay = false;
    this.updateHUD();
    // Scale enemies after correct answer too
    this.updateSpawnRate();
  }

  // ---- Max HP selection (when all weapons are maxed) ----

  private showMaxHpSelection(): void {
    const { width, height } = this.scale;
    const container = this.add.container(0, 0).setDepth(200);

    const backdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);
    container.add(backdrop);

    container.add(this.add.text(width / 2, height * 0.18, "All Weapons Maxed!", {
      fontSize: "28px", fontFamily: "sans-serif", color: "#FFD700", fontStyle: "bold",
    }).setOrigin(0.5));

    const cardW = 200;
    const cardH = 180;
    const cx = width / 2;
    const cy = height * 0.5;

    const card = this.add.rectangle(cx, cy, cardW, cardH, 0x2a2a3a, 0.95);
    card.setStrokeStyle(3, 0xe53935);
    card.setInteractive({ useHandCursor: true });
    container.add(card);

    container.add(this.add.text(cx, cy - 50, "\u{2764}\u{FE0F}", { fontSize: "32px" }).setOrigin(0.5));
    container.add(this.add.text(cx, cy - 8, "+1 Max Health", {
      fontSize: "18px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5));
    container.add(this.add.text(cx, cy + 18, `HP: ${this.state.maxHp} \u2192 ${this.state.maxHp + 1}`, {
      fontSize: "14px", fontFamily: "sans-serif", color: "#00ff88", fontStyle: "bold",
    }).setOrigin(0.5));
    container.add(this.add.text(cx, cy + 45, "Increases max HP and heals 1", {
      fontSize: "11px", fontFamily: "sans-serif", color: "#cccccc",
    }).setOrigin(0.5));

    card.on("pointerdown", () => {
      this.state = boostMaxHp(this.state);
      container.destroy();
      this.weaponPanel = null;
      this.isShowingOverlay = false;
      this.updateHUD();
      this.updateSpawnRate();
    });

    this.weaponPanel = container;
  }

  // ---- Passive weapon effects ----

  private setupPassiveWeapon(type: WeaponType): void {
    const level = getWeaponLevel(this.state, type);
    if (level === 0) return;

    switch (type) {
      case "fire-ring": {
        if (this.fireRingTimer) this.fireRingTimer.remove();
        this.fireRingTimer = this.time.addEvent({
          delay: FIRE_RING_INTERVAL[level],
          callback: () => this.passiveFireRing(level),
          callbackScope: this,
          loop: true,
        });
        break;
      }
      case "lightning": {
        if (this.lightningTimer) this.lightningTimer.remove();
        this.lightningTimer = this.time.addEvent({
          delay: LIGHTNING_INTERVAL[level],
          callback: () => this.passiveLightning(level),
          callbackScope: this,
          loop: true,
        });
        break;
      }
      case "shield": {
        if (this.shieldTimer) this.shieldTimer.remove();
        this.shieldTimer = this.time.addEvent({
          delay: SHIELD_REGEN_INTERVAL[level],
          callback: () => this.passiveShieldRegen(),
          callbackScope: this,
          loop: true,
        });
        break;
      }
      case "orbit": {
        this.setupOrbitWeapon();
        break;
      }
      case "holy-water": {
        if (this.holyWaterTimer) this.holyWaterTimer.remove();
        this.holyWaterTimer = this.time.addEvent({
          delay: HOLY_WATER_INTERVAL[level],
          callback: () => this.passiveHolyWater(level),
          callbackScope: this,
          loop: true,
        });
        break;
      }
      case "axe": {
        if (this.axeTimer) this.axeTimer.remove();
        this.axeTimer = this.time.addEvent({
          delay: AXE_INTERVAL[level],
          callback: () => this.passiveAxe(level),
          callbackScope: this,
          loop: true,
        });
        break;
      }
      case "beam": {
        if (this.beamTimer) this.beamTimer.remove();
        this.beamTimer = this.time.addEvent({
          delay: BEAM_INTERVAL[level],
          callback: () => this.passiveBeam(level),
          callbackScope: this,
          loop: true,
        });
        break;
      }
    }
  }

  private passiveFireRing(level: number): void {
    if (this.isShowingOverlay || this.isComplete) return;
    const radius = FIRE_RING_RADIUS[level];

    // Visual ring
    const ring = this.add.circle(this.player.x, this.player.y, radius, 0xff5722, 0.15);
    ring.setStrokeStyle(3, 0xff5722);

    const toDestroy: Phaser.GameObjects.Arc[] = [];
    for (const enemy of this.enemies.getChildren()) {
      const go = enemy as Phaser.GameObjects.Arc;
      if (!go.active) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, go.x, go.y);
      if (dist <= radius) toDestroy.push(go);
    }
    for (const go of toDestroy) {
      this.spawnDeathParticles(go.x, go.y);
      go.destroy();
      this.state = defeatEnemy(this.state);
    }
    this.updateHUD();

    this.tweens.add({
      targets: ring, alpha: 0, scale: 1.5, duration: 500,
      onComplete: () => ring.destroy(),
    });
  }

  private passiveLightning(level: number): void {
    if (this.isShowingOverlay || this.isComplete) return;
    const maxTargets = LIGHTNING_TARGETS[level];

    const sorted: Array<{ go: Phaser.GameObjects.Arc; dist: number }> = [];
    for (const enemy of this.enemies.getChildren()) {
      const go = enemy as Phaser.GameObjects.Arc;
      if (!go.active) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, go.x, go.y);
      if (dist <= LIGHTNING_RANGE) sorted.push({ go, dist });
    }
    sorted.sort((a, b) => a.dist - b.dist);
    const targets = sorted.slice(0, maxTargets);

    const gfx = this.add.graphics();
    gfx.lineStyle(2, 0xffee58, 1);
    let prevX = this.player.x, prevY = this.player.y;
    for (const { go } of targets) {
      gfx.lineBetween(prevX, prevY, go.x, go.y);
      prevX = go.x; prevY = go.y;
      this.spawnDeathParticles(go.x, go.y);
      go.destroy();
      this.state = defeatEnemy(this.state);
    }
    this.updateHUD();

    this.tweens.add({
      targets: gfx, alpha: 0, duration: 400, onComplete: () => gfx.destroy(),
    });
  }

  private passiveShieldRegen(): void {
    if (this.isShowingOverlay || this.isComplete) return;
    if (this.state.playerHp < this.state.maxHp) {
      this.state = healPlayer(this.state, 1);
      this.updateHUD();

      // Visual heal flash
      const flash = this.add.circle(this.player.x, this.player.y, 22, 0x00ff88, 0.3);
      this.tweens.add({
        targets: flash, alpha: 0, scale: 1.5, duration: 400,
        onComplete: () => flash.destroy(),
      });
    }
  }

  // ---- Divine Orbit ----

  private setupOrbitWeapon(): void {
    // Destroy existing orbs
    for (const orb of this.orbitOrbs) {
      if (orb && orb.active) orb.destroy();
    }
    this.orbitOrbs = [];

    const level = getWeaponLevel(this.state, "orbit");
    if (level === 0) return;

    const count = ORBIT_COUNT[level];
    for (let i = 0; i < count; i++) {
      const orb = this.add.circle(this.player.x, this.player.y, ORBIT_ORB_SIZE, 0xba68c8);
      orb.setStrokeStyle(2, 0x7b1fa2);
      orb.setDepth(50);
      this.orbitOrbs.push(orb);
    }
  }

  private updateOrbitWeapon(): void {
    const level = getWeaponLevel(this.state, "orbit");
    if (level === 0 || this.orbitOrbs.length === 0) return;

    const radius = ORBIT_RADIUS[level];
    const count = this.orbitOrbs.length;
    const time = this.time.now / 1000;

    // Always update positions (visual)
    for (let i = 0; i < count; i++) {
      const orb = this.orbitOrbs[i];
      if (!orb || !orb.active) continue;
      const angle = time * ORBIT_SPEED + (i / count) * Math.PI * 2;
      orb.x = this.player.x + Math.cos(angle) * radius;
      orb.y = this.player.y + Math.sin(angle) * radius;
    }

    // Only check collisions when not in overlay
    if (this.isShowingOverlay || this.isComplete) return;

    const enemyRadius = 8 + Math.min(this.waveNumber, 6);
    const hitDist = ORBIT_ORB_SIZE + enemyRadius;
    const toDestroy: Phaser.GameObjects.Arc[] = [];

    for (const enemy of this.enemies.getChildren()) {
      const go = enemy as Phaser.GameObjects.Arc;
      if (!go.active) continue;
      for (const orb of this.orbitOrbs) {
        if (!orb || !orb.active) continue;
        const dist = Phaser.Math.Distance.Between(orb.x, orb.y, go.x, go.y);
        if (dist <= hitDist) {
          toDestroy.push(go);
          break;
        }
      }
    }

    for (const go of toDestroy) {
      this.spawnDeathParticles(go.x, go.y);
      go.destroy();
      this.state = defeatEnemy(this.state);
    }
    if (toDestroy.length > 0) this.updateHUD();
  }

  // ---- Holy Water ----

  private passiveHolyWater(level: number): void {
    if (this.isShowingOverlay || this.isComplete) return;
    const poolCount = HOLY_WATER_COUNT[level];
    const poolRadius = HOLY_WATER_RADIUS[level];

    for (let p = 0; p < poolCount; p++) {
      // Drop near a random enemy, or random spot if no enemies
      let px: number, py: number;
      const enemies = this.enemies.getChildren();
      if (enemies.length > 0) {
        const target = enemies[Phaser.Math.Between(0, enemies.length - 1)] as Phaser.GameObjects.Arc;
        px = target.x + Phaser.Math.Between(-30, 30);
        py = target.y + Phaser.Math.Between(-30, 30);
      } else {
        px = Phaser.Math.Between(50, this.scale.width - 50);
        py = Phaser.Math.Between(50, this.scale.height - 50);
      }

      // Create pool visual
      const pool = this.add.circle(px, py, poolRadius, 0x4fc3f7, 0.25);
      pool.setStrokeStyle(2, 0x0288d1);
      pool.setDepth(5);

      // Damage tick timer
      const tickTimer = this.time.addEvent({
        delay: HOLY_WATER_TICK,
        callback: () => {
          if (this.isShowingOverlay || this.isComplete) return;
          const toDestroy: Phaser.GameObjects.Arc[] = [];
          for (const enemy of this.enemies.getChildren()) {
            const go = enemy as Phaser.GameObjects.Arc;
            if (!go.active) continue;
            const dist = Phaser.Math.Distance.Between(px, py, go.x, go.y);
            if (dist <= poolRadius) toDestroy.push(go);
          }
          for (const go of toDestroy) {
            this.spawnDeathParticles(go.x, go.y);
            go.destroy();
            this.state = defeatEnemy(this.state);
          }
          if (toDestroy.length > 0) this.updateHUD();
        },
        callbackScope: this,
        loop: true,
      });

      // Self-destruct after duration
      this.time.delayedCall(HOLY_WATER_DURATION, () => {
        tickTimer.remove();
        this.tweens.add({
          targets: pool, alpha: 0, duration: 300,
          onComplete: () => pool.destroy(),
        });
      });
    }
  }

  // ---- Throwing Axe ----

  private passiveAxe(level: number): void {
    if (this.isShowingOverlay || this.isComplete) return;
    const count = AXE_COUNT[level];

    for (let i = 0; i < count; i++) {
      // Aim at a random enemy for variety, or random direction
      let angle: number;
      const enemies = this.enemies.getChildren();
      if (enemies.length > 0) {
        const target = enemies[Phaser.Math.Between(0, enemies.length - 1)] as Phaser.GameObjects.Arc;
        angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
      } else {
        angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      }

      // Offset slightly if multiple axes
      if (count > 1) {
        angle += (i - (count - 1) / 2) * 0.3;
      }

      const axe = this.add.circle(this.player.x, this.player.y, AXE_SIZE, 0xff8a65);
      axe.setStrokeStyle(2, 0xbf360c);
      this.physics.add.existing(axe);
      const body = axe.body as Phaser.Physics.Arcade.Body;
      body.setCircle(AXE_SIZE);
      body.setVelocity(Math.cos(angle) * AXE_SPEED, Math.sin(angle) * AXE_SPEED);
      this.axeProjectiles.add(axe);
    }
  }

  // ---- Radiant Beam ----

  private passiveBeam(level: number): void {
    if (this.isShowingOverlay || this.isComplete) return;
    const beamW = BEAM_WIDTH[level];

    // Aim at nearest enemy, or random direction
    let angle: number;
    const enemies = this.enemies.getChildren();
    if (enemies.length > 0) {
      let nearest: Phaser.GameObjects.Arc | null = null;
      let minDist = Infinity;
      for (const enemy of enemies) {
        const go = enemy as Phaser.GameObjects.Arc;
        if (!go.active) continue;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, go.x, go.y);
        if (dist < minDist) { minDist = dist; nearest = go; }
      }
      if (nearest) {
        angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, nearest.x, nearest.y);
      } else {
        angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      }
    } else {
      angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    }

    // Calculate beam end point (extend to screen edge)
    const maxLen = Math.max(this.scale.width, this.scale.height) * 1.5;
    const endX = this.player.x + Math.cos(angle) * maxLen;
    const endY = this.player.y + Math.sin(angle) * maxLen;

    // Draw beam visual
    const gfx = this.add.graphics();
    gfx.lineStyle(beamW, 0xffd54f, 0.8);
    gfx.lineBetween(this.player.x, this.player.y, endX, endY);
    gfx.setDepth(60);

    // Add glow effect
    const glowGfx = this.add.graphics();
    glowGfx.lineStyle(beamW * 2, 0xffd54f, 0.2);
    glowGfx.lineBetween(this.player.x, this.player.y, endX, endY);
    glowGfx.setDepth(59);

    // Check all enemies against beam line
    const toDestroy: Phaser.GameObjects.Arc[] = [];
    for (const enemy of enemies) {
      const go = enemy as Phaser.GameObjects.Arc;
      if (!go.active) continue;
      const dist = this.pointToLineDistance(go.x, go.y, this.player.x, this.player.y, endX, endY);
      // Check forward direction only
      const dotProduct = (go.x - this.player.x) * Math.cos(angle) + (go.y - this.player.y) * Math.sin(angle);
      if (dist <= beamW / 2 + 10 && dotProduct > 0) {
        toDestroy.push(go);
      }
    }

    for (const go of toDestroy) {
      this.spawnDeathParticles(go.x, go.y);
      go.destroy();
      this.state = defeatEnemy(this.state);
    }
    if (toDestroy.length > 0) this.updateHUD();

    // Fade out beam
    this.tweens.add({
      targets: [gfx, glowGfx], alpha: 0, duration: 300,
      onComplete: () => { gfx.destroy(); glowGfx.destroy(); },
    });
  }

  private pointToLineDistance(
    px: number, py: number, x1: number, y1: number, x2: number, y2: number,
  ): number {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const len2 = C * C + D * D;
    if (len2 === 0) return Math.sqrt(A * A + B * B);
    const t = Math.max(0, Math.min(1, (A * C + B * D) / len2));
    const projX = x1 + t * C;
    const projY = y1 + t * D;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  }

  // ---- Spawn rate management ----

  private updateSpawnRate(): void {
    // Base gets faster with waves, then wrong-answer multiplier on top
    const waveScale = 1 + this.waveNumber * 0.15;
    const newDelay = Math.max(400, BASE_SPAWN_INTERVAL / (waveScale * this.state.enemySpawnMultiplier));
    this.spawnTimer.reset({
      delay: newDelay,
      callback: this.spawnEnemy,
      callbackScope: this,
      loop: true,
    });
  }

  // ---- End game ----

  private endGame(victory: boolean): void {
    if (this.isComplete) return;
    this.isComplete = true;
    this.isShowingOverlay = true;

    this.state = { ...this.state, victory, gameOver: !victory || this.state.gameOver };

    // Stop all timers
    this.spawnTimer.remove();
    this.attackTimer.remove();
    this.questionTimer.remove();
    this.elapsedTimer.remove();
    if (this.fireRingTimer) this.fireRingTimer.remove();
    if (this.lightningTimer) this.lightningTimer.remove();
    if (this.shieldTimer) this.shieldTimer.remove();
    if (this.holyWaterTimer) this.holyWaterTimer.remove();
    if (this.axeTimer) this.axeTimer.remove();
    if (this.beamTimer) this.beamTimer.remove();

    // Clean up orbit orbs
    for (const orb of this.orbitOrbs) {
      if (orb && orb.active) orb.destroy();
    }
    this.orbitOrbs = [];

    for (const enemy of this.enemies.getChildren()) {
      const body = (enemy as Phaser.GameObjects.Arc).body as Phaser.Physics.Arcade.Body;
      if (body) body.setVelocity(0, 0);
    }
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    if (this.questionPanel) { this.questionPanel.destroy(); this.questionPanel = null; }
    if (this.weaponPanel) { this.weaponPanel.destroy(); this.weaponPanel = null; }

    this.time.delayedCall(500, () => this.showCompletion(victory));
  }

  // ---- Completion ----

  private showCompletion(victory: boolean): void {
    const { width, height } = this.scale;
    const stars = calculateStars(this.state);
    const container = this.add.container(0, 0).setDepth(300);

    container.add(this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6));

    const titleText = victory ? "Victory!" : "Defeated!";
    const titleColor = victory ? "#FFD700" : "#e53935";
    container.add(this.add.text(width / 2, height * 0.1, titleText, {
      fontSize: "36px", fontFamily: "sans-serif", color: titleColor, fontStyle: "bold",
    }).setOrigin(0.5));

    const starStr = Array(stars).fill("\u2605").join(" ") + " " + Array(3 - stars).fill("\u2606").join(" ");
    container.add(this.add.text(width / 2, height * 0.22, starStr.trim(), {
      fontSize: "44px", fontFamily: "sans-serif", color: "#FFC107",
    }).setOrigin(0.5));

    container.add(this.add.text(width / 2, height * 0.34, `Score: ${this.state.score}`, {
      fontSize: "24px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5));

    const minutes = Math.floor(this.state.elapsedSeconds / 60);
    const seconds = this.state.elapsedSeconds % 60;
    const weaponSummary = this.state.weapons.map((w) => {
      const name = WEAPON_OPTIONS.find((o) => o.type === w.type)?.name ?? w.type;
      return `${name} Lv${w.level}`;
    }).join(", ") || "None";

    const statsLines = [
      `Enemies Defeated: ${this.state.enemiesDefeated}`,
      `Questions: ${this.state.questionsCorrect} / ${this.state.questionsTotal}`,
      `Time: ${minutes}:${seconds.toString().padStart(2, "0")}`,
      `Weapons: ${weaponSummary}`,
    ];
    container.add(this.add.text(width / 2, height * 0.44, statsLines.join("\n"), {
      fontSize: "15px", fontFamily: "sans-serif", color: "#cccccc", align: "center", lineSpacing: 6,
    }).setOrigin(0.5, 0));

    // Buttons
    const playBg = this.add.rectangle(width / 2 - 90, height * 0.72, 150, 50, 0x43a047);
    playBg.setStrokeStyle(2, 0x2e7d32);
    playBg.setInteractive({ useHandCursor: true });
    container.add(playBg);
    container.add(this.add.text(width / 2 - 90, height * 0.72, "Play Again", {
      fontSize: "18px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5));
    playBg.on("pointerdown", () => { container.destroy(); this.scene.restart(); });

    const backBg = this.add.rectangle(width / 2 + 90, height * 0.72, 150, 50, 0x1e88e5);
    backBg.setStrokeStyle(2, 0x1565c0);
    backBg.setInteractive({ useHandCursor: true });
    container.add(backBg);
    container.add(this.add.text(width / 2 + 90, height * 0.72, "Back to Games", {
      fontSize: "18px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5));
    backBg.on("pointerdown", () => { window.location.hash = "#/"; });
  }

  // ---- HUD ----

  private createHUD(): void {
    const { width } = this.scale;

    this.scoreText = this.add.text(width - 15, 10, `Score: ${this.state.score}`, {
      fontSize: "16px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
      backgroundColor: "rgba(0,0,0,0.4)", padding: { x: 10, y: 5 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);

    this.hpText = this.add.text(15, 10, `HP: ${this.state.playerHp} / ${this.state.maxHp}`, {
      fontSize: "16px", fontFamily: "sans-serif", color: "#ef5350", fontStyle: "bold",
      backgroundColor: "rgba(0,0,0,0.4)", padding: { x: 10, y: 5 },
    }).setScrollFactor(0).setDepth(100);

    this.timerText = this.add.text(width / 2, 10, "0:00", {
      fontSize: "16px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
      backgroundColor: "rgba(0,0,0,0.4)", padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);

    this.enemyCountText = this.add.text(15, 40, "Enemies: 0", {
      fontSize: "14px", fontFamily: "sans-serif", color: "#cccccc",
      backgroundColor: "rgba(0,0,0,0.4)", padding: { x: 10, y: 4 },
    }).setScrollFactor(0).setDepth(100);

    this.weaponHudText = this.add.text(15, 66, "", {
      fontSize: "12px", fontFamily: "sans-serif", color: "#ffd700",
      backgroundColor: "rgba(0,0,0,0.4)", padding: { x: 10, y: 4 },
    }).setScrollFactor(0).setDepth(100);
  }

  private updateHUD(): void {
    this.scoreText?.setText(`Score: ${this.state.score}`);
    this.hpText?.setText(`HP: ${this.state.playerHp} / ${this.state.maxHp}`);

    const minutes = Math.floor(this.state.elapsedSeconds / 60);
    const seconds = this.state.elapsedSeconds % 60;
    this.timerText?.setText(`${minutes}:${seconds.toString().padStart(2, "0")}`);

    this.enemyCountText?.setText(`Enemies: ${this.state.enemiesDefeated}`);

    // Weapon HUD
    if (this.state.weapons.length > 0) {
      const weapStr = this.state.weapons.map((w) => {
        return `${WEAPON_ICON_MAP[w.type] ?? ""}Lv${w.level}`;
      }).join(" ");
      this.weaponHudText?.setText(weapStr);
    }
  }
}
