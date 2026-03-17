import Phaser from "phaser";
import type { LessonConfig, StoryScene } from "@/types/lesson";
import {
  createEnemy,
  rollRandomEvent,
  applyRandomEvent,
  type RPGState,
  type Hero,
  type LootItem,
} from "../logic/rpg-logic";
import type { Difficulty } from "@/hooks/useDifficulty";

interface NodeInfo {
  x: number;
  y: number;
  scene: StoryScene;
  index: number;
}

export class MapScene extends Phaser.Scene {
  private locationsCleared: boolean[] = [];
  private nodeGraphics: Phaser.GameObjects.Container[] = [];
  private progressText: Phaser.GameObjects.Text | null = null;
  private eventOverlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: "MapScene" });
  }

  create(): void {
    const { width, height } = this.scale;

    // Dark parchment background
    this.cameras.main.setBackgroundColor("#2a1f14");

    // Subtle parchment texture lines
    this.drawParchmentTexture(width, height);

    const lesson = this.registry.get("lesson") as LessonConfig | undefined;
    const scenes = lesson?.story?.scenes ?? [];

    // Initialize cleared tracking if not already set
    if (
      !this.registry.has("locationsCleared") ||
      (this.registry.get("locationsCleared") as boolean[]).length !==
        scenes.length
    ) {
      this.locationsCleared = scenes.map(() => false);
      this.registry.set("locationsCleared", this.locationsCleared);
    } else {
      this.locationsCleared = this.registry.get(
        "locationsCleared",
      ) as boolean[];
    }

    // Title in gold
    this.add
      .text(width / 2, 24, "Quest Map", {
        fontSize: "26px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#d4a847",
      })
      .setOrigin(0.5, 0);

    // Decorative line under title
    const titleLine = this.add.graphics();
    titleLine.lineStyle(2, 0xd4a847, 0.5);
    titleLine.moveTo(width / 2 - 80, 56);
    titleLine.lineTo(width / 2 + 80, 56);
    titleLine.strokePath();

    // Progress text in gold
    const cleared = this.locationsCleared.filter((c) => c).length;
    this.progressText = this.add
      .text(width / 2, 64, `${cleared}/${scenes.length} locations cleared`, {
        fontSize: "13px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#b8943e",
      })
      .setOrigin(0.5, 0);

    // Check if quest is complete
    if (cleared === scenes.length && scenes.length > 0) {
      this.showQuestComplete();
      return;
    }

    // Layout and draw nodes
    const nodes = this.layoutNodes(scenes, width, height);
    this.drawPaths(nodes);

    this.nodeGraphics = [];
    nodes.forEach((node) => {
      const container = this.createNode(node);
      this.nodeGraphics.push(container);
    });

    // Party status bar at bottom
    this.drawPartyStatusBar(width, height);

    // Check for random event after returning from a victorious battle
    this.checkRandomEvent();
  }

  // ---------- Parchment texture ----------

  private drawParchmentTexture(width: number, height: number): void {
    const gfx = this.add.graphics();

    // Subtle horizontal lines like parchment grain
    gfx.lineStyle(1, 0x3d2e1a, 0.15);
    for (let y = 0; y < height; y += 12) {
      const wobble = Math.sin(y * 0.1) * 3;
      gfx.beginPath();
      gfx.moveTo(0, y + wobble);
      gfx.lineTo(width, y + wobble * 0.5);
      gfx.strokePath();
    }

    // Vignette corners (dark rectangles with gradient feel)
    gfx.fillStyle(0x1a1108, 0.3);
    gfx.fillRect(0, 0, width, 8);
    gfx.fillRect(0, height - 8, width, 8);
    gfx.fillRect(0, 0, 8, height);
    gfx.fillRect(width - 8, 0, 8, height);

    // Border frame
    gfx.lineStyle(2, 0x5a4430, 0.4);
    gfx.strokeRect(4, 4, width - 8, height - 8);
  }

  // ---------- Node layout ----------

  private layoutNodes(
    scenes: StoryScene[],
    width: number,
    height: number,
  ): NodeInfo[] {
    const count = scenes.length;
    if (count === 0) return [];

    const marginTop = 100;
    const marginBottom = 100;
    const usableHeight = height - marginTop - marginBottom;
    const yStep = count > 1 ? usableHeight / (count - 1) : 0;

    return scenes.map((scene, i) => {
      // Zigzag pattern
      const xOffset = i % 2 === 0 ? -70 : 70;
      return {
        x: width / 2 + xOffset,
        y: marginTop + i * yStep,
        scene,
        index: i,
      };
    });
  }

  // ---------- Dotted gold paths ----------

  private drawPaths(nodes: NodeInfo[]): void {
    const graphics = this.add.graphics();

    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];

      // Dotted gold line
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dotSpacing = 8;
      const steps = Math.floor(dist / dotSpacing);

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = a.x + dx * t;
        const py = a.y + dy * t;

        // Alternate dot sizes for visual interest
        const dotSize = s % 3 === 0 ? 2.5 : 1.5;
        const alpha = s % 3 === 0 ? 0.7 : 0.4;

        graphics.fillStyle(0xd4a847, alpha);
        graphics.fillCircle(px, py, dotSize);
      }
    }
  }

  // ---------- Node creation ----------

  private createNode(node: NodeInfo): Phaser.GameObjects.Container {
    const cleared = this.locationsCleared[node.index];
    const radius = 32;

    const elements: Phaser.GameObjects.GameObject[] = [];

    if (!cleared) {
      // Glow ring for unvisited — pulsing gold
      const glow = this.add.circle(0, 0, radius + 8, 0xd4a847, 0.2);
      this.tweens.add({
        targets: glow,
        scaleX: 1.35,
        scaleY: 1.35,
        alpha: 0,
        duration: 1400,
        repeat: -1,
        yoyo: true,
        ease: "Sine.easeInOut",
      });
      elements.push(glow);
    }

    // Node circle
    const circleColor = cleared ? 0x3d2e1a : 0xd4a847;
    const circle = this.add.circle(0, 0, radius, circleColor);
    circle.setStrokeStyle(2, cleared ? 0x5a4430 : 0xffd700, cleared ? 0.5 : 1);
    elements.push(circle);

    if (cleared) {
      // Checkmark for cleared nodes
      const checkGfx = this.add.graphics();
      checkGfx.lineStyle(3, 0x7a7a60, 1);
      checkGfx.beginPath();
      checkGfx.moveTo(-8, 0);
      checkGfx.lineTo(-2, 8);
      checkGfx.lineTo(10, -6);
      checkGfx.strokePath();
      elements.push(checkGfx);
    } else {
      // Node number in white
      const numText = this.add
        .text(0, 0, `${node.index + 1}`, {
          fontSize: "18px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#2a1f14",
        })
        .setOrigin(0.5);
      elements.push(numText);
    }

    // Title label below
    const titleColor = cleared ? "#7a6a55" : "#e8d5a8";
    const titleText = this.add
      .text(0, radius + 14, node.scene.title, {
        fontSize: "12px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: titleColor,
        align: "center",
        wordWrap: { width: 130 },
      })
      .setOrigin(0.5, 0);
    elements.push(titleText);

    const container = this.add.container(node.x, node.y, elements);

    if (!cleared) {
      circle.setInteractive({ useHandCursor: true });

      circle.on("pointerdown", () => {
        this.enterBattle(node);
      });

      circle.on("pointerover", () => {
        circle.setFillStyle(0xc49530);
        this.tweens.add({
          targets: container,
          scaleX: 1.08,
          scaleY: 1.08,
          duration: 120,
        });
      });
      circle.on("pointerout", () => {
        circle.setFillStyle(0xd4a847);
        this.tweens.add({
          targets: container,
          scaleX: 1,
          scaleY: 1,
          duration: 120,
        });
      });
    }

    return container;
  }

  // ---------- Enter battle ----------

  private enterBattle(node: NodeInfo): void {
    const difficulty =
      (this.registry.get("difficulty") as Difficulty) ?? "little-kids";
    const enemy = createEnemy(node.scene.title, difficulty);

    this.registry.set("currentLocationIndex", node.index);
    this.registry.set("battleEnemy", enemy);
    this.registry.set("battleQuestionIds", node.scene.questionIds);

    this.scene.start("BattleScene");
  }

  // ---------- Random event ----------

  private checkRandomEvent(): void {
    const lastLocation = this.registry.get("currentLocationIndex") as
      | number
      | undefined;
    if (lastLocation === undefined) return;

    if (!this.locationsCleared[lastLocation]) return;

    this.registry.remove("currentLocationIndex");

    const event = rollRandomEvent();
    if (!event) return;

    const heroes = this.registry.get("partyHeroes") as Hero[];
    const partyHp =
      (this.registry.get("partyHp") as number) ??
      heroes.reduce((s, h) => s + h.hp, 0);
    const maxPartyHp =
      (this.registry.get("maxPartyHp") as number) ?? partyHp;

    const tempState: RPGState = {
      heroes: heroes.map((h) => ({ ...h })),
      locationsCleared: this.locationsCleared,
      totalLocations: this.locationsCleared.length,
      currentLocation: null,
      partyHp,
      maxPartyHp,
      loot: [],
    };

    const newState = applyRandomEvent(tempState, event);

    this.registry.set("partyHeroes", newState.heroes);
    this.registry.set("partyHp", newState.partyHp);
    this.registry.set("maxPartyHp", newState.maxPartyHp);

    this.showEventOverlay(event);
  }

  private showEventOverlay(event: {
    text: string;
    effect: string;
    value: number;
  }): void {
    const { width, height } = this.scale;
    const cy = height / 2;

    // Semi-transparent backdrop
    const backdrop = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.5)
      .setDepth(10);

    // Event card
    const isGood = event.effect !== "damage";
    const borderColor = isGood ? 0xd4a847 : 0xe53935;

    const cardBg = this.add
      .rectangle(width / 2, cy, 320, 140, 0x3d2e1a)
      .setStrokeStyle(3, borderColor)
      .setDepth(11);

    // Event icon
    const iconMap: Record<string, string> = {
      heal: "+",
      damage: "!",
      boost: "*",
    };
    const iconColorMap: Record<string, string> = {
      heal: "#4CAF50",
      damage: "#E53935",
      boost: "#FFD700",
    };

    const iconCircle = this.add
      .circle(width / 2, cy - 38, 20, isGood ? 0x4caf50 : 0xe53935, 0.3)
      .setDepth(12);

    const icon = this.add
      .text(width / 2, cy - 38, iconMap[event.effect] ?? "?", {
        fontSize: "28px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: iconColorMap[event.effect] ?? "#e8d5a8",
      })
      .setOrigin(0.5)
      .setDepth(12);

    // Event text
    const eventText = this.add
      .text(width / 2, cy + 6, event.text, {
        fontSize: "14px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#e8d5a8",
        align: "center",
        wordWrap: { width: 280 },
      })
      .setOrigin(0.5)
      .setDepth(12);

    // Value text
    const prefix = event.effect === "damage" ? "-" : "+";
    const suffix = event.effect === "boost" ? " ATK" : " HP";
    const valueText = this.add
      .text(width / 2, cy + 40, `${prefix}${event.value}${suffix}`, {
        fontSize: "18px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: iconColorMap[event.effect] ?? "#e8d5a8",
      })
      .setOrigin(0.5)
      .setDepth(12);

    this.eventOverlay = this.add
      .container(0, 0, [
        backdrop,
        cardBg,
        iconCircle,
        icon,
        eventText,
        valueText,
      ])
      .setDepth(10);

    // Fade in
    this.eventOverlay.setAlpha(0);
    this.tweens.add({
      targets: this.eventOverlay,
      alpha: 1,
      duration: 400,
    });

    // Auto-dismiss after 2.5 seconds
    this.time.delayedCall(2500, () => {
      if (this.eventOverlay) {
        this.tweens.add({
          targets: this.eventOverlay,
          alpha: 0,
          duration: 400,
          onComplete: () => {
            this.eventOverlay?.destroy();
            this.eventOverlay = null;
          },
        });
      }
    });
  }

  // ---------- Party status bar at bottom ----------

  private drawPartyStatusBar(width: number, height: number): void {
    const barY = height - 50;

    // Background bar
    this.add
      .rectangle(width / 2, barY + 8, width - 16, 40, 0x1a1108, 0.7)
      .setStrokeStyle(1, 0x5a4430, 0.5);

    // Party HP
    const partyHp = (this.registry.get("partyHp") as number) ?? 0;
    const maxPartyHp = (this.registry.get("maxPartyHp") as number) ?? 1;

    // HP icon
    this.add
      .text(20, barY + 2, "HP", {
        fontSize: "10px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#d4a847",
      })
      .setOrigin(0, 0);

    // Mini HP bar
    const hpBarW = 80;
    const hpBarH = 8;
    this.add.rectangle(20 + 24 + hpBarW / 2, barY + 8, hpBarW, hpBarH, 0x3d2e1a);
    const hpRatio = Math.max(0, partyHp / maxPartyHp);
    this.add.rectangle(
      20 + 24 + (hpBarW * hpRatio) / 2,
      barY + 8,
      hpBarW * hpRatio,
      hpBarH,
      0x4caf50,
    );
    this.add
      .text(20 + 24 + hpBarW + 6, barY + 8, `${partyHp}/${maxPartyHp}`, {
        fontSize: "9px",
        fontFamily: "sans-serif",
        color: "#b8943e",
      })
      .setOrigin(0, 0.5);

    // Collected loot icons on the right side
    const collectedLoot =
      (this.registry.get("collectedLoot") as LootItem[] | undefined) ?? [];
    const lootStartX = width - 20;
    collectedLoot.forEach((loot, i) => {
      const lx = lootStartX - i * 28;
      // Small loot badge
      this.add
        .circle(lx, barY + 8, 10, 0xd4a847, 0.4)
        .setStrokeStyle(1, 0xffd700, 0.6);
      this.add
        .text(lx, barY + 8, loot.name.charAt(0), {
          fontSize: "10px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#ffd700",
        })
        .setOrigin(0.5);
    });
  }

  // ---------- Quest Complete ----------

  private showQuestComplete(): void {
    const { width, height } = this.scale;
    const cy = height / 2;

    // Gold "Quest Complete!" with star rating
    const completeText = this.add
      .text(width / 2, cy - 80, "Quest Complete!", {
        fontSize: "34px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#ffd700",
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(0.5);

    this.tweens.add({
      targets: completeText,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 600,
      ease: "Back.easeOut",
    });

    // Star rating — 3 stars if no retries needed
    // (We don't track retries globally, so give 3 stars for completing all)
    const starY = cy - 30;
    for (let s = 0; s < 3; s++) {
      const starText = this.add
        .text(width / 2 - 50 + s * 50, starY, "★", {
          fontSize: "32px",
          fontFamily: "sans-serif",
          color: "#ffd700",
        })
        .setOrigin(0.5)
        .setAlpha(0);

      this.tweens.add({
        targets: starText,
        alpha: 1,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 300,
        delay: 500 + s * 200,
        yoyo: true,
        hold: 100,
        onYoyo: () => {
          starText.setScale(1);
        },
      });
    }

    // Subtitle
    this.add
      .text(width / 2, cy + 10, "Your team conquered every location!", {
        fontSize: "15px",
        fontFamily: "sans-serif",
        color: "#b8943e",
      })
      .setOrigin(0.5);

    // Show all collected loot
    const collectedLoot =
      (this.registry.get("collectedLoot") as LootItem[] | undefined) ?? [];
    if (collectedLoot.length > 0) {
      this.add
        .text(width / 2, cy + 40, "Loot Collected:", {
          fontSize: "12px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#d4a847",
        })
        .setOrigin(0.5);

      collectedLoot.forEach((loot, i) => {
        const ly = cy + 60 + i * 20;
        const stats: string[] = [];
        if (loot.statBoost.hp) stats.push(`+${loot.statBoost.hp} HP`);
        if (loot.statBoost.attack) stats.push(`+${loot.statBoost.attack} ATK`);
        this.add
          .text(
            width / 2,
            ly,
            `${loot.name}  ${stats.join(" ")}`,
            {
              fontSize: "11px",
              fontFamily: "sans-serif",
              color: "#e8d5a8",
            },
          )
          .setOrigin(0.5);
      });
    }

    // Play Again button
    const btnY = Math.min(cy + 70 + collectedLoot.length * 20 + 30, height - 60);
    const btnBg = this.add
      .rectangle(width / 2, btnY, 200, 48, 0xd4a847)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, 0xffd700);
    this.add
      .text(width / 2, btnY, "Play Again", {
        fontSize: "16px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#2a1f14",
      })
      .setOrigin(0.5);

    btnBg.on("pointerdown", () => {
      this.registry.remove("locationsCleared");
      this.registry.remove("partyHp");
      this.registry.remove("maxPartyHp");
      this.registry.remove("collectedLoot");
      this.scene.start("TeamSelectScene");
    });
  }
}
