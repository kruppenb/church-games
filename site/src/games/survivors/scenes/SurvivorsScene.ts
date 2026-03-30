import Phaser from "phaser";
import type { LessonConfig, Question } from "@/types/lesson";
import { filterByDifficulty } from "@/lib/difficulty";
import { QuestionPool } from "@/lib/question-pool";
import { saveScore } from "@/lib/score-store";
import {
  createInitialState,
  answerQuestion,
  addWeapon,
  getWeaponLevel,
  defeatEnemy,
  defeatElite,
  collectScorePowerUp,
  takeDamage,
  healPlayer,
  boostMaxHp,
  calculateStars,
  isGameOver,
  getAvailableEvolutions,
  evolveWeapon,
  generateWeaponChoices,
  collectXpOrb,
  getXpBarProgress,
  activateXpBonus,
  WEAPON_OPTIONS,
  MAX_WEAPON_LEVEL,
  EVOLUTION_RECIPES,
  type SurvivorsState,
  type WeaponUpgrade,
  type WeaponType,
  type EvolvedWeaponType,
  type WeaponChoice,
  type XpBonusType,
} from "../logic/survivors-logic";

/** How often the player auto-fires base projectile (ms). */
const AUTO_ATTACK_INTERVAL = 500;
/** Time between questions (seconds of gameplay, pauses during overlays). */
const QUESTION_INTERVAL_SEC = 18;
/** Enemy base speed (px/s) — kept slow so swarms feel manageable. */
const ENEMY_BASE_SPEED = 40;
/** Projectile speed (px/s). */
const PROJECTILE_SPEED = 350;
/** Base enemy spawn interval (ms) — faster spawns for bigger swarms. */
const BASE_SPAWN_INTERVAL = 1200;

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

/** Elite enemy config */
const ELITE_HP = 5;
const ELITE_RADIUS = 22;
const ELITE_COLOR = 0xffd700; // gold
const ELITE_SPEED_MULT = 0.7; // slower than normal

/** Power-up config */
const POWERUP_DROP_CHANCE = 0.04; // 4% from normal enemies
const POWERUP_LIFETIME = 8000; // ms before fading

/** XP orb config */
const XP_ORB_RADIUS = 5;
const XP_ORB_PICKUP_RADIUS = 80;
const XP_ORB_MAGNET_RADIUS = 9999; // screen-wide during magnet
const XP_ORB_COLORS = [0x7c4dff, 0x536dfe, 0x448aff, 0x40c4ff, 0x18ffff];
const XP_ORB_SPEED = 300; // speed when attracted to player
const XP_ORB_DROP_CHANCE = 0.65; // 65% chance from normal enemies
const XP_ORB_ELITE_COUNT = 5; // elites drop multiple orbs
const MAGNET_SPAWN_INTERVAL = 45000; // a magnet spawns every 45s
const MAGNET_DURATION = 5000; // magnet effect lasts 5s
const MAGNET_COLOR = 0xff4081;

/** Evolution weapon intervals — must feel faster than max-level base weapons */
const EVOLVED_BAPTISM_INTERVAL = 2500;
const EVOLVED_STORM_INTERVAL = 2000;
const EVOLVED_AEGIS_REGEN_INTERVAL = 2000;
const EVOLVED_VORTEX_INTERVAL = 2000;

const WEAPON_COLOR_MAP: Record<string, number> = {
  "fire-ring": 0xef5350, lightning: 0xffee58, shield: 0x42a5f5,
  orbit: 0xba68c8, "holy-water": 0x4fc3f7, axe: 0xff8a65, beam: 0xffd54f,
};
const WEAPON_ICON_MAP: Record<string, string> = {
  "fire-ring": "\u{1F525}", lightning: "\u{26A1}", shield: "\u{1F6E1}\u{FE0F}",
  orbit: "\u{1F52E}", "holy-water": "\u{1F4A7}", axe: "\u{1FA93}", beam: "\u{2728}",
};
const EVOLUTION_COLOR_MAP: Record<string, number> = {
  "baptism-of-fire": 0xff6600,
  "storm-of-judgment": 0xffee00,
  "divine-aegis": 0x00e5ff,
  "celestial-vortex": 0xd500f9,
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
  private elapsedTimer!: Phaser.Time.TimerEvent;

  // Question timing — based on game elapsed seconds (pauses during overlays)
  private nextQuestionAt = QUESTION_INTERVAL_SEC;

  // Passive weapon timers
  private fireRingTimer: Phaser.Time.TimerEvent | null = null;
  private lightningTimer: Phaser.Time.TimerEvent | null = null;
  private shieldTimer: Phaser.Time.TimerEvent | null = null;
  private holyWaterTimer: Phaser.Time.TimerEvent | null = null;
  private axeTimer: Phaser.Time.TimerEvent | null = null;
  private beamTimer: Phaser.Time.TimerEvent | null = null;

  // Evolution weapon timers
  private baptismTimer: Phaser.Time.TimerEvent | null = null;
  private stormTimer: Phaser.Time.TimerEvent | null = null;
  private aegisTimer: Phaser.Time.TimerEvent | null = null;
  private vortexTimer: Phaser.Time.TimerEvent | null = null;

  // Orbit weapon visuals
  private orbitOrbs: Phaser.GameObjects.Arc[] = [];

  // Vortex evolved weapon visuals
  private vortexAxes: Phaser.GameObjects.Arc[] = [];

  // Power-ups
  private powerUps!: Phaser.GameObjects.Group;
  private lastEliteWave = 0;

  // XP orbs
  private xpOrbs!: Phaser.GameObjects.Group;
  private isMagnetActive = false;
  private magnetTimer: Phaser.Time.TimerEvent | null = null;
  private magnetSpawnTimer: Phaser.Time.TimerEvent | null = null;

  // XP bar HUD
  private xpBarBg!: Phaser.GameObjects.Rectangle;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private xpBarText!: Phaser.GameObjects.Text;

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

  // Kill combo tracking
  private comboCount = 0;
  private comboTimer: Phaser.Time.TimerEvent | null = null;
  private comboText: Phaser.GameObjects.Text | null = null;
  private bestCombo = 0;

  // Speed boost from XP bonus
  private speedBoostActive = false;
  private speedBoostTimer: Phaser.Time.TimerEvent | null = null;

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
    this.baptismTimer = null;
    this.stormTimer = null;
    this.aegisTimer = null;
    this.vortexTimer = null;
    this.comboCount = 0;
    this.comboTimer = null;
    this.comboText = null;
    this.bestCombo = 0;
    this.orbitOrbs = [];
    this.vortexAxes = [];
    this.isMagnetActive = false;
    this.magnetTimer = null;
    this.magnetSpawnTimer = null;
    this.speedBoostActive = false;
    this.speedBoostTimer = null;
    this.nextQuestionAt = QUESTION_INTERVAL_SEC;

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
    this.powerUps = this.add.group();
    this.xpOrbs = this.add.group();
    this.lastEliteWave = 0;

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

    // Collision: player collects power-up
    this.physics.add.overlap(
      this.player,
      this.powerUps,
      this.onCollectPowerUp as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
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

    // Magnet power-up spawns periodically
    this.magnetSpawnTimer = this.time.addEvent({
      delay: MAGNET_SPAWN_INTERVAL,
      callback: this.spawnMagnetPowerUp,
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

    // Update vortex evolved weapon
    this.updateVortexWeapon();

    // Collect nearby XP orbs
    if (!this.isShowingOverlay) {
      this.collectNearbyXpOrbs();
    }

    // Check if it's time for a question (based on game elapsed time, not wall clock)
    if (!this.isShowingOverlay && this.state.elapsedSeconds >= this.nextQuestionAt) {
      this.triggerQuestion();
    }

    // Move enemies toward player
    if (!this.isShowingOverlay) {
      const speedScale = this.state.enemySpeedMultiplier * (1 + this.waveNumber * 0.05);
      for (const enemy of this.enemies.getChildren()) {
        const go = enemy as Phaser.GameObjects.Arc;
        const body = go.body as Phaser.Physics.Arcade.Body;
        if (!body) continue;

        const angle = Phaser.Math.Angle.Between(go.x, go.y, this.player.x, this.player.y);
        const eliteMult = (go.getData("speedMult") as number) ?? 1;
        const speed = ENEMY_BASE_SPEED * speedScale * eliteMult;
        body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

        // Keep elite glow following
        const glow = go.getData("glow") as Phaser.GameObjects.Arc | undefined;
        if (glow && glow.active) { glow.x = go.x; glow.y = go.y; }
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
    const baseSpeed = 180;

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
        const speed = this.speedBoostActive ? baseSpeed * 1.5 : baseSpeed;
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
      const speed = this.speedBoostActive ? baseSpeed * 1.5 : baseSpeed;
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

    // Spawn count: start with 2-3 enemies per tick, scales with wave
    const count = Math.max(2, Math.round(2 + this.waveNumber * 0.2 + (this.state.enemySpawnMultiplier - 1) * 0.5));

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
      enemy.setData("hp", 1);
      enemy.setData("origColor", color);
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

  /** Deal 1 damage to an enemy. Returns true if enemy died. */
  private hitEnemy(enemy: Phaser.GameObjects.Arc): boolean {
    const hp = (enemy.getData("hp") as number) ?? 1;
    const isElite = enemy.getData("isElite") as boolean;
    if (hp > 1) {
      enemy.setData("hp", hp - 1);
      // Flash white briefly
      const origColor = enemy.getData("origColor") as number ?? 0xffffff;
      enemy.setFillStyle(0xffffff);
      this.time.delayedCall(80, () => {
        if (enemy.active) enemy.setFillStyle(origColor);
      });
      return false;
    }
    // Enemy dies — destroy glow if elite
    const glow = enemy.getData("glow") as Phaser.GameObjects.Arc | undefined;
    if (glow && glow.active) glow.destroy();

    this.spawnDeathParticles(enemy.x, enemy.y);
    if (isElite) {
      this.state = defeatElite(this.state);
      this.spawnPowerUp(enemy.x, enemy.y, true); // guaranteed drop
      this.spawnEliteDeathEffect(enemy.x, enemy.y);
      // Elites drop multiple XP orbs
      this.spawnXpOrbs(enemy.x, enemy.y, XP_ORB_ELITE_COUNT);
    } else {
      this.state = defeatEnemy(this.state);
      // Small chance to drop power-up
      if (Math.random() < POWERUP_DROP_CHANCE) {
        this.spawnPowerUp(enemy.x, enemy.y, false);
      }
      // XP orb drop
      if (Math.random() < XP_ORB_DROP_CHANCE) {
        this.spawnXpOrbs(enemy.x, enemy.y, 1);
      }
    }
    // Divine Aegis evolution: heal 1 HP on kill
    if (this.state.evolvedWeapons.includes("divine-aegis") && this.state.playerHp < this.state.maxHp) {
      this.state = healPlayer(this.state, 1);
    }
    enemy.destroy();
    this.trackCombo();
    this.updateHUD();
    return true;
  }

  /** Track rapid kills for combo counter. */
  private trackCombo(): void {
    this.comboCount++;
    if (this.comboCount > this.bestCombo) this.bestCombo = this.comboCount;

    // Reset combo timer — combo breaks after 2s of no kills
    if (this.comboTimer) this.comboTimer.remove();
    this.comboTimer = this.time.delayedCall(2000, () => {
      this.comboCount = 0;
      this.updateComboDisplay();
    });

    this.updateComboDisplay();
  }

  /** Show/update/hide the combo counter in the top-right corner. */
  private updateComboDisplay(): void {
    if (this.comboCount < 3) {
      if (this.comboText) {
        this.comboText.destroy();
        this.comboText = null;
      }
      return;
    }

    const { width } = this.scale;
    const label = `${this.comboCount}x`;
    const color = this.comboCount >= 10 ? "#ff2d78" : this.comboCount >= 5 ? "#ffd700" : "#00d4ff";

    if (!this.comboText) {
      this.comboText = this.add.text(width - 16, 70, label, {
        fontSize: "20px",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontStyle: "bold",
        color,
        stroke: "#000000",
        strokeThickness: 3,
      }).setOrigin(1, 0).setDepth(80);
    } else {
      this.comboText.setText(label);
      this.comboText.setColor(color);
    }

    // Pop animation on each increment
    this.tweens.add({
      targets: this.comboText,
      scaleX: 1.3, scaleY: 1.3,
      duration: 100,
      yoyo: true,
    });
  }

  private onProjectileHitEnemy(
    projectile: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void {
    if (!(enemy as Phaser.GameObjects.Arc).active) return;
    projectile.destroy();
    this.hitEnemy(enemy as Phaser.GameObjects.Arc);
  }

  private onAxeHitEnemy(
    _axe: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void {
    if (!(enemy as Phaser.GameObjects.Arc).active) return;
    this.hitEnemy(enemy as Phaser.GameObjects.Arc);
  }

  private onEnemyReachPlayer(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void {
    if (!(enemy as Phaser.GameObjects.Arc).active) return;
    const enemyGlow = (enemy as Phaser.GameObjects.Arc).getData("glow") as Phaser.GameObjects.Arc | undefined;
    if (enemyGlow && enemyGlow.active) enemyGlow.destroy();
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

  // ---- Elite enemies ----

  private spawnElite(): void {
    const { width, height } = this.scale;
    // Spawn from random edge
    const side = Phaser.Math.Between(0, 3);
    let ex: number, ey: number;
    switch (side) {
      case 0: ex = Phaser.Math.Between(0, width); ey = -20; break;
      case 1: ex = width + 20; ey = Phaser.Math.Between(0, height); break;
      case 2: ex = Phaser.Math.Between(0, width); ey = height + 20; break;
      default: ex = -20; ey = Phaser.Math.Between(0, height); break;
    }

    // Outer glow aura for elite
    const eliteGlow = this.add.circle(ex, ey, ELITE_RADIUS + 10, 0xffd700, 0.15);
    eliteGlow.setDepth(9);
    this.tweens.add({
      targets: eliteGlow,
      scaleX: 1.4, scaleY: 1.4, alpha: 0,
      duration: 1200, repeat: -1, yoyo: true, ease: "Sine.easeInOut",
    });

    const elite = this.add.circle(ex, ey, ELITE_RADIUS, ELITE_COLOR);
    elite.setStrokeStyle(3, 0xffffff);
    elite.setData("hp", ELITE_HP);
    elite.setData("isElite", true);
    elite.setData("origColor", ELITE_COLOR);
    elite.setData("speedMult", ELITE_SPEED_MULT);
    elite.setData("glow", eliteGlow);
    this.physics.add.existing(elite);
    (elite.body as Phaser.Physics.Arcade.Body).setCircle(ELITE_RADIUS);
    this.enemies.add(elite);

    // Pulsing size animation
    this.tweens.add({
      targets: elite,
      scaleX: 1.15, scaleY: 1.15,
      duration: 800, repeat: -1, yoyo: true, ease: "Sine.easeInOut",
    });

    // Announce
    const { width: w, height: h } = this.scale;
    const txt = this.add.text(w / 2, h / 2 - 40, "ELITE INCOMING!", {
      fontSize: "24px",
      color: "#ffd700",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 3,
    });
    txt.setOrigin(0.5);
    txt.setDepth(60);
    this.tweens.add({
      targets: txt,
      y: txt.y - 30,
      alpha: 0,
      duration: 1500,
      onComplete: () => txt.destroy(),
    });
  }

  private spawnEliteDeathEffect(x: number, y: number): void {
    // Big golden burst
    for (let i = 0; i < 12; i++) {
      const p = this.add.circle(
        x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-8, 8), 5, 0xffd700,
      );
      p.setDepth(40);
      this.tweens.add({
        targets: p,
        x: p.x + Phaser.Math.Between(-50, 50),
        y: p.y + Phaser.Math.Between(-50, 50),
        alpha: 0, scale: 0, duration: 500,
        onComplete: () => p.destroy(),
      });
    }

    const txt = this.add.text(x, y - 20, "+100", {
      fontSize: "18px",
      color: "#ffd700",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    txt.setOrigin(0.5);
    txt.setDepth(60);
    this.tweens.add({
      targets: txt, y: txt.y - 30, alpha: 0, duration: 800,
      onComplete: () => txt.destroy(),
    });
  }

  // ---- Power-ups ----

  private spawnPowerUp(x: number, y: number, guaranteed: boolean): void {
    // Pick type: health (green) or score (gold)
    const isHealth = guaranteed ? Math.random() < 0.5 : Math.random() < 0.5;
    const color = isHealth ? 0x43a047 : 0xffd700;
    const label = isHealth ? "\u2764" : "\u2B50";

    const pu = this.add.circle(x, y, 10, color, 0.9);
    pu.setStrokeStyle(2, 0xffffff);
    pu.setDepth(15);
    pu.setData("puType", isHealth ? "health" : "score");
    this.physics.add.existing(pu, true); // static body
    this.powerUps.add(pu);

    // Label
    const lbl = this.add.text(x, y, label, {
      fontSize: "12px",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    });
    lbl.setOrigin(0.5);
    lbl.setDepth(16);
    pu.setData("label", lbl);

    // Pulsing animation
    this.tweens.add({
      targets: pu,
      scaleX: 1.3, scaleY: 1.3,
      yoyo: true, repeat: -1, duration: 400,
    });

    // Auto-destroy after timeout
    this.time.delayedCall(POWERUP_LIFETIME, () => {
      if (pu.active) {
        (pu.getData("label") as Phaser.GameObjects.Text)?.destroy();
        pu.destroy();
      }
    });
  }

  private onCollectPowerUp(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    powerUp: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void {
    const pu = powerUp as Phaser.GameObjects.Arc;
    if (!pu.active) return;
    const puType = pu.getData("puType") as string;

    if (puType === "magnet") {
      this.activateMagnet();
    } else if (puType === "health") {
      this.state = healPlayer(this.state, 1);
      this.showPowerUpText(pu.x, pu.y, "+1 HP", "#43a047");
    } else {
      this.state = collectScorePowerUp(this.state);
      this.showPowerUpText(pu.x, pu.y, "+100", "#ffd700");
    }
    this.updateHUD();

    (pu.getData("label") as Phaser.GameObjects.Text)?.destroy();
    pu.destroy();
  }

  private showPowerUpText(x: number, y: number, message: string, color: string): void {
    const txt = this.add.text(x, y - 15, message, {
      fontSize: "14px", color,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontStyle: "bold",
    });
    txt.setOrigin(0.5);
    txt.setDepth(60);
    this.tweens.add({
      targets: txt, y: txt.y - 25, alpha: 0, duration: 800,
      onComplete: () => txt.destroy(),
    });
  }

  // ---- Question system ----

  private triggerQuestion(): void {
    if (this.isShowingOverlay || this.isComplete) return;
    if (!this.questionPool.hasMore()) {
      // Recycle questions — game only ends when player dies
      this.questionPool.reset();
    }

    this.currentQuestion = this.questionPool.next();
    if (!this.currentQuestion) return;

    // Prevent double-fire: push next question far out until resolved
    this.nextQuestionAt = Infinity;

    this.isShowingOverlay = true;
    this.waveNumber++;

    // Spawn elite every 5 waves
    if (this.waveNumber > 0 && this.waveNumber % 5 === 0 && this.waveNumber !== this.lastEliteWave) {
      this.lastEliteWave = this.waveNumber;
      // Spawn elite after question resolves (delayed)
      this.time.delayedCall(500, () => this.spawnElite());
    }

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

    // For true-false questions, only show 2 options (data may duplicate to 4)
    const isTrueFalse = question.format === "true-false" || question.options.length === 2;
    const options = isTrueFalse ? question.options.slice(0, 2) : question.options;

    const panelW = Math.min(width - 40, 600);
    const panelH = isTrueFalse ? 240 : 320;
    const panelBg = this.add.rectangle(width / 2, height / 2, panelW, panelH, 0x111128, 0.95);
    panelBg.setStrokeStyle(3, 0x00d4ff);
    container.add(panelBg);

    // Wave indicator
    const waveLabel = this.add.text(width / 2, height / 2 - panelH / 2 + 18, `Wave ${this.waveNumber}`, {
      fontSize: "13px", fontFamily: "sans-serif", color: "#00d4ff", fontStyle: "bold",
    }).setOrigin(0.5, 0);
    container.add(waveLabel);

    const qText = this.add.text(width / 2, height / 2 - panelH / 2 + 42, question.text, {
      fontSize: "18px", fontFamily: "sans-serif", color: "#f0f0ff", fontStyle: "bold",
      wordWrap: { width: panelW - 60 }, align: "center",
    }).setOrigin(0.5, 0);
    container.add(qText);

    if (isTrueFalse) {
      // Two wide buttons side by side
      const btnW = (panelW - 80) / 2;
      const btnH = 50;
      const btnY = height / 2 + 20;
      const gap = 20;
      const totalBtnW = btnW * 2 + gap;
      const startX = width / 2 - totalBtnW / 2 + btnW / 2;

      options.forEach((option, idx) => {
        const bx = startX + idx * (btnW + gap);
        const color = idx === 0 ? 0x43a047 : 0xe53935; // green for True, red for False

        const btn = this.add.rectangle(bx, btnY, btnW, btnH, color);
        btn.setStrokeStyle(2, 0x000000);
        btn.setInteractive({ useHandCursor: true });

        const label = this.add.text(bx, btnY, option, {
          fontSize: "18px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
        }).setOrigin(0.5);

        container.add(btn);
        container.add(label);

        btn.on("pointerdown", () => this.handleAnswer(idx === question.correctIndex, container));
      });
    } else {
      // Standard 2x2 grid for multiple choice
      const btnW = (panelW - 60) / 2 - 5;
      const btnH = 44;
      const btnStartY = height / 2 - 10;
      const btnStartX = width / 2 - (panelW - 60) / 4;

      options.forEach((option, idx) => {
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
    }

    this.questionPanel = container;
  }

  private handleAnswer(correct: boolean, container: Phaser.GameObjects.Container): void {
    this.state = answerQuestion(this.state, correct);
    this.updateHUD();

    const { width, height } = this.scale;

    if (correct) {
      const feedback = this.add.text(width / 2, height / 2 + 130, "Correct!", {
        fontSize: "28px", fontFamily: "sans-serif", color: "#00ff88", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5).setDepth(201);
      container.add(feedback);

      this.time.delayedCall(600, () => {
        container.destroy();
        this.questionPanel = null;
        this.showWeaponSelection();
      });
    } else {
      const feedback = this.add.text(width / 2, height / 2 + 130, "Wrong!", {
        fontSize: "28px", fontFamily: "sans-serif", color: "#ff4757", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5).setDepth(201);
      container.add(feedback);

      this.time.delayedCall(800, () => {
        container.destroy();
        this.questionPanel = null;
        this.isShowingOverlay = false;
        this.updateSpawnRate();
        this.nextQuestionAt = this.state.elapsedSeconds + QUESTION_INTERVAL_SEC;
      });
    }
  }

  // ---- Weapon selection (progressive, VS-style pick 1 of 3) ----

  private showWeaponSelection(): void {
    const choices = generateWeaponChoices(this.state);

    const { width, height } = this.scale;
    const container = this.add.container(0, 0).setDepth(200);

    const backdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);
    container.add(backdrop);

    // Check if there's an evolution available for dramatic title
    const hasEvolution = choices.some((c) => c.kind === "evolution");
    const titleText = hasEvolution ? "EVOLVE!" : "Choose a Power-Up!";
    const titleColor = hasEvolution ? "#ff6600" : "#FFD700";
    const title = this.add.text(width / 2, height * 0.18, titleText, {
      fontSize: hasEvolution ? "32px" : "28px", fontFamily: "sans-serif",
      color: titleColor, fontStyle: "bold",
      stroke: hasEvolution ? "#000000" : undefined,
      strokeThickness: hasEvolution ? 3 : 0,
    }).setOrigin(0.5);
    container.add(title);

    // Pulsing animation on EVOLVE title
    if (hasEvolution) {
      this.tweens.add({
        targets: title, scaleX: 1.1, scaleY: 1.1,
        duration: 400, yoyo: true, repeat: -1,
      });
    }

    const cardW = 180;
    const cardH = 200;
    const gap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
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

    choices.forEach((choice, idx) => {
      const cx = startX + idx * (cardW + gap);
      const cy = height * 0.5;

      if (choice.kind === "evolution") {
        // Evolution card — special golden/glowing style
        const recipe = choice.recipe;
        const evoColor = EVOLUTION_COLOR_MAP[recipe.id] ?? 0xff6600;

        // Glow behind card
        const glow = this.add.rectangle(cx, cy, cardW + 8, cardH + 8, evoColor, 0.3);
        glow.setDepth(199);
        container.add(glow);
        this.tweens.add({
          targets: glow, alpha: 0.1, scaleX: 1.05, scaleY: 1.05,
          duration: 600, yoyo: true, repeat: -1,
        });

        const card = this.add.rectangle(cx, cy, cardW, cardH, 0x1a1a2e, 0.95);
        card.setStrokeStyle(4, evoColor);
        card.setInteractive({ useHandCursor: true });
        container.add(card);

        // "EVOLVE!" badge
        const badge = this.add.text(cx, cy - 78, "EVOLVE!", {
          fontSize: "12px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
          backgroundColor: "#ff6600", padding: { x: 6, y: 2 },
        }).setOrigin(0.5);
        container.add(badge);

        // Icon
        container.add(this.add.text(cx, cy - 45, recipe.icon, { fontSize: "32px" }).setOrigin(0.5));

        // Name
        container.add(this.add.text(cx, cy - 5, recipe.name, {
          fontSize: "14px", fontFamily: "sans-serif", color: "#ffcc00", fontStyle: "bold",
          wordWrap: { width: cardW - 20 }, align: "center",
        }).setOrigin(0.5));

        // Ingredients
        const [a, b] = recipe.ingredients;
        const nameA = WEAPON_OPTIONS.find((w) => w.type === a)?.name ?? a;
        const nameB = WEAPON_OPTIONS.find((w) => w.type === b)?.name ?? b;
        container.add(this.add.text(cx, cy + 22, `${nameA} + ${nameB}`, {
          fontSize: "10px", fontFamily: "sans-serif", color: "#aaaaaa",
        }).setOrigin(0.5));

        // Description
        container.add(this.add.text(cx, cy + 50, recipe.description, {
          fontSize: "10px", fontFamily: "sans-serif", color: "#cccccc",
          wordWrap: { width: cardW - 20 }, align: "center",
        }).setOrigin(0.5));

        card.on("pointerdown", () => this.selectEvolution(recipe.id, container));

      } else if (choice.kind === "weapon") {
        const weapon = choice.weapon;
        const currentLevel = choice.currentLevel;

        const card = this.add.rectangle(cx, cy, cardW, cardH, 0x2a2a3a, 0.95);
        card.setStrokeStyle(3, WEAPON_COLOR_MAP[weapon.type] ?? 0xffffff);
        card.setInteractive({ useHandCursor: true });
        container.add(card);

        // Icon
        container.add(this.add.text(cx, cy - 60, WEAPON_ICON_MAP[weapon.type] ?? "\u{2694}", { fontSize: "32px" }).setOrigin(0.5));

        // Name
        container.add(this.add.text(cx, cy - 15, weapon.name, {
          fontSize: "16px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
        }).setOrigin(0.5));

        // Level indicator
        const levelStr = currentLevel === 0 ? "NEW!" : `Lv ${currentLevel} \u2192 ${currentLevel + 1}`;
        const levelColor = currentLevel === 0 ? "#00ff88" : "#ffd700";
        container.add(this.add.text(cx, cy + 12, levelStr, {
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

      } else {
        // max-hp choice
        const card = this.add.rectangle(cx, cy, cardW, cardH, 0x2a2a3a, 0.95);
        card.setStrokeStyle(3, 0xe53935);
        card.setInteractive({ useHandCursor: true });
        container.add(card);

        container.add(this.add.text(cx, cy - 60, "\u{2764}\u{FE0F}", { fontSize: "32px" }).setOrigin(0.5));
        container.add(this.add.text(cx, cy - 15, "+1 Max Health", {
          fontSize: "16px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
        }).setOrigin(0.5));
        container.add(this.add.text(cx, cy + 12, `HP: ${this.state.maxHp} \u2192 ${this.state.maxHp + 1}`, {
          fontSize: "14px", fontFamily: "sans-serif", color: "#00ff88", fontStyle: "bold",
        }).setOrigin(0.5));
        container.add(this.add.text(cx, cy + 45, "Increases max HP and heals 1", {
          fontSize: "11px", fontFamily: "sans-serif", color: "#cccccc",
        }).setOrigin(0.5));

        card.on("pointerdown", () => {
          this.state = boostMaxHp(this.state);
          this.dismissWeaponPanel(container);
        });
      }
    });

    this.weaponPanel = container;
  }

  private selectWeapon(weapon: WeaponUpgrade, container: Phaser.GameObjects.Container): void {
    this.state = addWeapon(this.state, weapon);

    // Restart the passive timer for this weapon at new level
    this.setupPassiveWeapon(weapon.type);

    this.dismissWeaponPanel(container);
  }

  private selectEvolution(recipeId: EvolvedWeaponType, container: Phaser.GameObjects.Container): void {
    const result = evolveWeapon(this.state, recipeId);
    if (!result) return; // safety check

    this.state = result;

    // Stop the passive timers for the consumed weapons
    const recipe = EVOLUTION_RECIPES.find((r) => r.id === recipeId);
    if (recipe) {
      for (const ingredient of recipe.ingredients) {
        this.stopPassiveWeapon(ingredient);
      }
    }

    // Set up the evolved weapon effect
    this.setupEvolvedWeapon(recipeId);

    // Big evolution announcement
    this.showEvolutionAnnouncement(recipeId);

    this.dismissWeaponPanel(container);
  }

  /** Common cleanup after picking a weapon/evolution/max-hp */
  private dismissWeaponPanel(container: Phaser.GameObjects.Container): void {
    container.destroy();
    this.weaponPanel = null;
    this.isShowingOverlay = false;
    this.updateHUD();
    this.updateSpawnRate();
    this.nextQuestionAt = this.state.elapsedSeconds + QUESTION_INTERVAL_SEC;
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
    const isMax = level >= MAX_WEAPON_LEVEL;

    // Visual ring — enhanced at max level
    const ring = this.add.circle(this.player.x, this.player.y, radius, isMax ? 0xff3300 : 0xff5722, isMax ? 0.25 : 0.15);
    ring.setStrokeStyle(isMax ? 5 : 3, isMax ? 0xffcc00 : 0xff5722);
    ring.setDepth(15);

    // Max level: second shockwave ring
    if (isMax) {
      const ring2 = this.add.circle(this.player.x, this.player.y, radius * 0.6, 0xff8800, 0.12);
      ring2.setStrokeStyle(2, 0xff5500);
      ring2.setDepth(14);
      this.tweens.add({
        targets: ring2, alpha: 0, scale: 2, duration: 600,
        onComplete: () => ring2.destroy(),
      });
    }

    const toDestroy: Phaser.GameObjects.Arc[] = [];
    for (const enemy of this.enemies.getChildren()) {
      const go = enemy as Phaser.GameObjects.Arc;
      if (!go.active) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, go.x, go.y);
      if (dist <= radius) toDestroy.push(go);
    }
    for (const go of toDestroy) {
      this.hitEnemy(go);
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

    const isMaxLightning = level >= MAX_WEAPON_LEVEL;
    const gfx = this.add.graphics();

    // Max level: draw glow layer first
    if (isMaxLightning) {
      gfx.lineStyle(8, 0xffee58, 0.3);
      let gx = this.player.x, gy = this.player.y;
      for (const { go } of targets) {
        gfx.lineBetween(gx, gy, go.x, go.y);
        gx = go.x; gy = go.y;
      }
    }

    gfx.lineStyle(isMaxLightning ? 4 : 2, 0xffee58, 1);
    let prevX = this.player.x, prevY = this.player.y;
    for (const { go } of targets) {
      gfx.lineBetween(prevX, prevY, go.x, go.y);
      prevX = go.x; prevY = go.y;
      this.hitEnemy(go);
    }
    this.updateHUD();

    this.tweens.add({
      targets: gfx, alpha: 0, duration: isMaxLightning ? 600 : 400, onComplete: () => gfx.destroy(),
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
    const isMaxOrbit = level >= MAX_WEAPON_LEVEL;
    for (let i = 0; i < count; i++) {
      const orbSize = isMaxOrbit ? ORBIT_ORB_SIZE + 3 : ORBIT_ORB_SIZE;
      const orb = this.add.circle(this.player.x, this.player.y, orbSize, isMaxOrbit ? 0xce93d8 : 0xba68c8);
      orb.setStrokeStyle(isMaxOrbit ? 3 : 2, isMaxOrbit ? 0xaa00ff : 0x7b1fa2);
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
      this.hitEnemy(go);
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
            this.hitEnemy(go);
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
      this.hitEnemy(go);
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
    const waveScale = 1 + this.waveNumber * 0.09;
    const newDelay = Math.max(400, BASE_SPAWN_INTERVAL / (waveScale * this.state.enemySpawnMultiplier));
    this.spawnTimer.reset({
      delay: newDelay,
      callback: this.spawnEnemy,
      callbackScope: this,
      loop: true,
    });
  }

  // ---- XP Orbs ----

  private spawnXpOrbs(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const color = XP_ORB_COLORS[Phaser.Math.Between(0, XP_ORB_COLORS.length - 1)];
      const orb = this.add.circle(
        x + Phaser.Math.Between(-12, 12),
        y + Phaser.Math.Between(-12, 12),
        XP_ORB_RADIUS, color, 0.9,
      );
      orb.setStrokeStyle(1, 0xffffff, 0.4);
      orb.setDepth(12);
      this.physics.add.existing(orb, true);
      this.xpOrbs.add(orb);

      // Add a subtle glow effect
      const glow = this.add.circle(orb.x, orb.y, XP_ORB_RADIUS + 3, color, 0.15);
      glow.setDepth(11);
      orb.setData("glow", glow);

      // Gentle floating animation
      this.tweens.add({
        targets: [orb, glow],
        y: orb.y + Phaser.Math.Between(-6, 6),
        duration: 800 + Phaser.Math.Between(0, 400),
        yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });

      // Auto-destroy after 12 seconds
      this.time.delayedCall(12000, () => {
        if (orb.active) {
          const g = orb.getData("glow") as Phaser.GameObjects.Arc | undefined;
          if (g && g.active) g.destroy();
          orb.destroy();
        }
      });
    }
  }

  private collectNearbyXpOrbs(): void {
    // Vacuum: 25% of screen pulls orbs in; magnet is screen-wide
    const screenVacuumRadius = Math.min(this.scale.width, this.scale.height) * 0.25;
    const pickupRadius = this.isMagnetActive ? XP_ORB_MAGNET_RADIUS : screenVacuumRadius;

    // Use player center for pull origin
    const playerCenterX = this.player.x;
    const playerCenterY = this.player.y;

    for (const orbGo of this.xpOrbs.getChildren()) {
      const orb = orbGo as Phaser.GameObjects.Arc;
      if (!orb.active) continue;

      const dist = Phaser.Math.Distance.Between(playerCenterX, playerCenterY, orb.x, orb.y);

      if (dist <= pickupRadius) {
        // Attract orb toward player center
        const angle = Phaser.Math.Angle.Between(orb.x, orb.y, playerCenterX, playerCenterY);
        const attractSpeed = this.isMagnetActive ? XP_ORB_SPEED * 2 : XP_ORB_SPEED;
        const dx = Math.cos(angle) * attractSpeed * (1 / 60); // approximate per-frame
        const dy = Math.sin(angle) * attractSpeed * (1 / 60);
        orb.x += dx;
        orb.y += dy;

        // Update glow position
        const glow = orb.getData("glow") as Phaser.GameObjects.Arc | undefined;
        if (glow && glow.active) { glow.x = orb.x; glow.y = orb.y; }

        // Actually collect when very close
        if (dist <= 20) {
          // Collect the orb
          const result = collectXpOrb(this.state);
          this.state = result.state;

          if (glow && glow.active) glow.destroy();
          orb.destroy();

          // Update XP bar visual
          this.updateXpBar();

          // Check if bar is full
          if (result.barFull) {
            this.triggerXpBonus();
          }
        }
      }
    }
  }

  private triggerXpBonus(): void {
    const result = activateXpBonus(this.state);
    this.state = result.state;
    this.updateXpBar();
    this.updateHUD();

    const { width, height } = this.scale;
    let bonusMsg = "";
    let bonusColor = "#ffffff";

    switch (result.bonus) {
      case "score":
        bonusMsg = "+300 Score!";
        bonusColor = "#ffd700";
        break;
      case "speed":
        bonusMsg = "Speed Boost!";
        bonusColor = "#00e5ff";
        this.activateSpeedBoost();
        break;
      case "weapon-charge":
        bonusMsg = "Weapon Surge!";
        bonusColor = "#ff4081";
        this.triggerAllWeapons();
        break;
    }

    // Show bonus text
    const txt = this.add.text(width / 2, height * 0.35, bonusMsg, {
      fontSize: "24px", fontFamily: "sans-serif", color: bonusColor, fontStyle: "bold",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100);
    this.tweens.add({
      targets: txt, y: txt.y - 40, alpha: 0, scale: 1.3, duration: 1200,
      onComplete: () => txt.destroy(),
    });

    // Flash effect
    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.15);
    flash.setDepth(90);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 300,
      onComplete: () => flash.destroy(),
    });
  }

  private activateSpeedBoost(): void {
    this.speedBoostActive = true;
    // Increase player movement speed temporarily
    if (this.speedBoostTimer) this.speedBoostTimer.remove();
    this.speedBoostTimer = this.time.delayedCall(5000, () => {
      this.speedBoostActive = false;
    });

    // Visual indicator on player
    const aura = this.add.circle(this.player.x, this.player.y, 24, 0x00e5ff, 0.3);
    aura.setDepth(45);
    const updateAura = () => {
      if (this.speedBoostActive && aura.active) {
        aura.x = this.player.x;
        aura.y = this.player.y;
      } else if (aura.active) {
        aura.destroy();
      }
    };
    this.events.on("update", updateAura);
    this.time.delayedCall(5100, () => {
      this.events.off("update", updateAura);
      if (aura.active) aura.destroy();
    });
  }

  private triggerAllWeapons(): void {
    // Fire all owned weapons once immediately
    for (const w of this.state.weapons) {
      const level = w.level;
      switch (w.type) {
        case "fire-ring": this.passiveFireRing(level); break;
        case "lightning": this.passiveLightning(level); break;
        case "holy-water": this.passiveHolyWater(level); break;
        case "axe": this.passiveAxe(level); break;
        case "beam": this.passiveBeam(level); break;
      }
    }
    // Also fire evolved weapons
    for (const evo of this.state.evolvedWeapons) {
      switch (evo) {
        case "baptism-of-fire": this.passiveBaptismOfFire(); break;
        case "storm-of-judgment": this.passiveStormOfJudgment(); break;
      }
    }
  }

  // ---- Magnet power-up ----

  private spawnMagnetPowerUp(): void {
    if (this.isShowingOverlay || this.isComplete) return;
    const { width, height } = this.scale;

    // Spawn at a random position on the field
    const mx = Phaser.Math.Between(60, width - 60);
    const my = Phaser.Math.Between(60, height - 60);

    const magnet = this.add.circle(mx, my, 12, MAGNET_COLOR, 0.9);
    magnet.setStrokeStyle(2, 0xffffff);
    magnet.setDepth(16);
    magnet.setData("puType", "magnet");
    this.physics.add.existing(magnet, true);
    this.powerUps.add(magnet);

    // "U" magnet icon
    const lbl = this.add.text(mx, my, "\u{1F9F2}", { fontSize: "14px" });
    lbl.setOrigin(0.5);
    lbl.setDepth(17);
    magnet.setData("label", lbl);

    // Pulsing glow
    this.tweens.add({
      targets: magnet, scaleX: 1.3, scaleY: 1.3,
      yoyo: true, repeat: -1, duration: 600,
    });

    // Auto-destroy after timeout
    this.time.delayedCall(POWERUP_LIFETIME * 2, () => {
      if (magnet.active) {
        (magnet.getData("label") as Phaser.GameObjects.Text)?.destroy();
        magnet.destroy();
      }
    });
  }

  private activateMagnet(): void {
    this.isMagnetActive = true;
    if (this.magnetTimer) this.magnetTimer.remove();
    this.magnetTimer = this.time.delayedCall(MAGNET_DURATION, () => {
      this.isMagnetActive = false;
    });

    // Visual: briefly flash screen with magnet color
    const { width, height } = this.scale;
    const flash = this.add.rectangle(width / 2, height / 2, width, height, MAGNET_COLOR, 0.1);
    flash.setDepth(90);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 500,
      onComplete: () => flash.destroy(),
    });

    this.showPowerUpText(this.player.x, this.player.y, "MAGNET!", "#ff4081");
  }

  // ---- Evolution weapon effects ----

  private stopPassiveWeapon(type: WeaponType): void {
    switch (type) {
      case "fire-ring":
        if (this.fireRingTimer) { this.fireRingTimer.remove(); this.fireRingTimer = null; }
        break;
      case "lightning":
        if (this.lightningTimer) { this.lightningTimer.remove(); this.lightningTimer = null; }
        break;
      case "shield":
        if (this.shieldTimer) { this.shieldTimer.remove(); this.shieldTimer = null; }
        break;
      case "orbit":
        for (const orb of this.orbitOrbs) { if (orb && orb.active) orb.destroy(); }
        this.orbitOrbs = [];
        break;
      case "holy-water":
        if (this.holyWaterTimer) { this.holyWaterTimer.remove(); this.holyWaterTimer = null; }
        break;
      case "axe":
        if (this.axeTimer) { this.axeTimer.remove(); this.axeTimer = null; }
        break;
      case "beam":
        if (this.beamTimer) { this.beamTimer.remove(); this.beamTimer = null; }
        break;
    }
  }

  private setupEvolvedWeapon(id: EvolvedWeaponType): void {
    switch (id) {
      case "baptism-of-fire": {
        if (this.baptismTimer) this.baptismTimer.remove();
        this.baptismTimer = this.time.addEvent({
          delay: EVOLVED_BAPTISM_INTERVAL,
          callback: () => this.passiveBaptismOfFire(),
          callbackScope: this,
          loop: true,
        });
        break;
      }
      case "storm-of-judgment": {
        if (this.stormTimer) this.stormTimer.remove();
        this.stormTimer = this.time.addEvent({
          delay: EVOLVED_STORM_INTERVAL,
          callback: () => this.passiveStormOfJudgment(),
          callbackScope: this,
          loop: true,
        });
        break;
      }
      case "divine-aegis": {
        if (this.aegisTimer) this.aegisTimer.remove();
        this.aegisTimer = this.time.addEvent({
          delay: EVOLVED_AEGIS_REGEN_INTERVAL,
          callback: () => this.passiveDivineAegis(),
          callbackScope: this,
          loop: true,
        });
        break;
      }
      case "celestial-vortex": {
        if (this.vortexTimer) this.vortexTimer.remove();
        this.setupVortexWeapon();
        this.vortexTimer = this.time.addEvent({
          delay: EVOLVED_VORTEX_INTERVAL,
          callback: () => this.passiveCelestialVortex(),
          callbackScope: this,
          loop: true,
        });
        break;
      }
    }
  }

  private showEvolutionAnnouncement(id: EvolvedWeaponType): void {
    const recipe = EVOLUTION_RECIPES.find((r) => r.id === id);
    if (!recipe) return;

    const { width, height } = this.scale;
    const color = EVOLUTION_COLOR_MAP[id] ?? 0xff6600;

    // Full-screen flash
    const flash = this.add.rectangle(width / 2, height / 2, width, height, color, 0.25);
    flash.setDepth(250);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 800,
      onComplete: () => flash.destroy(),
    });

    // Big announcement text
    const txt = this.add.text(width / 2, height * 0.3, `${recipe.icon} ${recipe.name}!`, {
      fontSize: "30px", fontFamily: "sans-serif", color: "#ffffff", fontStyle: "bold",
      stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(260);

    this.tweens.add({
      targets: txt, y: txt.y - 40, alpha: 0, scale: 1.5, duration: 2000,
      onComplete: () => txt.destroy(),
    });
  }

  // ---- Evolved weapon passive effects ----

  /** Baptism of Fire: massive AoE explosion covering huge radius */
  private passiveBaptismOfFire(): void {
    if (this.isShowingOverlay || this.isComplete) return;
    const { width, height } = this.scale;
    const radius = Math.max(width, height) * 0.6;

    // Visual: expanding fire + water rings
    const ring1 = this.add.circle(this.player.x, this.player.y, radius * 0.3, 0xff3300, 0.3);
    ring1.setStrokeStyle(6, 0xff6600);
    ring1.setDepth(20);
    const ring2 = this.add.circle(this.player.x, this.player.y, radius * 0.15, 0x4fc3f7, 0.2);
    ring2.setStrokeStyle(4, 0x0288d1);
    ring2.setDepth(19);

    this.tweens.add({
      targets: ring1, alpha: 0, scaleX: 3, scaleY: 3, duration: 800,
      onComplete: () => ring1.destroy(),
    });
    this.tweens.add({
      targets: ring2, alpha: 0, scaleX: 4, scaleY: 4, duration: 600,
      onComplete: () => ring2.destroy(),
    });

    // Damage all enemies in radius
    const toDestroy: Phaser.GameObjects.Arc[] = [];
    for (const enemy of this.enemies.getChildren()) {
      const go = enemy as Phaser.GameObjects.Arc;
      if (!go.active) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, go.x, go.y);
      if (dist <= radius) toDestroy.push(go);
    }
    for (const go of toDestroy) {
      this.hitEnemy(go);
    }
    if (toDestroy.length > 0) this.updateHUD();
  }

  /** Storm of Judgment: lightning chains to ALL enemies + beam strikes */
  private passiveStormOfJudgment(): void {
    if (this.isShowingOverlay || this.isComplete) return;

    const targets: Phaser.GameObjects.Arc[] = [];
    for (const enemy of this.enemies.getChildren()) {
      const go = enemy as Phaser.GameObjects.Arc;
      if (go.active) targets.push(go);
    }

    if (targets.length === 0) return;

    // Draw lightning chains to all enemies
    const gfx = this.add.graphics();
    gfx.lineStyle(6, 0xffee58, 0.5);
    for (const go of targets) {
      gfx.lineBetween(this.player.x, this.player.y, go.x, go.y);
    }
    gfx.lineStyle(3, 0xffffff, 1);
    for (const go of targets) {
      gfx.lineBetween(this.player.x, this.player.y, go.x, go.y);
    }
    gfx.setDepth(60);

    // Damage all
    for (const go of targets) {
      this.hitEnemy(go);
    }
    if (targets.length > 0) this.updateHUD();

    this.tweens.add({
      targets: gfx, alpha: 0, duration: 800,
      onComplete: () => gfx.destroy(),
    });
  }

  /** Divine Aegis: regenerate HP + reflect damage aura */
  private passiveDivineAegis(): void {
    if (this.isShowingOverlay || this.isComplete) return;

    // Regen HP
    if (this.state.playerHp < this.state.maxHp) {
      this.state = healPlayer(this.state, 2);
      this.updateHUD();
    }

    // Visual shield aura
    const aura = this.add.circle(this.player.x, this.player.y, 30, 0x00e5ff, 0.2);
    aura.setStrokeStyle(3, 0x00e5ff);
    aura.setDepth(45);
    this.tweens.add({
      targets: aura, alpha: 0, scale: 2, duration: 600,
      onComplete: () => aura.destroy(),
    });

    // Damage nearby enemies (reflect aura)
    const reflectRadius = 100;
    const toDestroy: Phaser.GameObjects.Arc[] = [];
    for (const enemy of this.enemies.getChildren()) {
      const go = enemy as Phaser.GameObjects.Arc;
      if (!go.active) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, go.x, go.y);
      if (dist <= reflectRadius) toDestroy.push(go);
    }
    for (const go of toDestroy) {
      this.hitEnemy(go);
    }
    if (toDestroy.length > 0) this.updateHUD();
  }

  /** Celestial Vortex: sets up orbiting axes */
  private setupVortexWeapon(): void {
    for (const axe of this.vortexAxes) {
      if (axe && axe.active) axe.destroy();
    }
    this.vortexAxes = [];

    const count = 6;
    for (let i = 0; i < count; i++) {
      const axe = this.add.circle(this.player.x, this.player.y, 12, 0xff8a65);
      axe.setStrokeStyle(3, 0xd500f9);
      axe.setDepth(50);
      this.vortexAxes.push(axe);
    }
  }

  private updateVortexWeapon(): void {
    if (!this.state.evolvedWeapons.includes("celestial-vortex") || this.vortexAxes.length === 0) return;

    const count = this.vortexAxes.length;
    const time = this.time.now / 1000;
    const baseRadius = 120;
    // Expanding spiral effect
    const pulseRadius = baseRadius + Math.sin(time * 1.5) * 40;

    for (let i = 0; i < count; i++) {
      const axe = this.vortexAxes[i];
      if (!axe || !axe.active) continue;
      const angle = time * 3 + (i / count) * Math.PI * 2;
      axe.x = this.player.x + Math.cos(angle) * pulseRadius;
      axe.y = this.player.y + Math.sin(angle) * pulseRadius;
    }

    // Collision check
    if (this.isShowingOverlay || this.isComplete) return;

    const toDestroy: Phaser.GameObjects.Arc[] = [];
    for (const enemy of this.enemies.getChildren()) {
      const go = enemy as Phaser.GameObjects.Arc;
      if (!go.active) continue;
      for (const axe of this.vortexAxes) {
        if (!axe || !axe.active) continue;
        const dist = Phaser.Math.Distance.Between(axe.x, axe.y, go.x, go.y);
        if (dist <= 25) {
          toDestroy.push(go);
          break;
        }
      }
    }
    for (const go of toDestroy) {
      this.hitEnemy(go);
    }
    if (toDestroy.length > 0) this.updateHUD();
  }

  /** Celestial Vortex periodic: expand radius briefly and damage in range */
  private passiveCelestialVortex(): void {
    if (this.isShowingOverlay || this.isComplete) return;

    // Visual expansion burst
    const burst = this.add.circle(this.player.x, this.player.y, 120, 0xd500f9, 0.15);
    burst.setStrokeStyle(3, 0xd500f9);
    burst.setDepth(20);
    this.tweens.add({
      targets: burst, alpha: 0, scale: 2.5, duration: 600,
      onComplete: () => burst.destroy(),
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
    this.elapsedTimer.remove();
    if (this.fireRingTimer) this.fireRingTimer.remove();
    if (this.lightningTimer) this.lightningTimer.remove();
    if (this.shieldTimer) this.shieldTimer.remove();
    if (this.holyWaterTimer) this.holyWaterTimer.remove();
    if (this.axeTimer) this.axeTimer.remove();
    if (this.beamTimer) this.beamTimer.remove();
    if (this.baptismTimer) this.baptismTimer.remove();
    if (this.stormTimer) this.stormTimer.remove();
    if (this.aegisTimer) this.aegisTimer.remove();
    if (this.vortexTimer) this.vortexTimer.remove();
    if (this.magnetSpawnTimer) this.magnetSpawnTimer.remove();
    if (this.magnetTimer) this.magnetTimer.remove();
    if (this.speedBoostTimer) this.speedBoostTimer.remove();

    // Clean up orbit orbs
    for (const orb of this.orbitOrbs) {
      if (orb && orb.active) orb.destroy();
    }
    this.orbitOrbs = [];

    // Clean up vortex axes
    for (const axe of this.vortexAxes) {
      if (axe && axe.active) axe.destroy();
    }
    this.vortexAxes = [];

    // Clean up XP orbs
    for (const orbGo of this.xpOrbs.getChildren()) {
      const orb = orbGo as Phaser.GameObjects.Arc;
      const glow = orb.getData("glow") as Phaser.GameObjects.Arc | undefined;
      if (glow && glow.active) glow.destroy();
    }
    this.xpOrbs.clear(true, true);

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
    saveScore("survivors", stars);
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
    const weaponParts = this.state.weapons.map((w) => {
      const name = WEAPON_OPTIONS.find((o) => o.type === w.type)?.name ?? w.type;
      return `${name} Lv${w.level}`;
    });
    const evoParts = this.state.evolvedWeapons.map((evoId) => {
      const recipe = EVOLUTION_RECIPES.find((r) => r.id === evoId);
      return recipe ? recipe.name : evoId;
    });
    const weaponSummary = [...weaponParts, ...evoParts].join(", ") || "None";

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

    // XP bar at bottom of screen
    const { height } = this.scale;
    const barW = width - 30;
    const barH = 10;
    const barY = height - 20;
    this.xpBarBg = this.add.rectangle(width / 2, barY, barW, barH, 0x333333, 0.7);
    this.xpBarBg.setStrokeStyle(1, 0x555555);
    this.xpBarBg.setScrollFactor(0).setDepth(100);

    this.xpBarFill = this.add.rectangle(15, barY, 0, barH, 0x7c4dff, 0.9);
    this.xpBarFill.setOrigin(0, 0.5);
    this.xpBarFill.setScrollFactor(0).setDepth(101);

    this.xpBarText = this.add.text(width / 2, barY, "Faith Orbs", {
      fontSize: "8px", fontFamily: "sans-serif", color: "#ffffff",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102);
  }

  private updateHUD(): void {
    this.scoreText?.setText(`Score: ${this.state.score}`);
    this.hpText?.setText(`HP: ${this.state.playerHp} / ${this.state.maxHp}`);

    const minutes = Math.floor(this.state.elapsedSeconds / 60);
    const seconds = this.state.elapsedSeconds % 60;
    this.timerText?.setText(`${minutes}:${seconds.toString().padStart(2, "0")}`);

    this.enemyCountText?.setText(`Enemies: ${this.state.enemiesDefeated}`);

    // Weapon HUD
    const parts: string[] = [];
    if (this.state.weapons.length > 0) {
      parts.push(...this.state.weapons.map((w) => {
        return `${WEAPON_ICON_MAP[w.type] ?? ""}Lv${w.level}`;
      }));
    }
    if (this.state.evolvedWeapons.length > 0) {
      for (const evoId of this.state.evolvedWeapons) {
        const recipe = EVOLUTION_RECIPES.find((r) => r.id === evoId);
        if (recipe) parts.push(`${recipe.icon}`);
      }
    }
    if (parts.length > 0) {
      this.weaponHudText?.setText(parts.join(" "));
    }
  }

  private updateXpBar(): void {
    const progress = getXpBarProgress(this.state);
    const { width } = this.scale;
    const barW = width - 30;
    const fillW = barW * progress;
    if (this.xpBarFill) {
      this.xpBarFill.width = fillW;
    }
    if (this.xpBarText) {
      this.xpBarText.setText(`Faith Orbs: ${this.state.xpOrbs}/${this.state.xpOrbsToNext}`);
    }
  }
}
