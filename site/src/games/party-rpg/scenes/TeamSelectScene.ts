import Phaser from "phaser";
import { createHero, HERO_ABILITIES, type Hero } from "../logic/rpg-logic";

interface HeroOption {
  name: string;
  color: number;
  colorHex: string;
  stats: { hp: number; atk: number };
}

const HERO_OPTIONS: HeroOption[] = [
  { name: "Warrior", color: 0xe53935, colorHex: "#E53935", stats: { hp: 120, atk: 25 } },
  { name: "Mage", color: 0x1e88e5, colorHex: "#1E88E5", stats: { hp: 80, atk: 35 } },
  { name: "Healer", color: 0x43a047, colorHex: "#43A047", stats: { hp: 100, atk: 15 } },
  { name: "Ranger", color: 0x795548, colorHex: "#795548", stats: { hp: 90, atk: 30 } },
  { name: "Paladin", color: 0xffc107, colorHex: "#FFC107", stats: { hp: 130, atk: 20 } },
  { name: "Rogue", color: 0x8e24aa, colorHex: "#8E24AA", stats: { hp: 85, atk: 32 } },
];

const MAX_PARTY_SIZE = 3;

export class TeamSelectScene extends Phaser.Scene {
  private selected: Set<string> = new Set();
  private startButton: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: "TeamSelectScene" });
  }

  create(): void {
    const { width, height } = this.scale;

    // Dark parchment background matching MapScene
    this.cameras.main.setBackgroundColor("#2a1f14");
    this.drawParchmentTexture(width, height);

    // Title in gold
    this.add
      .text(width / 2, 20, "Build Your Team!", {
        fontSize: "24px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#d4a847",
      })
      .setOrigin(0.5, 0);

    // Decorative line under title
    const titleLine = this.add.graphics();
    titleLine.lineStyle(2, 0xd4a847, 0.5);
    titleLine.moveTo(width / 2 - 80, 50);
    titleLine.lineTo(width / 2 + 80, 50);
    titleLine.strokePath();

    this.add
      .text(width / 2, 58, "Choose 3 heroes for your quest", {
        fontSize: "13px",
        fontFamily: "sans-serif",
        color: "#b8943e",
      })
      .setOrigin(0.5, 0);

    // Layout: 2 rows of 3
    const cols = 3;
    const cardW = 110;
    const cardH = 120;
    const gapX = 14;
    const gapY = 14;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (width - totalW) / 2 + cardW / 2;
    const startY = 140;

    HERO_OPTIONS.forEach((opt, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);

      this.createHeroCard(cx, cy, opt, cardW, cardH);
    });

    // "Start Quest!" button (initially hidden)
    this.startButton = this.createStartButton(width / 2, height - 50);
    this.startButton.setVisible(false);
  }

  private createHeroCard(
    x: number,
    y: number,
    opt: HeroOption,
    w: number,
    h: number,
  ): void {
    // Card background — dark parchment card
    const bg = this.add
      .rectangle(x, y, w, h, 0x3d2e1a)
      .setStrokeStyle(2, 0x5a4430)
      .setInteractive({ useHandCursor: true });

    // Hero circle
    const circle = this.add.circle(x, y - 22, 20, opt.color);

    // Name
    const nameText = this.add
      .text(x, y + 8, opt.name, {
        fontSize: "13px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#e8d5a8",
      })
      .setOrigin(0.5, 0);

    // Stats
    const statsText = this.add
      .text(x, y + 24, `HP: ${opt.stats.hp}  ATK: ${opt.stats.atk}`, {
        fontSize: "10px",
        fontFamily: "sans-serif",
        color: "#b8943e",
      })
      .setOrigin(0.5, 0);

    // Ability name
    const ability = HERO_ABILITIES[opt.name];
    const abilityText = this.add
      .text(x, y + 38, ability ? ability.name : "", {
        fontSize: "8px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#d4a847",
      })
      .setOrigin(0.5, 0);

    // Selection indicator (check mark circle)
    const check = this.add
      .circle(x + w / 2 - 16, y - h / 2 + 16, 10, 0xd4a847)
      .setVisible(false);
    const checkMark = this.add
      .text(x + w / 2 - 16, y - h / 2 + 16, "✓", {
        fontSize: "14px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#2a1f14",
      })
      .setOrigin(0.5)
      .setVisible(false);

    bg.on("pointerdown", () => {
      if (this.selected.has(opt.name)) {
        // Deselect
        this.selected.delete(opt.name);
        bg.setStrokeStyle(2, 0x5a4430);
        check.setVisible(false);
        checkMark.setVisible(false);
      } else if (this.selected.size < MAX_PARTY_SIZE) {
        // Select
        this.selected.add(opt.name);
        bg.setStrokeStyle(3, opt.color);
        check.setVisible(true);
        checkMark.setVisible(true);
      }

      // Show/hide start button
      this.startButton?.setVisible(this.selected.size === MAX_PARTY_SIZE);
    });

    // Hover effects
    bg.on("pointerover", () => {
      bg.setFillStyle(0x4a3a26);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(0x3d2e1a);
    });

    // Prevent unused variable warnings
    void circle;
    void nameText;
    void statsText;
    void abilityText;
  }

  private createStartButton(
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const bg = this.add
      .rectangle(0, 0, 200, 48, 0xd4a847, 1)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(0, 0, "Start Quest!", {
        fontSize: "18px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#2a1f14",
      })
      .setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label]);

    bg.on("pointerdown", () => {
      this.startQuest();
    });

    bg.on("pointerover", () => {
      bg.setFillStyle(0xc49530);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(0xd4a847);
    });

    return container;
  }

  private drawParchmentTexture(width: number, height: number): void {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x3d2e1a, 0.15);
    for (let y = 0; y < height; y += 12) {
      const wobble = Math.sin(y * 0.1) * 3;
      gfx.beginPath();
      gfx.moveTo(0, y + wobble);
      gfx.lineTo(width, y + wobble * 0.5);
      gfx.strokePath();
    }
    gfx.fillStyle(0x1a1108, 0.3);
    gfx.fillRect(0, 0, width, 8);
    gfx.fillRect(0, height - 8, width, 8);
    gfx.fillRect(0, 0, 8, height);
    gfx.fillRect(width - 8, 0, 8, height);
    gfx.lineStyle(2, 0x5a4430, 0.4);
    gfx.strokeRect(4, 4, width - 8, height - 8);
  }

  private startQuest(): void {
    const heroes: Hero[] = [];
    for (const opt of HERO_OPTIONS) {
      if (this.selected.has(opt.name)) {
        heroes.push(createHero(opt.name, opt.colorHex));
      }
    }

    this.registry.set("partyHeroes", heroes);
    this.scene.start("MapScene");
  }
}
