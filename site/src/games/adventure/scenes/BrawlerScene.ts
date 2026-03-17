import Phaser from "phaser";
import type { LessonConfig, Question } from "@/types/lesson";
import { filterByDifficulty } from "@/lib/difficulty";
import {
  createInitialState,
  answerQuestion,
  calculateStars,
  isGameComplete,
  isGameOver,
  type BrawlerState,
} from "../logic/brawler-logic";

/** How far the player walks between waves. */
const WALK_DISTANCE = 200;
/** Player walk speed in px/s during auto-walk. */
const WALK_SPEED = 120;
/** Width of the game. */
const GAME_WIDTH = 800;
/** Height of the game. */
const GAME_HEIGHT = 600;
/** Ground Y position. */
const GROUND_Y = 480;
/** Player X home position (left side). */
const PLAYER_X = 160;
/** Enemy spawn X. */
const ENEMY_SPAWN_X = 750;
/** Enemy stop X (where they line up). */
const ENEMY_STOP_X = 550;

/** Answer button colors. */
const BTN_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00];
const BTN_LABELS = ["A", "B", "C", "D"];

/** Power-up glow colors. */
const POWER_FIRE_COLOR = 0xff8c00;
const POWER_LIGHTNING_COLOR = 0x42a5f5;

export class BrawlerScene extends Phaser.Scene {
  // State
  private state!: BrawlerState;
  private filteredQuestions: Question[] = [];

  // Phase management
  private phase:
    | "walking"
    | "enemies-entering"
    | "question"
    | "attack"
    | "damage"
    | "boss-intro"
    | "complete"
    | "gameover" = "walking";

  // Player visuals
  private player!: Phaser.GameObjects.Rectangle;
  private playerGlow: Phaser.GameObjects.Arc | null = null;

  // Background layers
  private bgBuildings: Phaser.GameObjects.Rectangle[] = [];
  private bgScroll = 0;

  // Enemies for current wave
  private enemies: Phaser.GameObjects.Rectangle[] = [];
  private bossEnemy: Phaser.GameObjects.Rectangle | null = null;

  // UI
  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private questionPanel: Phaser.GameObjects.Container | null = null;

  // Walk tracking
  private walkTarget = 0;
  private worldOffset = 0;

  constructor() {
    super({ key: "BrawlerScene" });
  }

  create(): void {
    const lesson = this.registry.get("lesson") as LessonConfig;
    const difficulty = this.registry.get("difficulty") as string;
    const character = this.registry.get("character") as
      | { name: string; color: number }
      | undefined;
    const characterColor = character?.color ?? 0x1e88e5;

    // Filter questions
    this.filteredQuestions = filterByDifficulty(
      lesson.questions,
      difficulty as "little-kids" | "big-kids",
    );

    if (this.filteredQuestions.length === 0) {
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "No questions available!", {
          fontSize: "24px",
          fontFamily: "sans-serif",
          color: "#ffffff",
        })
        .setOrigin(0.5);
      return;
    }

    // Total waves = number of questions (last one is boss)
    const totalWaves = this.filteredQuestions.length;
    this.state = createInitialState(totalWaves);
    this.phase = "walking";
    this.worldOffset = 0;
    this.enemies = [];
    this.bossEnemy = null;
    this.questionPanel = null;
    this.playerGlow = null;

    // Dark background
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // Build scrolling city/dungeon background
    this.createBackground();

    // Ground
    this.add.rectangle(GAME_WIDTH / 2, GROUND_Y + 30, GAME_WIDTH, 60, 0x2d2d44);
    this.add.rectangle(GAME_WIDTH / 2, GROUND_Y, GAME_WIDTH, 4, 0x4a4a6a);

    // Player
    this.player = this.add.rectangle(
      PLAYER_X,
      GROUND_Y - 30,
      36,
      56,
      characterColor,
    );
    this.player.setStrokeStyle(2, 0xffffff);

    // Player "face" (small detail)
    this.add
      .text(PLAYER_X, GROUND_Y - 38, character?.name?.[0] ?? "H", {
        fontSize: "20px",
        fontFamily: "sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // HUD
    this.createHUD();

    // Start walking to first wave
    this.startWalking();
  }

  update(_time: number, delta: number): void {
    if (this.phase === "walking") {
      this.updateWalking(delta);
    }

    // Parallax background scroll
    this.updateBackground();
  }

  // ---- Background ----

  private createBackground(): void {
    this.bgBuildings = [];
    // Create silhouette buildings across the screen
    for (let i = 0; i < 12; i++) {
      const bw = 40 + Phaser.Math.Between(20, 60);
      const bh = 80 + Phaser.Math.Between(20, 120);
      const bx = i * 80;
      const building = this.add.rectangle(
        bx,
        GROUND_Y - bh / 2,
        bw,
        bh,
        0x16213e,
      );
      building.setAlpha(0.6);
      this.bgBuildings.push(building);

      // Windows
      for (let wy = 0; wy < Math.floor(bh / 30); wy++) {
        for (let wx = 0; wx < Math.floor(bw / 18); wx++) {
          const winX = bx - bw / 2 + 10 + wx * 16;
          const winY = GROUND_Y - bh + 15 + wy * 28;
          const lit = Math.random() > 0.4;
          const win = this.add.rectangle(
            winX,
            winY,
            8,
            10,
            lit ? 0xffc107 : 0x0d1b2a,
          );
          win.setAlpha(lit ? 0.7 : 0.3);
          // Store on the building for parallax
          this.bgBuildings.push(win);
        }
      }
    }
  }

  private updateBackground(): void {
    // Simple parallax: shift buildings based on worldOffset
    for (const obj of this.bgBuildings) {
      // Not actually moving — we keep it static for simplicity since
      // the "scrolling" effect is implied by walking animation
    }
  }

  // ---- Walking phase ----

  private startWalking(): void {
    this.phase = "walking";
    this.walkTarget = this.worldOffset + WALK_DISTANCE;

    // Bob animation while walking
    this.tweens.add({
      targets: this.player,
      y: this.player.y - 4,
      duration: 200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private updateWalking(delta: number): void {
    const step = (WALK_SPEED * delta) / 1000;
    this.worldOffset += step;

    if (this.worldOffset >= this.walkTarget) {
      this.worldOffset = this.walkTarget;
      this.tweens.killTweensOf(this.player);
      // Reset player Y
      this.player.y = GROUND_Y - 30;

      // Determine if this is the boss wave
      if (this.state.currentWave === this.state.totalWaves - 1) {
        this.state = {
          ...this.state,
          isBossWave: true,
        };
        this.startBossIntro();
      } else {
        this.spawnEnemyWave();
      }
    }
  }

  // ---- Enemy waves ----

  private spawnEnemyWave(): void {
    this.phase = "enemies-entering";
    this.enemies = [];

    const enemyCount = 3 + Math.floor(this.state.currentWave / 2);
    const colors = [0xb71c1c, 0xd32f2f, 0xc62828, 0x8e0000, 0xe53935];

    for (let i = 0; i < enemyCount; i++) {
      const enemySize = 24 + Phaser.Math.Between(0, 12);
      const enemy = this.add.rectangle(
        ENEMY_SPAWN_X + i * 40 + Phaser.Math.Between(0, 30),
        GROUND_Y - enemySize / 2 - Phaser.Math.Between(0, 10),
        enemySize,
        enemySize,
        colors[i % colors.length],
      );
      enemy.setStrokeStyle(2, 0x000000);
      enemy.setAlpha(0);
      this.enemies.push(enemy);
    }

    // Animate enemies entering from right
    let completed = 0;
    this.enemies.forEach((enemy, idx) => {
      const targetX =
        ENEMY_STOP_X + idx * 30 - ((enemyCount - 1) * 30) / 2;
      this.tweens.add({
        targets: enemy,
        x: targetX,
        alpha: 1,
        duration: 400,
        delay: idx * 80,
        ease: "Power2",
        onComplete: () => {
          // Enemy idle bob
          this.tweens.add({
            targets: enemy,
            y: enemy.y - 5,
            duration: 300 + idx * 50,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
          completed++;
          if (completed === this.enemies.length) {
            this.showWaveQuestion();
          }
        },
      });
    });
  }

  // ---- Boss intro ----

  private startBossIntro(): void {
    this.phase = "boss-intro";

    // Flash screen
    this.cameras.main.flash(500, 80, 0, 0);

    // "BOSS" text
    const bossText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "BOSS BATTLE!", {
        fontSize: "48px",
        fontFamily: "sans-serif",
        color: "#ff1744",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(50);

    this.tweens.add({
      targets: bossText,
      alpha: 1,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 500,
      yoyo: true,
      hold: 600,
      onComplete: () => {
        bossText.destroy();
        this.spawnBoss();
      },
    });
  }

  private spawnBoss(): void {
    this.enemies = [];

    // Big boss enemy
    const boss = this.add.rectangle(
      ENEMY_SPAWN_X + 50,
      GROUND_Y - 50,
      64,
      80,
      0x6a1b9a,
    );
    boss.setStrokeStyle(3, 0xce93d8);
    boss.setAlpha(0);
    this.bossEnemy = boss;
    this.enemies.push(boss);

    // Boss label
    const bossLabel = this.add
      .text(ENEMY_SPAWN_X + 50, GROUND_Y - 100, "DOUBT KING", {
        fontSize: "14px",
        fontFamily: "sans-serif",
        color: "#ce93d8",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: [boss, bossLabel],
      x: ENEMY_STOP_X,
      alpha: 1,
      duration: 800,
      ease: "Power2",
      onComplete: () => {
        // Boss bob
        this.tweens.add({
          targets: boss,
          y: boss.y - 8,
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        this.tweens.add({
          targets: bossLabel,
          x: ENEMY_STOP_X,
          alpha: 1,
          duration: 100,
        });
        this.showWaveQuestion();
      },
    });
  }

  // ---- Question overlay ----

  private showWaveQuestion(): void {
    this.phase = "question";
    const q = this.filteredQuestions[
      this.state.currentWave % this.filteredQuestions.length
    ];

    const container = this.add.container(0, 0).setDepth(100);

    // Semi-transparent backdrop
    const backdrop = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.5,
    );
    container.add(backdrop);

    // Panel
    const panelW = Math.min(GAME_WIDTH - 40, 600);
    const panelH = 320;
    const panelBg = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      panelW,
      panelH,
      0x1a1a2e,
      0.95,
    );
    panelBg.setStrokeStyle(3, 0x4a4a6a);
    container.add(panelBg);

    // Wave label
    const waveLabel = this.state.isBossWave
      ? "BOSS QUESTION"
      : `Wave ${this.state.currentWave + 1}`;
    const waveLabelText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelH / 2 + 20, waveLabel, {
        fontSize: "13px",
        fontFamily: "sans-serif",
        color: this.state.isBossWave ? "#ff1744" : "#9e9e9e",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    container.add(waveLabelText);

    // Question text
    const qText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelH / 2 + 50, q.text, {
        fontSize: "18px",
        fontFamily: "sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
        wordWrap: { width: panelW - 60 },
        align: "center",
      })
      .setOrigin(0.5, 0);
    container.add(qText);

    // Answer buttons (2x2 grid)
    const btnW = (panelW - 60) / 2 - 5;
    const btnH = 44;
    const btnStartY = GAME_HEIGHT / 2 - 10;
    const btnStartX = GAME_WIDTH / 2 - (panelW - 60) / 4;

    q.options.forEach((option, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const bx = btnStartX + col * (btnW + 10);
      const by = btnStartY + row * (btnH + 10);

      const btn = this.add.rectangle(bx, by, btnW, btnH, BTN_COLORS[idx]);
      btn.setStrokeStyle(2, 0x000000);
      btn.setInteractive({ useHandCursor: true });

      const label = this.add
        .text(bx, by, `${BTN_LABELS[idx]}: ${option}`, {
          fontSize: "13px",
          fontFamily: "sans-serif",
          color: "#ffffff",
          fontStyle: "bold",
          wordWrap: { width: btnW - 16 },
          align: "center",
        })
        .setOrigin(0.5);

      container.add(btn);
      container.add(label);

      btn.on("pointerdown", () => {
        this.handleAnswer(idx === q.correctIndex, container);
      });
    });

    // Streak indicator
    if (this.state.streak > 0) {
      const streakColor =
        this.state.powerUpLevel === 2
          ? "#42a5f5"
          : this.state.powerUpLevel === 1
            ? "#ff8c00"
            : "#ffc107";
      const streakLabel = this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2 + panelH / 2 - 20,
          `Streak: ${this.state.streak}x`,
          {
            fontSize: "16px",
            fontFamily: "sans-serif",
            color: streakColor,
            fontStyle: "bold",
          },
        )
        .setOrigin(0.5);
      container.add(streakLabel);
    }

    this.questionPanel = container;
  }

  // ---- Answer handling ----

  private handleAnswer(
    correct: boolean,
    container: Phaser.GameObjects.Container,
  ): void {
    // Disable further input
    container.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Rectangle) {
        child.disableInteractive();
      }
    });

    this.state = answerQuestion(this.state, correct);
    this.updateHUD();

    if (correct) {
      this.showCorrectFeedback(container);
    } else {
      this.showWrongFeedback(container);
    }
  }

  private showCorrectFeedback(container: Phaser.GameObjects.Container): void {
    this.phase = "attack";

    // Feedback text
    const feedback = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 130, "Correct!", {
        fontSize: "28px",
        fontFamily: "sans-serif",
        color: "#43a047",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(feedback);

    this.time.delayedCall(600, () => {
      container.destroy();
      this.questionPanel = null;
      this.playAttackAnimation();
    });
  }

  private showWrongFeedback(container: Phaser.GameObjects.Container): void {
    this.phase = "damage";

    // Feedback text
    const feedback = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 130, "Wrong!", {
        fontSize: "28px",
        fontFamily: "sans-serif",
        color: "#e53935",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(feedback);

    // Screen shake
    this.cameras.main.shake(300, 0.015);

    // Flash player red
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: 3,
    });

    // Remove power-up glow
    this.removePowerUpGlow();

    this.time.delayedCall(1000, () => {
      container.destroy();
      this.questionPanel = null;

      if (isGameOver(this.state)) {
        this.showGameOver();
      } else {
        // Retry same wave — re-show enemies
        this.showWaveQuestion();
      }
    });
  }

  // ---- Attack animation ----

  private playAttackAnimation(): void {
    // Determine power-up visuals
    const powerUp = this.state.powerUpLevel;

    // Slash effect
    const slashColor =
      powerUp === 2
        ? POWER_LIGHTNING_COLOR
        : powerUp === 1
          ? POWER_FIRE_COLOR
          : 0xffffff;

    // Draw slash line from player toward enemies
    const slash = this.add
      .rectangle(PLAYER_X + 40, GROUND_Y - 30, 10, 4, slashColor)
      .setDepth(50);

    this.tweens.add({
      targets: slash,
      x: ENEMY_STOP_X + 50,
      scaleX: 30,
      alpha: 0,
      duration: 300,
      ease: "Power2",
      onComplete: () => slash.destroy(),
    });

    // Power-up specific effects
    if (powerUp >= 1) {
      this.showPowerUpEffect(powerUp);
    }

    // Update player glow
    this.updatePowerUpGlow();

    // Destroy enemies with delay
    this.time.delayedCall(250, () => {
      this.destroyEnemies();
    });

    // Spawn coins
    this.time.delayedCall(400, () => {
      this.spawnCoins();

      // Check game state
      this.time.delayedCall(600, () => {
        if (isGameComplete(this.state)) {
          this.showCompletion();
        } else {
          this.startWalking();
        }
      });
    });
  }

  private showPowerUpEffect(level: number): void {
    if (level === 1) {
      // Fire burst particles
      for (let i = 0; i < 12; i++) {
        const px = PLAYER_X + 30 + Phaser.Math.Between(0, 350);
        const py = GROUND_Y - 20 + Phaser.Math.Between(-40, 20);
        const particle = this.add
          .circle(px, py, Phaser.Math.Between(4, 10), POWER_FIRE_COLOR)
          .setAlpha(0.8)
          .setDepth(45);
        this.tweens.add({
          targets: particle,
          y: py - Phaser.Math.Between(30, 80),
          alpha: 0,
          scaleX: 0.2,
          scaleY: 0.2,
          duration: 500,
          delay: Phaser.Math.Between(0, 200),
          onComplete: () => particle.destroy(),
        });
      }
    } else if (level === 2) {
      // Lightning bolts
      for (let i = 0; i < 5; i++) {
        const lx = 300 + i * 80 + Phaser.Math.Between(-20, 20);
        const bolt = this.add
          .rectangle(lx, GROUND_Y / 2, 4, GROUND_Y, POWER_LIGHTNING_COLOR)
          .setAlpha(0.9)
          .setDepth(45);
        this.tweens.add({
          targets: bolt,
          alpha: 0,
          duration: 200,
          delay: i * 60,
          onComplete: () => bolt.destroy(),
        });
      }
      this.cameras.main.flash(200, 100, 150, 255);
    }
  }

  private destroyEnemies(): void {
    for (const enemy of this.enemies) {
      this.tweens.killTweensOf(enemy);
      this.tweens.add({
        targets: enemy,
        alpha: 0,
        scaleX: 2,
        scaleY: 2,
        duration: 300,
        ease: "Power2",
        onComplete: () => enemy.destroy(),
      });
    }
    this.enemies = [];
    this.bossEnemy = null;
  }

  private spawnCoins(): void {
    const coinCount = 6 + this.state.streak * 2;
    for (let i = 0; i < coinCount; i++) {
      const cx = ENEMY_STOP_X + Phaser.Math.Between(-60, 60);
      const cy = GROUND_Y - 30 + Phaser.Math.Between(-20, 20);
      const coin = this.add
        .circle(cx, cy, 5, 0xffc107)
        .setDepth(40);
      this.tweens.add({
        targets: coin,
        y: cy - Phaser.Math.Between(40, 100),
        x: cx + Phaser.Math.Between(-40, 40),
        alpha: 0,
        duration: 600,
        delay: Phaser.Math.Between(0, 200),
        ease: "Power2",
        onComplete: () => coin.destroy(),
      });
    }
  }

  // ---- Power-up glow ----

  private updatePowerUpGlow(): void {
    this.removePowerUpGlow();

    if (this.state.powerUpLevel >= 1) {
      const glowColor =
        this.state.powerUpLevel === 2
          ? POWER_LIGHTNING_COLOR
          : POWER_FIRE_COLOR;
      this.playerGlow = this.add
        .circle(PLAYER_X, GROUND_Y - 30, 40, glowColor, 0.25)
        .setDepth(this.player.depth - 1);

      // Pulse animation
      this.tweens.add({
        targets: this.playerGlow,
        scaleX: 1.3,
        scaleY: 1.3,
        alpha: 0.15,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private removePowerUpGlow(): void {
    if (this.playerGlow) {
      this.tweens.killTweensOf(this.playerGlow);
      this.playerGlow.destroy();
      this.playerGlow = null;
    }
  }

  // ---- HUD ----

  private createHUD(): void {
    const fontSize = "14px";

    // HP bar background
    this.hpBarBg = this.add
      .rectangle(20, 20, 160, 18, 0x333333)
      .setOrigin(0, 0)
      .setDepth(200);
    this.hpBarBg.setStrokeStyle(1, 0x666666);

    // HP bar fill
    this.hpBarFill = this.add
      .rectangle(21, 21, 158, 16, 0x43a047)
      .setOrigin(0, 0)
      .setDepth(201);

    // HP label
    this.add
      .text(22, 22, "HP", {
        fontSize: "11px",
        fontFamily: "sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setDepth(202);

    // Score
    this.scoreText = this.add
      .text(GAME_WIDTH - 20, 15, `Score: ${this.state.score}`, {
        fontSize,
        fontFamily: "sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(1, 0)
      .setDepth(200);

    // Streak
    this.streakText = this.add
      .text(GAME_WIDTH - 20, 40, `Streak: ${this.state.streak}`, {
        fontSize: "13px",
        fontFamily: "sans-serif",
        color: "#ffc107",
      })
      .setOrigin(1, 0)
      .setDepth(200);

    // Wave
    this.waveText = this.add
      .text(
        GAME_WIDTH / 2,
        15,
        `Wave ${this.state.currentWave + 1} / ${this.state.totalWaves}`,
        {
          fontSize,
          fontFamily: "sans-serif",
          color: "#9e9e9e",
        },
      )
      .setOrigin(0.5, 0)
      .setDepth(200);
  }

  private updateHUD(): void {
    // HP bar
    const hpRatio = this.state.playerHp / this.state.maxHp;
    this.hpBarFill.width = Math.max(0, 158 * hpRatio);
    // Change color based on HP
    if (hpRatio > 0.5) {
      this.hpBarFill.setFillStyle(0x43a047);
    } else if (hpRatio > 0.25) {
      this.hpBarFill.setFillStyle(0xfb8c00);
    } else {
      this.hpBarFill.setFillStyle(0xe53935);
    }

    this.scoreText.setText(`Score: ${this.state.score}`);
    this.streakText.setText(`Streak: ${this.state.streak}`);

    const streakColor =
      this.state.powerUpLevel === 2
        ? "#42a5f5"
        : this.state.powerUpLevel === 1
          ? "#ff8c00"
          : "#ffc107";
    this.streakText.setColor(streakColor);

    this.waveText.setText(
      `Wave ${this.state.currentWave + 1} / ${this.state.totalWaves}`,
    );
  }

  // ---- Game Over ----

  private showGameOver(): void {
    this.phase = "gameover";
    this.removePowerUpGlow();

    const container = this.add.container(0, 0).setDepth(300);

    // Backdrop
    const backdrop = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.7,
    );
    container.add(backdrop);

    // Title
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.2, "Defeated!", {
        fontSize: "36px",
        fontFamily: "sans-serif",
        color: "#e53935",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(title);

    // Score
    const scoreLabel = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.4, `Score: ${this.state.score}`, {
        fontSize: "24px",
        fontFamily: "sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(scoreLabel);

    // Waves cleared
    const cleared = this.state.wavesCleared.filter(Boolean).length;
    const wavesLabel = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.48,
        `Waves Cleared: ${cleared} / ${this.state.totalWaves}`,
        {
          fontSize: "18px",
          fontFamily: "sans-serif",
          color: "#9e9e9e",
        },
      )
      .setOrigin(0.5);
    container.add(wavesLabel);

    // Try Again button
    const tryAgainBg = this.add.rectangle(
      GAME_WIDTH / 2 - 90,
      GAME_HEIGHT * 0.6,
      150,
      50,
      0x43a047,
    );
    tryAgainBg.setStrokeStyle(2, 0x2e7d32);
    tryAgainBg.setInteractive({ useHandCursor: true });
    const tryAgainLabel = this.add
      .text(GAME_WIDTH / 2 - 90, GAME_HEIGHT * 0.6, "Try Again", {
        fontSize: "18px",
        fontFamily: "sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(tryAgainBg);
    container.add(tryAgainLabel);

    tryAgainBg.on("pointerdown", () => {
      container.destroy();
      this.scene.restart();
    });

    // Back button
    const backBg = this.add.rectangle(
      GAME_WIDTH / 2 + 90,
      GAME_HEIGHT * 0.6,
      150,
      50,
      0x1e88e5,
    );
    backBg.setStrokeStyle(2, 0x1565c0);
    backBg.setInteractive({ useHandCursor: true });
    const backLabel = this.add
      .text(GAME_WIDTH / 2 + 90, GAME_HEIGHT * 0.6, "Back to Games", {
        fontSize: "18px",
        fontFamily: "sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(backBg);
    container.add(backLabel);

    backBg.on("pointerdown", () => {
      window.location.hash = "#/";
    });
  }

  // ---- Completion screen ----

  private showCompletion(): void {
    this.phase = "complete";
    this.removePowerUpGlow();

    const stars = calculateStars(this.state);
    const container = this.add.container(0, 0).setDepth(300);

    // Backdrop
    const backdrop = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.7,
    );
    container.add(backdrop);

    // Title
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.1, "Victory!", {
        fontSize: "36px",
        fontFamily: "sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(title);

    // Stars
    const starStr =
      Array(stars).fill("\u2605").join(" ") +
      " " +
      Array(3 - stars)
        .fill("\u2606")
        .join(" ");
    const starText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.22, starStr.trim(), {
        fontSize: "42px",
        fontFamily: "sans-serif",
        color: "#ffc107",
      })
      .setOrigin(0.5);
    container.add(starText);

    // Score
    const scoreLabel = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.36, `Score: ${this.state.score}`, {
        fontSize: "26px",
        fontFamily: "sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(scoreLabel);

    // Best streak
    const streakLabel = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.46,
        `Best Streak: ${this.state.bestStreak}`,
        {
          fontSize: "18px",
          fontFamily: "sans-serif",
          color: "#ffc107",
        },
      )
      .setOrigin(0.5);
    container.add(streakLabel);

    // HP remaining
    const hpLabel = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.53,
        `HP Remaining: ${this.state.playerHp} / ${this.state.maxHp}`,
        {
          fontSize: "15px",
          fontFamily: "sans-serif",
          color: "#9e9e9e",
        },
      )
      .setOrigin(0.5);
    container.add(hpLabel);

    // Play Again button
    const playAgainBg = this.add.rectangle(
      GAME_WIDTH / 2 - 90,
      GAME_HEIGHT * 0.65,
      150,
      50,
      0x43a047,
    );
    playAgainBg.setStrokeStyle(2, 0x2e7d32);
    playAgainBg.setInteractive({ useHandCursor: true });
    const playAgainLabel = this.add
      .text(GAME_WIDTH / 2 - 90, GAME_HEIGHT * 0.65, "Play Again", {
        fontSize: "18px",
        fontFamily: "sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(playAgainBg);
    container.add(playAgainLabel);

    playAgainBg.on("pointerdown", () => {
      container.destroy();
      this.scene.restart();
    });

    // Back to Games button
    const backBg = this.add.rectangle(
      GAME_WIDTH / 2 + 90,
      GAME_HEIGHT * 0.65,
      150,
      50,
      0x1e88e5,
    );
    backBg.setStrokeStyle(2, 0x1565c0);
    backBg.setInteractive({ useHandCursor: true });
    const backLabel = this.add
      .text(GAME_WIDTH / 2 + 90, GAME_HEIGHT * 0.65, "Back to Games", {
        fontSize: "18px",
        fontFamily: "sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(backBg);
    container.add(backLabel);

    backBg.on("pointerdown", () => {
      window.location.hash = "#/";
    });
  }
}
