import Phaser from "phaser";
import type { LessonConfig, Question } from "@/types/lesson";
import {
  createBattleState,
  resolvePlayerAnswer,
  rollLoot,
  applyLoot,
  HERO_ABILITIES,
  type BattleState,
  type Hero,
  type Enemy,
  type LootItem,
  type AbilityResult,
} from "../logic/rpg-logic";

const ANSWER_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00];

// Scary enemy names for more dramatic encounters
const ENEMY_NAMES = [
  "Shadow of Doubt",
  "Whisper of Fear",
  "Spirit of Lies",
  "Tempter Shade",
  "Idol of Envy",
  "Phantom of Pride",
  "Specter of Greed",
  "Wraith of Anger",
];

export class BattleScene extends Phaser.Scene {
  private battleState!: BattleState;
  private questions: Question[] = [];
  private questionIndex = 0;
  private wrongCount = 0;
  private inputLocked = false;
  private partyHp = 0;
  private maxPartyHp = 0;

  // Display objects
  private heroSprites: Phaser.GameObjects.Container[] = [];
  private enemyContainer: Phaser.GameObjects.Container | null = null;
  private enemyHpBar: {
    bg: Phaser.GameObjects.Rectangle;
    fill: Phaser.GameObjects.Rectangle;
  } | null = null;
  private partyHpBar: {
    bg: Phaser.GameObjects.Rectangle;
    fill: Phaser.GameObjects.Rectangle;
  } | null = null;
  private partyHpText: Phaser.GameObjects.Text | null = null;
  private questionText: Phaser.GameObjects.Text | null = null;
  private answerButtons: Phaser.GameObjects.Container[] = [];
  private feedbackContainer: Phaser.GameObjects.Container | null = null;
  private enemyHpLabel: Phaser.GameObjects.Text | null = null;
  private abilityPips: Phaser.GameObjects.Arc[][] = [];
  private heroGlowTweens: Phaser.Tweens.Tween[] = [];

  constructor() {
    super({ key: "BattleScene" });
  }

  create(): void {
    const { width, height } = this.scale;

    // Dark blue-gray battle background
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // Subtle grid lines for atmosphere
    const gridGfx = this.add.graphics();
    gridGfx.lineStyle(1, 0xffffff, 0.04);
    for (let gy = 0; gy < height; gy += 30) {
      gridGfx.moveTo(0, gy);
      gridGfx.lineTo(width, gy);
    }
    gridGfx.strokePath();

    const heroes = this.registry.get("partyHeroes") as Hero[];
    const enemy = this.registry.get("battleEnemy") as Enemy;

    // Generate a scary name for the enemy
    const scaryName =
      ENEMY_NAMES[Math.floor(Math.random() * ENEMY_NAMES.length)];
    const themedEnemy = { ...enemy, name: scaryName };

    this.battleState = createBattleState(heroes, themedEnemy);
    this.questionIndex = 0;
    this.wrongCount = 0;
    this.inputLocked = false;
    this.abilityPips = [];
    this.heroGlowTweens = [];

    // Initialize shared party HP
    this.partyHp =
      (this.registry.get("partyHp") as number) ??
      heroes.reduce((s, h) => s + h.hp, 0);
    this.maxPartyHp =
      (this.registry.get("maxPartyHp") as number) ?? this.partyHp;

    // Gather questions
    this.questions = this.gatherQuestions();

    // --- Layout ---
    // Party HP bar: y=14..32
    this.drawPartyHpBar(width);

    // Heroes (left) vs Enemy (right): y=50..170
    this.drawHeroes(width);
    this.drawEnemy(width);

    // Feedback zone: y=180..230 (created on demand)

    // Question text: y=240..300
    this.questionText = this.add
      .text(width / 2, 248, "", {
        fontSize: "15px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#e0e0e0",
        align: "center",
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5, 0);

    // Show first question
    this.showTurnStart();
  }

  // ---------- Questions ----------

  private gatherQuestions(): Question[] {
    const lesson = this.registry.get("lesson") as LessonConfig | undefined;
    const questionIds = this.registry.get("battleQuestionIds") as
      | string[]
      | undefined;

    if (!lesson || !questionIds) return [];

    const qMap = new Map(lesson.questions.map((q) => [q.id, q]));
    const result: Question[] = [];
    for (const id of questionIds) {
      const q = qMap.get(id);
      if (q) result.push(q);
    }

    return result.slice(0, Math.min(5, Math.max(3, result.length)));
  }

  // ---------- Party HP Bar (top) ----------

  private drawPartyHpBar(width: number): void {
    const barX = 20;
    const barY = 14;
    const barW = width - 40;
    const barH = 16;

    // Label
    this.add
      .text(barX, barY - 2, "PARTY HP", {
        fontSize: "9px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#a0a0c0",
      })
      .setOrigin(0, 1);

    // Bar background with rounded-ish look
    const bg = this.add
      .rectangle(barX + barW / 2, barY + barH / 2, barW, barH, 0x333355)
      .setStrokeStyle(1, 0x555577);
    const ratio = Math.max(0, this.partyHp / this.maxPartyHp);
    const fill = this.add.rectangle(
      barX + (barW * ratio) / 2,
      barY + barH / 2,
      barW * ratio,
      barH - 2,
      0x4caf50,
    );

    this.partyHpBar = { bg, fill };
    this.partyHpText = this.add
      .text(
        barX + barW,
        barY + barH / 2,
        `${this.partyHp}/${this.maxPartyHp}`,
        {
          fontSize: "10px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#c0c0e0",
        },
      )
      .setOrigin(1, 0.5);
  }

  // ---------- Heroes (horizontal row, left side) ----------

  private drawHeroes(width: number): void {
    this.heroSprites = [];
    const heroes = this.battleState.heroes;
    const heroCount = heroes.length;
    const heroAreaWidth = width * 0.5;
    const startX = 16;
    const gap = Math.min(
      60,
      (heroAreaWidth - 36) / Math.max(1, heroCount - 1),
    );
    const cy = 120;

    heroes.forEach((hero, i) => {
      const x = startX + 24 + i * gap;
      const y = cy;
      const radius = 18;

      const color = Phaser.Display.Color.HexStringToColor(hero.color).color;

      // Glow ring for active hero (drawn first so it's behind)
      const glowRing = this.add
        .circle(0, 0, radius + 5, color, 0.3)
        .setVisible(false);

      // Hero body
      const body = this.add.circle(0, 0, radius, color);
      body.setStrokeStyle(2, 0xffffff, 0.5);

      // Initial letter
      const initial = this.add
        .text(0, -1, hero.name.charAt(0).toUpperCase(), {
          fontSize: "16px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#ffffff",
        })
        .setOrigin(0.5);

      // Name below
      const nameLabel = this.add
        .text(0, radius + 8, hero.name, {
          fontSize: "10px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#c0c0e0",
        })
        .setOrigin(0.5, 0);

      const container = this.add.container(x, y, [
        glowRing,
        body,
        initial,
        nameLabel,
      ]);
      this.heroSprites.push(container);

      // Ability charge pips
      const ability = HERO_ABILITIES[hero.name];
      const pips: Phaser.GameObjects.Arc[] = [];
      if (ability) {
        for (let p = 0; p < ability.maxCharges; p++) {
          const pipX = -(ability.maxCharges - 1) * 5 + p * 10;
          const pipY = radius + 22;
          const pip = this.add
            .circle(pipX, pipY, 3, 0x333355)
            .setStrokeStyle(1, 0x555577, 0.3);
          container.add(pip);
          pips.push(pip);
        }
      }
      this.abilityPips.push(pips);
    });

    this.highlightCurrentHero();
  }

  // ---------- Enemy (right side, with face) ----------

  private drawEnemy(width: number): void {
    const enemy = this.battleState.enemy;
    const x = width - 90;
    const y = 120;
    const radius = 50;

    // Create enemy body as an irregular threatening shape using graphics
    const bodyGfx = this.add.graphics();

    // Main body — dark red-purple gradient feel
    bodyGfx.fillStyle(0x6b1040, 1);
    bodyGfx.fillCircle(0, 0, radius);

    // Spiky protrusions
    bodyGfx.fillStyle(0x8b1050, 1);
    const spikes = 8;
    for (let s = 0; s < spikes; s++) {
      const angle = (s / spikes) * Math.PI * 2;
      const spikeLen = radius + 10 + Math.sin(s * 3.7) * 6;
      const sx = Math.cos(angle) * spikeLen;
      const sy = Math.sin(angle) * spikeLen;
      bodyGfx.fillTriangle(
        Math.cos(angle - 0.3) * radius * 0.8,
        Math.sin(angle - 0.3) * radius * 0.8,
        Math.cos(angle + 0.3) * radius * 0.8,
        Math.sin(angle + 0.3) * radius * 0.8,
        sx,
        sy,
      );
    }

    // Inner highlight
    bodyGfx.fillStyle(0x9b2060, 0.5);
    bodyGfx.fillCircle(-8, -8, radius * 0.5);

    // Eyes — menacing white with red pupils
    const leftEye = this.add.circle(-16, -10, 10, 0xffffff);
    const rightEye = this.add.circle(16, -10, 10, 0xffffff);
    const leftPupil = this.add.circle(-16, -8, 5, 0xcc0000);
    const rightPupil = this.add.circle(16, -8, 5, 0xcc0000);

    // Angry eyebrows
    const browGfx = this.add.graphics();
    browGfx.lineStyle(3, 0x330011, 1);
    browGfx.beginPath();
    browGfx.moveTo(-28, -24);
    browGfx.lineTo(-8, -20);
    browGfx.strokePath();
    browGfx.beginPath();
    browGfx.moveTo(28, -24);
    browGfx.lineTo(8, -20);
    browGfx.strokePath();

    // Jagged mouth
    const mouthGfx = this.add.graphics();
    mouthGfx.lineStyle(2, 0x220000, 1);
    mouthGfx.fillStyle(0x330011, 1);
    mouthGfx.beginPath();
    mouthGfx.moveTo(-20, 14);
    mouthGfx.lineTo(-12, 10);
    mouthGfx.lineTo(-4, 18);
    mouthGfx.lineTo(4, 8);
    mouthGfx.lineTo(12, 18);
    mouthGfx.lineTo(20, 14);
    mouthGfx.lineTo(12, 22);
    mouthGfx.lineTo(4, 16);
    mouthGfx.lineTo(-4, 24);
    mouthGfx.lineTo(-12, 16);
    mouthGfx.lineTo(-20, 20);
    mouthGfx.closePath();
    mouthGfx.fillPath();
    mouthGfx.strokePath();

    // Enemy name above in bold
    const nameText = this.add
      .text(0, -(radius + 22), enemy.name, {
        fontSize: "14px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ff6666",
        align: "center",
        wordWrap: { width: 140 },
      })
      .setOrigin(0.5, 1);

    // HP bar below enemy
    const hpBarW = 90;
    const hpBarH = 8;
    const hpBarY = radius + 14;
    const hpBg = this.add
      .rectangle(0, hpBarY, hpBarW, hpBarH, 0x333355)
      .setStrokeStyle(1, 0x555577);
    const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);
    const hpFill = this.add.rectangle(
      -(hpBarW * (1 - hpRatio)) / 2,
      hpBarY,
      hpBarW * hpRatio,
      hpBarH - 2,
      0xe53935,
    );

    this.enemyHpLabel = this.add
      .text(0, hpBarY + 10, `${enemy.hp}/${enemy.maxHp}`, {
        fontSize: "9px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#e08080",
      })
      .setOrigin(0.5, 0);

    this.enemyContainer = this.add.container(x, y, [
      bodyGfx,
      leftEye,
      rightEye,
      leftPupil,
      rightPupil,
      browGfx,
      mouthGfx,
      nameText,
      hpBg,
      hpFill,
      this.enemyHpLabel,
    ]);
    this.enemyHpBar = { bg: hpBg, fill: hpFill };

    // Idle breathing animation
    this.tweens.add({
      targets: this.enemyContainer,
      scaleX: 1.03,
      scaleY: 0.97,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  // ---------- Turn / Question flow ----------

  private showTurnStart(): void {
    const { width } = this.scale;

    const turnLabel = this.add
      .text(width / 2, 200, "YOUR TURN", {
        fontSize: "22px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: turnLabel,
      alpha: 1,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 400,
      yoyo: true,
      hold: 400,
      onComplete: () => {
        turnLabel.destroy();
        this.showQuestion();
      },
    });
  }

  private showQuestion(): void {
    if (this.questionIndex >= this.questions.length) {
      this.battleState = {
        ...this.battleState,
        battleOver: true,
        victory: true,
        enemy: { ...this.battleState.enemy, hp: 0 },
      };
      this.handleBattleEnd();
      return;
    }

    const q = this.questions[this.questionIndex];
    this.questionText?.setText(q.text);

    // Clear old answer buttons
    this.answerButtons.forEach((b) => b.destroy());
    this.answerButtons = [];

    const { width } = this.scale;
    const btnW = (width - 48) / 2;
    const btnH = 50;
    const startX = 16;
    const startY = 310;
    const gapX = 8;
    const gapY = 8;

    q.options.forEach((opt, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = startX + col * (btnW + gapX) + btnW / 2;
      const by = startY + row * (btnH + gapY) + btnH / 2;

      // Button with rounded-ish rectangle
      const bg = this.add
        .rectangle(0, 0, btnW, btnH, ANSWER_COLORS[i])
        .setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, 0xffffff, 0.2);

      const label = this.add
        .text(0, 0, opt, {
          fontSize: "13px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#ffffff",
          align: "center",
          wordWrap: { width: btnW - 16 },
        })
        .setOrigin(0.5);

      const container = this.add.container(bx, by, [bg, label]);
      container.setAlpha(0);
      this.answerButtons.push(container);

      // Staggered fade-in
      this.tweens.add({
        targets: container,
        alpha: 1,
        y: by,
        duration: 200,
        delay: i * 60,
      });

      bg.on("pointerdown", () => {
        if (this.inputLocked) return;
        this.inputLocked = true;
        this.handleAnswer(i === q.correctIndex);
      });

      bg.on("pointerover", () => {
        bg.setAlpha(0.85);
        this.tweens.add({
          targets: container,
          scaleX: 1.04,
          scaleY: 1.04,
          duration: 100,
        });
      });
      bg.on("pointerout", () => {
        bg.setAlpha(1);
        this.tweens.add({
          targets: container,
          scaleX: 1,
          scaleY: 1,
          duration: 100,
        });
      });
    });

    // Status text at bottom
    const statusY = 450;
    const heroName =
      this.battleState.heroes[this.battleState.currentHeroIndex]?.name ?? "";
    const qNum = this.questionIndex + 1;
    const qTotal = this.questions.length;

    // Clear previous status if any
    this.children.getByName("bottomStatus")?.destroy();
    const bottomStatus = this.add
      .text(width / 2, statusY, `${heroName}'s turn  |  Q${qNum}/${qTotal}`, {
        fontSize: "11px",
        fontFamily: "sans-serif",
        color: "#808098",
      })
      .setOrigin(0.5)
      .setName("bottomStatus");

    void bottomStatus;
  }

  // ---------- Answer handling ----------

  private handleAnswer(correct: boolean): void {
    const prevState = this.battleState;
    const result = resolvePlayerAnswer(
      this.battleState,
      correct,
      this.partyHp,
      this.maxPartyHp,
    );
    this.battleState = result;

    if (!correct) {
      this.wrongCount++;
    }

    // Apply party HP delta (negative for damage, positive for heal)
    if (result.partyHpDelta) {
      this.partyHp = Math.max(
        0,
        Math.min(this.maxPartyHp, this.partyHp + result.partyHpDelta),
      );

      if (result.partyHpDelta < 0) {
        this.updatePartyHpBar(true);
      }

      if (this.partyHp <= 0) {
        this.battleState = {
          ...this.battleState,
          battleOver: true,
          victory: false,
        };
      }
    }

    if (result.abilityTriggered) {
      this.showAbilityAnimation(result.abilityTriggered, prevState);
    } else if (correct) {
      this.showCorrectAnimation(prevState);
    } else {
      this.showWrongAnimation(prevState);
    }
  }

  // ---------- Correct animation ----------

  private showCorrectAnimation(prevState: BattleState): void {
    const { width } = this.scale;

    // BIG feedback text with bounce
    this.showBigFeedback("CORRECT!", "#4CAF50");

    // Green glow flash on camera
    this.cameras.main.flash(300, 40, 120, 40, false);

    // Hero lunges forward
    const heroContainer = this.heroSprites[prevState.currentHeroIndex];
    if (heroContainer) {
      this.tweens.add({
        targets: heroContainer,
        x: heroContainer.x + 80,
        duration: 150,
        yoyo: true,
        ease: "Power2",
      });
    }

    // Enemy shake + flash
    if (this.enemyContainer) {
      this.tweens.add({
        targets: this.enemyContainer,
        x: this.enemyContainer.x + 10,
        duration: 40,
        yoyo: true,
        repeat: 5,
      });
      // Brief white tint via alpha flash
      this.tweens.add({
        targets: this.enemyContainer,
        alpha: 0.5,
        duration: 80,
        yoyo: true,
      });
    }

    // Floating damage number on enemy
    const dmg = prevState.heroes[prevState.currentHeroIndex].attack;
    const dmgText = this.add
      .text(width - 90, 80, `-${dmg}`, {
        fontSize: "24px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ff4444",
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 50,
      alpha: 0,
      duration: 1000,
      ease: "Power2",
      onComplete: () => dmgText.destroy(),
    });

    this.updateEnemyHpBar();
    this.updateAbilityPips();
    this.highlightCurrentHero();

    this.time.delayedCall(1200, () => {
      this.advanceBattle();
    });
  }

  // ---------- Wrong animation ----------

  private showWrongAnimation(prevState: BattleState): void {
    const { width } = this.scale;

    // BIG feedback text with bounce
    this.showBigFeedback("WRONG!", "#E53935");

    // Red flash + screen shake
    this.cameras.main.flash(300, 150, 30, 30, false);
    this.cameras.main.shake(300, 0.015);

    // Party HP bar briefly turns red (handled in updatePartyHpBar)

    // Enemy lunges toward heroes
    if (this.enemyContainer) {
      this.tweens.add({
        targets: this.enemyContainer,
        x: this.enemyContainer.x - 50,
        duration: 200,
        yoyo: true,
        ease: "Power2",
      });
    }

    // Hero takes hit — flash
    const heroContainer = this.heroSprites[prevState.currentHeroIndex];
    if (heroContainer) {
      this.tweens.add({
        targets: heroContainer,
        alpha: 0.2,
        duration: 80,
        yoyo: true,
        repeat: 3,
      });
    }

    // Floating damage number near party HP bar
    const dmg = prevState.enemy.attack;
    const dmgText = this.add
      .text(width / 2, 34, `-${dmg}`, {
        fontSize: "22px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ff2222",
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 40,
      alpha: 0,
      duration: 1000,
      ease: "Power2",
      onComplete: () => dmgText.destroy(),
    });

    this.updateEnemyHpBar();
    this.highlightCurrentHero();

    this.time.delayedCall(1200, () => {
      this.advanceBattle();
    });
  }

  // ---------- Big feedback text ----------

  private showBigFeedback(message: string, color: string): void {
    const { width } = this.scale;

    // Destroy previous feedback
    if (this.feedbackContainer) {
      this.feedbackContainer.destroy();
      this.feedbackContainer = null;
    }

    const feedbackText = this.add
      .text(0, 0, message, {
        fontSize: "32px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color,
      })
      .setOrigin(0.5);

    // Shadow for depth
    const shadow = this.add
      .text(2, 2, message, {
        fontSize: "32px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#000000",
      })
      .setOrigin(0.5)
      .setAlpha(0.3);

    this.feedbackContainer = this.add
      .container(width / 2, 205, [shadow, feedbackText])
      .setDepth(15);

    // Bounce-in scale animation
    this.feedbackContainer.setScale(0.3);
    this.tweens.add({
      targets: this.feedbackContainer,
      scaleX: 1,
      scaleY: 1,
      duration: 300,
      ease: "Back.easeOut",
    });

    // Fade out after showing
    this.tweens.add({
      targets: this.feedbackContainer,
      alpha: 0,
      duration: 400,
      delay: 800,
      onComplete: () => {
        this.feedbackContainer?.destroy();
        this.feedbackContainer = null;
      },
    });
  }

  // ---------- Battle flow ----------

  private advanceBattle(): void {
    if (this.battleState.battleOver) {
      this.handleBattleEnd();
      return;
    }

    this.questionIndex++;
    this.inputLocked = false;

    if (this.questionIndex >= this.questions.length) {
      this.battleState = {
        ...this.battleState,
        battleOver: true,
        victory: true,
        enemy: { ...this.battleState.enemy, hp: 0 },
      };
      this.handleBattleEnd();
      return;
    }

    this.showQuestion();
  }

  // ---------- Battle End ----------

  private handleBattleEnd(): void {
    // Clear question UI
    this.questionText?.setText("");
    this.answerButtons.forEach((b) => b.destroy());
    this.answerButtons = [];
    this.children.getByName("bottomStatus")?.destroy();

    const { width, height } = this.scale;

    if (this.battleState.victory) {
      this.handleVictory(width, height);
    } else {
      this.handleDefeat(width, height);
    }
  }

  private handleVictory(width: number, height: number): void {
    // Mark location as cleared
    const locationIndex = this.registry.get("currentLocationIndex") as number;
    const cleared = this.registry.get("locationsCleared") as boolean[];
    cleared[locationIndex] = true;
    this.registry.set("locationsCleared", cleared);

    // Persist hero state
    this.registry.set("partyHeroes", this.battleState.heroes);
    this.registry.set("partyHp", this.partyHp);
    this.registry.set("maxPartyHp", this.maxPartyHp);

    // Full-screen overlay
    const overlay = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.7)
      .setDepth(30);

    // "VICTORY!" in gold
    const victoryText = this.add
      .text(width / 2, 140, "VICTORY!", {
        fontSize: "42px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ffd700",
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setAlpha(0)
      .setScale(0.5);

    this.tweens.add({
      targets: victoryText,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 600,
      ease: "Back.easeOut",
    });

    // Star rating based on wrong answers
    const stars = this.wrongCount === 0 ? 3 : this.wrongCount <= 1 ? 2 : 1;
    const starY = 200;

    for (let s = 0; s < 3; s++) {
      const filled = s < stars;
      const starText = this.add
        .text(width / 2 - 50 + s * 50, starY, filled ? "★" : "☆", {
          fontSize: "36px",
          fontFamily: "sans-serif",
          color: filled ? "#ffd700" : "#555566",
        })
        .setOrigin(0.5)
        .setDepth(31)
        .setAlpha(0);

      this.tweens.add({
        targets: starText,
        alpha: 1,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 300,
        delay: 600 + s * 200,
        yoyo: true,
        hold: 100,
        onYoyo: () => {
          starText.setScale(1);
        },
      });
    }

    // Stats line
    const correct = this.questions.length - this.wrongCount;
    const statsText = this.add
      .text(
        width / 2,
        240,
        `${correct}/${this.questions.length} correct  |  +50 XP`,
        {
          fontSize: "16px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#ffcc44",
        },
      )
      .setOrigin(0.5)
      .setDepth(31)
      .setAlpha(0);

    this.tweens.add({
      targets: statsText,
      alpha: 1,
      duration: 400,
      delay: 1200,
    });

    // Roll for loot
    const loot = rollLoot();
    if (loot) {
      const boostedHeroes = applyLoot(this.battleState.heroes, loot);
      this.registry.set("partyHeroes", boostedHeroes);

      const collectedLoot =
        (this.registry.get("collectedLoot") as LootItem[] | undefined) ?? [];
      collectedLoot.push(loot);
      this.registry.set("collectedLoot", collectedLoot);

      const newMaxHp = boostedHeroes.reduce((s, h) => s + h.maxHp, 0);
      const hpGain = newMaxHp - this.maxPartyHp;
      this.maxPartyHp = newMaxHp;
      this.partyHp = Math.min(this.maxPartyHp, this.partyHp + hpGain);
      this.registry.set("partyHp", this.partyHp);
      this.registry.set("maxPartyHp", this.maxPartyHp);

      this.showLootCard(loot, width, height, 1600);
      this.showReturnButton(width, height, 3000);
    } else {
      this.showReturnButton(width, height, 1800);
    }

    void overlay;
  }

  private handleDefeat(width: number, height: number): void {
    // Full-screen overlay
    const overlay = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.75)
      .setDepth(30);

    // "DEFEATED!" in red
    const defeatText = this.add
      .text(width / 2, 160, "DEFEATED!", {
        fontSize: "38px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ff3333",
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setAlpha(0);

    this.tweens.add({
      targets: defeatText,
      alpha: 1,
      duration: 600,
    });

    // Encouraging subtitle
    const subtitle = this.add
      .text(width / 2, 210, "Don't give up! Try again!", {
        fontSize: "16px",
        fontFamily: "sans-serif",
        color: "#cc9999",
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setAlpha(0);

    this.tweens.add({
      targets: subtitle,
      alpha: 1,
      duration: 400,
      delay: 500,
    });

    // Buttons
    this.time.delayedCall(1000, () => {
      // Retry button
      const retryBg = this.add
        .rectangle(width / 2, 290, 200, 48, 0xe53935)
        .setInteractive({ useHandCursor: true })
        .setDepth(31);
      retryBg.setStrokeStyle(2, 0xff6666);
      this.add
        .text(width / 2, 290, "Retry Battle", {
          fontSize: "16px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setDepth(32);

      // Back to Map button
      const mapBg = this.add
        .rectangle(width / 2, 350, 200, 48, 0x444466)
        .setInteractive({ useHandCursor: true })
        .setDepth(31);
      mapBg.setStrokeStyle(2, 0x666688);
      this.add
        .text(width / 2, 350, "Back to Map", {
          fontSize: "16px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#c0c0e0",
        })
        .setOrigin(0.5)
        .setDepth(32);

      retryBg.on("pointerdown", () => {
        this.partyHp = this.maxPartyHp;
        this.registry.set("partyHp", this.partyHp);
        const heroes = this.registry.get("partyHeroes") as Hero[];
        const healed = heroes.map((h) => ({ ...h, hp: h.maxHp }));
        this.registry.set("partyHeroes", healed);
        this.scene.restart();
      });

      mapBg.on("pointerdown", () => {
        this.partyHp = this.maxPartyHp;
        this.registry.set("partyHp", this.partyHp);
        const heroes = this.registry.get("partyHeroes") as Hero[];
        const healed = heroes.map((h) => ({ ...h, hp: h.maxHp }));
        this.registry.set("partyHeroes", healed);
        this.scene.start("MapScene");
      });
    });

    void overlay;
  }

  // ---------- Loot card ----------

  private showLootCard(
    loot: LootItem,
    width: number,
    _height: number,
    delay: number,
  ): void {
    const cardY = 330;

    // Card background
    const cardBg = this.add
      .rectangle(width / 2, cardY, 300, 90, 0x2a2040)
      .setStrokeStyle(2, 0xffc107)
      .setDepth(31)
      .setAlpha(0);

    // Loot icon area
    const iconBg = this.add
      .circle(width / 2 - 120, cardY, 20, 0xffc107)
      .setDepth(32)
      .setAlpha(0);
    const iconText = this.add
      .text(width / 2 - 120, cardY, "!", {
        fontSize: "20px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#2a2040",
      })
      .setOrigin(0.5)
      .setDepth(32)
      .setAlpha(0);

    // Loot name
    const nameText = this.add
      .text(width / 2 + 10, cardY - 16, loot.name, {
        fontSize: "15px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ffd700",
      })
      .setOrigin(0.5)
      .setDepth(32)
      .setAlpha(0);

    // Loot description
    const descText = this.add
      .text(width / 2 + 10, cardY + 4, loot.description, {
        fontSize: "11px",
        fontFamily: "sans-serif",
        color: "#c0b0d0",
        wordWrap: { width: 200 },
      })
      .setOrigin(0.5)
      .setDepth(32)
      .setAlpha(0);

    // Stat boost
    const stats: string[] = [];
    if (loot.statBoost.hp) stats.push(`+${loot.statBoost.hp} HP`);
    if (loot.statBoost.attack) stats.push(`+${loot.statBoost.attack} ATK`);
    const statText = this.add
      .text(width / 2 + 10, cardY + 22, stats.join("  "), {
        fontSize: "12px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#66ff66",
      })
      .setOrigin(0.5)
      .setDepth(32)
      .setAlpha(0);

    const lootElements = [cardBg, iconBg, iconText, nameText, descText, statText];
    this.tweens.add({
      targets: lootElements,
      alpha: 1,
      duration: 500,
      delay,
    });
  }

  // ---------- Return button ----------

  private showReturnButton(
    width: number,
    _height: number,
    delay: number,
  ): void {
    this.time.delayedCall(delay, () => {
      const btnBg = this.add
        .rectangle(width / 2, 440, 200, 48, 0x4caf50)
        .setInteractive({ useHandCursor: true })
        .setDepth(31);
      btnBg.setStrokeStyle(2, 0x66cc66);

      this.add
        .text(width / 2, 440, "Return to Map", {
          fontSize: "16px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setDepth(32);

      // Fade-in
      btnBg.setAlpha(0);
      this.tweens.add({
        targets: btnBg,
        alpha: 1,
        duration: 300,
      });

      btnBg.on("pointerdown", () => {
        this.scene.start("MapScene");
      });
    });
  }

  // ---------- HP bar updates ----------

  private updatePartyHpBar(isHit = false): void {
    if (!this.partyHpBar || !this.partyHpText) return;
    const { width } = this.scale;
    const barW = width - 40;
    const barX = 20;
    const ratio = Math.max(0, this.partyHp / this.maxPartyHp);
    const targetWidth = barW * ratio;

    // Briefly turn red on hit
    if (isHit) {
      this.partyHpBar.fill.setFillStyle(0xe53935);
      this.time.delayedCall(300, () => {
        this.partyHpBar?.fill.setFillStyle(0x4caf50);
      });
    }

    this.tweens.add({
      targets: this.partyHpBar.fill,
      displayWidth: Math.max(0, targetWidth),
      x: barX + targetWidth / 2,
      duration: 400,
      ease: "Power2",
    });

    this.partyHpText.setText(`${this.partyHp}/${this.maxPartyHp}`);
  }

  private updateEnemyHpBar(): void {
    if (!this.enemyHpBar) return;
    const { enemy } = this.battleState;
    const barW = 90;
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    const targetWidth = barW * ratio;

    this.tweens.add({
      targets: this.enemyHpBar.fill,
      displayWidth: Math.max(0, targetWidth),
      x: -(barW * (1 - ratio)) / 2,
      duration: 400,
      ease: "Power2",
    });

    // Update HP text label
    if (this.enemyHpLabel) {
      this.enemyHpLabel.setText(`${enemy.hp}/${enemy.maxHp}`);
    }
  }

  // ---------- Hero highlight ----------

  private highlightCurrentHero(): void {
    // Stop existing glow tweens to prevent stacking
    this.heroGlowTweens.forEach((t) => t.stop());
    this.heroGlowTweens = [];

    this.heroSprites.forEach((container, i) => {
      const isActive = i === this.battleState.currentHeroIndex;
      container.setAlpha(isActive ? 1 : 0.5);

      const glowRing = container.getAt(0) as Phaser.GameObjects.Arc;
      if (glowRing) {
        glowRing.setVisible(isActive);
        glowRing.setScale(1);
        glowRing.setAlpha(0.3);
        if (isActive) {
          const tween = this.tweens.add({
            targets: glowRing,
            scaleX: 1.3,
            scaleY: 1.3,
            alpha: 0.1,
            duration: 600,
            yoyo: true,
            repeat: -1,
          });
          this.heroGlowTweens.push(tween);
        }
      }
    });
  }

  // ---------- Ability animations ----------

  private showAbilityAnimation(
    result: AbilityResult,
    prevState: BattleState,
  ): void {
    const ability = result.ability;
    const hero = prevState.heroes[result.heroIndex];

    // Destroy any previous feedback
    if (this.feedbackContainer) {
      this.feedbackContainer.destroy();
      this.feedbackContainer = null;
    }

    // Ability name banner
    this.showAbilityNameBanner(ability.name, hero.color);

    // Camera flash in hero's color
    const c = Phaser.Display.Color.HexStringToColor(hero.color);
    this.cameras.main.flash(500, c.red, c.green, c.blue, false);

    // Hero charges forward (bigger lunge than normal)
    const hc = this.heroSprites[result.heroIndex];
    if (hc) {
      this.tweens.add({
        targets: hc,
        x: hc.x + 120,
        duration: 250,
        yoyo: true,
        ease: "Power3",
      });
    }

    // Type-specific effect
    this.time.delayedCall(300, () => {
      switch (ability.effectType) {
        case "damage_mult":
          this.abilityDamageMultEffect(result, hero);
          break;
        case "heal_party":
          this.abilityHealEffect(result);
          break;
        case "multi_hit":
          this.abilityMultiHitEffect(result, hero);
          break;
        case "shield_and_hit":
          this.abilityShieldEffect(result, hero);
          break;
      }
    });

    // Update UI after effects settle
    this.time.delayedCall(1000, () => {
      this.updateEnemyHpBar();
      this.updatePartyHpBar(false);
      this.updateAbilityPips();
      this.highlightCurrentHero();
    });

    // Advance battle
    this.time.delayedCall(2200, () => {
      this.advanceBattle();
    });
  }

  private showAbilityNameBanner(name: string, heroColor: string): void {
    const { width } = this.scale;

    const shadow = this.add
      .text(2, 2, name.toUpperCase(), {
        fontSize: "22px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#000000",
      })
      .setOrigin(0.5)
      .setAlpha(0.4);

    const text = this.add
      .text(0, 0, name.toUpperCase(), {
        fontSize: "22px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: heroColor,
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const banner = this.add
      .container(width / 2, 200, [shadow, text])
      .setDepth(25)
      .setScale(0.3)
      .setAlpha(0);

    // Bounce in
    this.tweens.add({
      targets: banner,
      scaleX: 1.2,
      scaleY: 1.2,
      alpha: 1,
      duration: 300,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          scaleX: 1,
          scaleY: 1,
          duration: 150,
        });
      },
    });

    // Fade out
    this.tweens.add({
      targets: banner,
      alpha: 0,
      y: 190,
      duration: 400,
      delay: 1400,
      onComplete: () => banner.destroy(),
    });
  }

  private abilityDamageMultEffect(result: AbilityResult, hero: Hero): void {
    const { width } = this.scale;
    const ex = width - 90;
    const ey = 120;
    const heroColor = Phaser.Display.Color.HexStringToColor(hero.color).color;

    // Slash lines across enemy
    for (let i = 0; i < 3; i++) {
      const slash = this.add.graphics().setDepth(22);
      const angle = -Math.PI / 3 + (i * Math.PI) / 3;
      const len = 70;
      const x1 = ex + Math.cos(angle) * len;
      const y1 = ey + Math.sin(angle) * len;
      const x2 = ex - Math.cos(angle) * len;
      const y2 = ey - Math.sin(angle) * len;

      // Glow line
      slash.lineStyle(10, heroColor, 0.3);
      slash.beginPath();
      slash.moveTo(x1, y1);
      slash.lineTo(x2, y2);
      slash.strokePath();

      // Sharp line
      slash.lineStyle(3, 0xffffff, 0.9);
      slash.beginPath();
      slash.moveTo(x1, y1);
      slash.lineTo(x2, y2);
      slash.strokePath();

      this.tweens.add({
        targets: slash,
        alpha: 0,
        duration: 500,
        delay: i * 80,
        onComplete: () => slash.destroy(),
      });
    }

    // Spark particles
    for (let p = 0; p < 12; p++) {
      const angle = (p / 12) * Math.PI * 2;
      const spark = this.add.circle(ex, ey, 3, heroColor).setDepth(22);
      this.tweens.add({
        targets: spark,
        x: ex + Math.cos(angle) * 70,
        y: ey + Math.sin(angle) * 70,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 450,
        onComplete: () => spark.destroy(),
      });
    }

    // Enemy violent shake + flash
    if (this.enemyContainer) {
      this.tweens.add({
        targets: this.enemyContainer,
        x: this.enemyContainer.x + 12,
        duration: 35,
        yoyo: true,
        repeat: 8,
      });
      this.tweens.add({
        targets: this.enemyContainer,
        alpha: 0.3,
        duration: 80,
        yoyo: true,
        repeat: 2,
      });
    }

    // Big floating damage number
    const dmgText = this.add
      .text(ex, ey - 50, `-${result.damageDealt}`, {
        fontSize: "28px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ff4444",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(25);

    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 50,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 1000,
      ease: "Power2",
      onComplete: () => dmgText.destroy(),
    });
  }

  private abilityHealEffect(result: AbilityResult): void {
    const { width } = this.scale;
    const ex = width - 90;
    const ey = 120;

    // Normal damage on enemy
    if (this.enemyContainer) {
      this.tweens.add({
        targets: this.enemyContainer,
        x: this.enemyContainer.x + 8,
        duration: 40,
        yoyo: true,
        repeat: 4,
      });
    }

    // Damage number on enemy
    const dmgText = this.add
      .text(ex, ey - 40, `-${result.damageDealt}`, {
        fontSize: "22px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ff4444",
      })
      .setOrigin(0.5)
      .setDepth(25);

    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 40,
      alpha: 0,
      duration: 800,
      onComplete: () => dmgText.destroy(),
    });

    // Rising heal particles
    for (let i = 0; i < 12; i++) {
      const px = 20 + Math.random() * (width - 40);
      const py = 140 + Math.random() * 20;
      const size = 3 + Math.random() * 4;
      const clr = Math.random() > 0.5 ? 0x4caf50 : 0x81c784;
      const circle = this.add.circle(px, py, size, clr, 0.7).setDepth(22);

      this.tweens.add({
        targets: circle,
        y: py - 60 - Math.random() * 50,
        alpha: 0,
        duration: 700 + Math.random() * 400,
        delay: Math.random() * 300,
        ease: "Sine.easeOut",
        onComplete: () => circle.destroy(),
      });
    }

    // Party HP bar bright green flash
    if (this.partyHpBar) {
      this.partyHpBar.fill.setFillStyle(0x66ff66);
      this.time.delayedCall(700, () => {
        this.partyHpBar?.fill.setFillStyle(0x4caf50);
      });
    }

    // Floating heal number
    const healAmount = result.healAmount ?? 0;
    if (healAmount > 0) {
      const healText = this.add
        .text(width / 2, 34, `+${healAmount} HP`, {
          fontSize: "20px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#66ff66",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(25);

      this.tweens.add({
        targets: healText,
        y: healText.y - 35,
        alpha: 0,
        duration: 1200,
        ease: "Power2",
        onComplete: () => healText.destroy(),
      });
    }
  }

  private abilityMultiHitEffect(result: AbilityResult, hero: Hero): void {
    const { width } = this.scale;
    const ex = width - 90;
    const ey = 120;
    const heroColor = Phaser.Display.Color.HexStringToColor(hero.color).color;
    const startX = this.heroSprites[result.heroIndex]?.x ?? 60;
    const startY = 120;

    const hits = Math.floor(result.ability.effectValue);
    const perHit = Math.floor(result.damageDealt / hits);

    for (let h = 0; h < hits; h++) {
      this.time.delayedCall(h * 180, () => {
        // Arrow projectile
        const arrow = this.add
          .circle(startX + 30, startY, 4, heroColor)
          .setDepth(22);

        // Trail
        const trail = this.add
          .circle(startX + 30, startY, 3, heroColor, 0.3)
          .setDepth(21);

        this.tweens.add({
          targets: arrow,
          x: ex,
          y: ey,
          duration: 180,
          ease: "Power2",
          onComplete: () => {
            arrow.destroy();

            // Impact flash
            const impact = this.add
              .circle(ex, ey, 8, 0xffffff, 0.6)
              .setDepth(22);
            this.tweens.add({
              targets: impact,
              scaleX: 2,
              scaleY: 2,
              alpha: 0,
              duration: 200,
              onComplete: () => impact.destroy(),
            });

            // Small enemy shake
            if (this.enemyContainer) {
              this.tweens.add({
                targets: this.enemyContainer,
                x: this.enemyContainer.x + 6,
                duration: 30,
                yoyo: true,
                repeat: 2,
              });
            }

            // Mini damage number
            const offsetX = (Math.random() - 0.5) * 40;
            const miniDmg = this.add
              .text(ex + offsetX, ey - 30, `-${perHit}`, {
                fontSize: "15px",
                fontFamily: "sans-serif",
                fontStyle: "bold",
                color: "#ffcc44",
              })
              .setOrigin(0.5)
              .setDepth(25);

            this.tweens.add({
              targets: miniDmg,
              y: miniDmg.y - 25,
              alpha: 0,
              duration: 500,
              onComplete: () => miniDmg.destroy(),
            });
          },
        });

        // Trail follows behind
        this.tweens.add({
          targets: trail,
          x: ex,
          y: ey,
          alpha: 0,
          duration: 250,
          onComplete: () => trail.destroy(),
        });
      });
    }
  }

  private abilityShieldEffect(result: AbilityResult, hero: Hero): void {
    const { width } = this.scale;
    const ex = width - 90;
    const ey = 120;
    const heroColor = Phaser.Display.Color.HexStringToColor(hero.color).color;

    // Golden shield ring around heroes
    const shieldX = width * 0.25;
    const shieldY = 120;

    const ring = this.add.graphics().setDepth(22);
    ring.lineStyle(3, heroColor, 0.8);
    ring.strokeCircle(shieldX, shieldY, 10);

    this.tweens.add({
      targets: ring,
      scaleX: 6,
      scaleY: 6,
      duration: 400,
      ease: "Power2",
    });

    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 500,
      delay: 700,
      onComplete: () => ring.destroy(),
    });

    // Inner glow
    const glow = this.add
      .circle(shieldX, shieldY, 50, heroColor, 0.15)
      .setDepth(21);

    this.tweens.add({
      targets: glow,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 800,
      delay: 400,
      onComplete: () => glow.destroy(),
    });

    // Enemy hit
    this.time.delayedCall(200, () => {
      if (this.enemyContainer) {
        this.tweens.add({
          targets: this.enemyContainer,
          x: this.enemyContainer.x + 10,
          duration: 35,
          yoyo: true,
          repeat: 6,
        });
        this.tweens.add({
          targets: this.enemyContainer,
          alpha: 0.4,
          duration: 100,
          yoyo: true,
          repeat: 1,
        });
      }

      // Damage number
      const dmgText = this.add
        .text(ex, ey - 45, `-${result.damageDealt}`, {
          fontSize: "26px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#ff4444",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(25);

      this.tweens.add({
        targets: dmgText,
        y: dmgText.y - 45,
        alpha: 0,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 900,
        ease: "Power2",
        onComplete: () => dmgText.destroy(),
      });
    });
  }

  private updateAbilityPips(): void {
    this.battleState.heroes.forEach((hero, i) => {
      const ability = HERO_ABILITIES[hero.name];
      if (!ability || !this.abilityPips[i]) return;

      const heroColor = Phaser.Display.Color.HexStringToColor(hero.color).color;
      for (let p = 0; p < ability.maxCharges; p++) {
        const pip = this.abilityPips[i]?.[p];
        if (!pip) continue;
        const filled = p < hero.abilityCharge;
        pip.setFillStyle(filled ? heroColor : 0x333355);
        pip.setStrokeStyle(
          1,
          filled ? 0xffffff : 0x555577,
          filled ? 0.8 : 0.3,
        );

        // Small pulse when filled
        if (filled) {
          this.tweens.add({
            targets: pip,
            scaleX: 1.5,
            scaleY: 1.5,
            duration: 150,
            yoyo: true,
          });
        }
      }
    });
  }
}
