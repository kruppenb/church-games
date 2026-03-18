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

    // Background
    this.cameras.main.setBackgroundColor("#fafafa");

    // Title
    this.add
      .text(width / 2, 20, "Build Your Team!", {
        fontSize: "24px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#212121",
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width / 2, 50, "Choose 3 heroes for your quest", {
        fontSize: "13px",
        fontFamily: "sans-serif",
        color: "#616161",
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
    // Card background
    const bg = this.add
      .rectangle(x, y, w, h, 0xffffff)
      .setStrokeStyle(2, 0xe0e0e0)
      .setInteractive({ useHandCursor: true });

    // Hero circle
    const circle = this.add.circle(x, y - 22, 20, opt.color);

    // Name
    const nameText = this.add
      .text(x, y + 8, opt.name, {
        fontSize: "13px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#212121",
      })
      .setOrigin(0.5, 0);

    // Stats
    const statsText = this.add
      .text(x, y + 24, `HP: ${opt.stats.hp}  ATK: ${opt.stats.atk}`, {
        fontSize: "10px",
        fontFamily: "sans-serif",
        color: "#616161",
      })
      .setOrigin(0.5, 0);

    // Ability name
    const ability = HERO_ABILITIES[opt.name];
    const abilityText = this.add
      .text(x, y + 38, ability ? ability.name : "", {
        fontSize: "8px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#9C27B0",
      })
      .setOrigin(0.5, 0);

    // Selection indicator (check mark circle)
    const check = this.add
      .circle(x + w / 2 - 16, y - h / 2 + 16, 10, 0x4caf50)
      .setVisible(false);
    const checkMark = this.add
      .text(x + w / 2 - 16, y - h / 2 + 16, "✓", {
        fontSize: "14px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setVisible(false);

    bg.on("pointerdown", () => {
      if (this.selected.has(opt.name)) {
        // Deselect
        this.selected.delete(opt.name);
        bg.setStrokeStyle(2, 0xe0e0e0);
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
      bg.setFillStyle(0xf5f5f5);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(0xffffff);
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
      .rectangle(0, 0, 200, 48, 0x4caf50, 1)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(0, 0, "Start Quest!", {
        fontSize: "18px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label]);

    bg.on("pointerdown", () => {
      this.startQuest();
    });

    bg.on("pointerover", () => {
      bg.setFillStyle(0x388e3c);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(0x4caf50);
    });

    return container;
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
