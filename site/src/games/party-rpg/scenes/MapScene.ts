import Phaser from "phaser";
import type { LessonConfig, StoryScene } from "@/types/lesson";
import { saveScore } from "@/lib/score-store";
import {
  createEnemy,
  createBossEnemy,
  rollRandomEvent,
  applyRandomEvent,
  applyEventChoice,
  getLootRarity,
  RARITY_COLORS,
  RARITY_LABELS,
  type RPGState,
  type Hero,
  type LootItem,
  type RandomEvent,
  type EventChoice,
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
  private playerToken: Phaser.GameObjects.Container | null = null;
  private cachedNodes: NodeInfo[] = [];

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
    this.cachedNodes = nodes;
    this.drawPaths(nodes);

    this.nodeGraphics = [];
    nodes.forEach((node) => {
      const container = this.createNode(node);
      this.nodeGraphics.push(container);
    });

    // Draw player token at current position
    this.drawPlayerToken(nodes);

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

    const marginTop = 110;
    const marginBottom = 150;
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

  // ---------- Player token ----------

  private drawPlayerToken(nodes: NodeInfo[]): void {
    // Find current position: last cleared node, or first node
    let posIndex = -1;
    for (let i = this.locationsCleared.length - 1; i >= 0; i--) {
      if (this.locationsCleared[i]) {
        posIndex = i;
        break;
      }
    }

    // If nothing cleared, place token at first node
    const targetNode = posIndex >= 0 ? nodes[posIndex] : nodes[0];
    if (!targetNode) return;

    // Small golden circle with a flag icon
    const tokenCircle = this.add.circle(0, 0, 12, 0xffd700).setStrokeStyle(2, 0xd4a847);
    const tokenFlag = this.add
      .text(0, -1, "\u2691", {
        fontSize: "14px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#2a1f14",
      })
      .setOrigin(0.5);

    this.playerToken = this.add
      .container(targetNode.x, targetNode.y - 28, [tokenCircle, tokenFlag])
      .setDepth(8);

    // Gentle floating animation
    this.tweens.add({
      targets: this.playerToken,
      y: this.playerToken.y - 4,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  // ---------- Node creation ----------

  private createNode(node: NodeInfo): Phaser.GameObjects.Container {
    const cleared = this.locationsCleared[node.index];
    const radius = 28;

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
      .text(0, radius + 10, node.scene.title, {
        fontSize: "11px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: titleColor,
        align: "center",
        wordWrap: { width: 120 },
      })
      .setOrigin(0.5, 0);
    elements.push(titleText);

    const container = this.add.container(node.x, node.y, elements);

    if (!cleared) {
      circle.setInteractive({ useHandCursor: true });

      circle.on("pointerdown", () => {
        this.travelToNode(node);
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

  // ---------- Travel to node ----------

  private travelToNode(targetNode: NodeInfo): void {
    // Disable all node interactions during animation
    this.nodeGraphics.forEach((container) => {
      container.each((child: Phaser.GameObjects.GameObject) => {
        if ("disableInteractive" in child && typeof child.disableInteractive === "function") {
          (child as Phaser.GameObjects.Shape).disableInteractive();
        }
      });
    });

    this.animatePlayerTravel(targetNode);
  }

  private animatePlayerTravel(targetNode: NodeInfo): void {
    if (!this.playerToken) {
      this.enterBattle(targetNode);
      return;
    }

    const targetX = targetNode.x;
    const targetY = targetNode.y - 28;

    // Stop the floating tween temporarily
    this.tweens.killTweensOf(this.playerToken);

    // Animate the player token moving along the path
    this.tweens.add({
      targets: this.playerToken,
      x: targetX,
      y: targetY,
      duration: 600,
      ease: "Power2",
      onUpdate: () => {
        // Leave a small trail particle behind
        if (this.playerToken && Math.random() < 0.3) {
          const trail = this.add
            .circle(this.playerToken.x, this.playerToken.y + 14, 3, 0xffd700, 0.5)
            .setDepth(7);
          this.tweens.add({
            targets: trail,
            alpha: 0,
            scaleX: 0,
            scaleY: 0,
            duration: 400,
            onComplete: () => trail.destroy(),
          });
        }
      },
      onComplete: () => {
        // Arrival pulse
        if (this.playerToken) {
          this.tweens.add({
            targets: this.playerToken,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 150,
            yoyo: true,
            onComplete: () => {
              // Brief pause then enter battle
              this.time.delayedCall(200, () => {
                this.enterBattle(targetNode);
              });
            },
          });
        }
      },
    });
  }

  // ---------- Enter battle ----------

  private enterBattle(node: NodeInfo): void {
    const difficulty =
      (this.registry.get("difficulty") as Difficulty) ?? "little-kids";
    // Final location = boss fight
    const scenes = (this.registry.get("lesson") as LessonConfig)?.story?.scenes ?? [];
    const isFinalLocation = node.index === scenes.length - 1;

    const enemy = isFinalLocation
      ? createBossEnemy(difficulty)
      : createEnemy(node.scene.title, difficulty);

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

    // If event has choices, show the choice UI instead of auto-applying
    if (event.choices && event.choices.length > 0) {
      this.showEventChoiceOverlay(event);
    } else {
      // Legacy fallback: auto-apply
      this.autoApplyEvent(event);
    }
  }

  /** Legacy auto-apply for events without choices. */
  private autoApplyEvent(event: RandomEvent): void {
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

    this.showEventResultOverlay(event.text, event.effect, event.value);
  }

  // ---------- Event choice overlay (Improvement #3) ----------

  private showEventChoiceOverlay(event: RandomEvent): void {
    const { width, height } = this.scale;
    const choices = event.choices!;
    const choiceCount = choices.length;

    // Calculate card height based on number of choices
    const cardHeight = 120 + choiceCount * 50;
    const cy = height / 2;

    // Semi-transparent backdrop
    const backdrop = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
      .setDepth(10)
      .setInteractive(); // block clicks through

    // Event card
    const cardBg = this.add
      .rectangle(width / 2, cy, 360, cardHeight, 0x3d2e1a)
      .setStrokeStyle(3, 0xd4a847)
      .setDepth(11);

    // "Random Event" label
    const headerLabel = this.add
      .text(width / 2, cy - cardHeight / 2 + 18, "RANDOM EVENT", {
        fontSize: "12px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#b8943e",
      })
      .setOrigin(0.5)
      .setDepth(12);

    // Event description text
    const eventText = this.add
      .text(width / 2, cy - cardHeight / 2 + 46, event.text, {
        fontSize: "15px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: "#e8d5a8",
        align: "center",
        wordWrap: { width: 320 },
      })
      .setOrigin(0.5)
      .setDepth(12);

    // "Choose your action:" prompt
    const promptText = this.add
      .text(width / 2, cy - cardHeight / 2 + 76, "Choose your action:", {
        fontSize: "11px",
        fontFamily: "sans-serif",
        color: "#b8943e",
      })
      .setOrigin(0.5)
      .setDepth(12);

    const elements: Phaser.GameObjects.GameObject[] = [
      backdrop,
      cardBg,
      headerLabel,
      eventText,
      promptText,
    ];

    // Choice buttons
    const btnStartY = cy - cardHeight / 2 + 100;
    choices.forEach((choice, i) => {
      const btnY = btnStartY + i * 50;
      const btnW = 320;
      const btnH = 40;

      // Determine button color based on primary effect
      const colorMap: Record<string, number> = {
        heal: 0x2e5c2e,
        damage: 0x5c2e2e,
        boost: 0x5c4e1e,
        none: 0x3d3d3d,
      };
      const btnColor = colorMap[choice.effect] ?? 0x3d3d3d;

      const btnBg = this.add
        .rectangle(width / 2, btnY, btnW, btnH, btnColor)
        .setStrokeStyle(2, 0x5a4430)
        .setInteractive({ useHandCursor: true })
        .setDepth(12);

      const btnLabel = this.add
        .text(width / 2, btnY, choice.label, {
          fontSize: "12px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: "#e8d5a8",
          align: "center",
          wordWrap: { width: btnW - 20 },
        })
        .setOrigin(0.5)
        .setDepth(13);

      elements.push(btnBg, btnLabel);

      // Hover effect
      btnBg.on("pointerover", () => {
        btnBg.setStrokeStyle(2, 0xd4a847);
        btnBg.setAlpha(0.9);
      });
      btnBg.on("pointerout", () => {
        btnBg.setStrokeStyle(2, 0x5a4430);
        btnBg.setAlpha(1);
      });

      // Click handler
      btnBg.on("pointerdown", () => {
        this.handleEventChoice(event, choice, elements);
      });
    });

    this.eventOverlay = this.add
      .container(0, 0, elements)
      .setDepth(10);

    // Fade in
    this.eventOverlay.setAlpha(0);
    this.tweens.add({
      targets: this.eventOverlay,
      alpha: 1,
      duration: 400,
    });
  }

  private handleEventChoice(
    event: RandomEvent,
    choice: EventChoice,
    _overlayElements: Phaser.GameObjects.GameObject[],
  ): void {
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

    const newState = applyEventChoice(tempState, choice);

    this.registry.set("partyHeroes", newState.heroes);
    this.registry.set("partyHp", newState.partyHp);
    this.registry.set("maxPartyHp", newState.maxPartyHp);

    // Dismiss overlay
    if (this.eventOverlay) {
      this.tweens.add({
        targets: this.eventOverlay,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          this.eventOverlay?.destroy();
          this.eventOverlay = null;

          // Show result briefly
          this.showEventResultOverlay(
            choice.label,
            choice.effect,
            choice.value,
          );
        },
      });
    }
  }

  /** Show a brief result card after an event resolves. */
  private showEventResultOverlay(
    text: string,
    effect: string,
    value: number,
  ): void {
    const { width, height } = this.scale;
    const cy = height / 2;

    // Semi-transparent backdrop
    const backdrop = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.5)
      .setDepth(10);

    // Event card
    const isGood = effect !== "damage";
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
      none: "-",
    };
    const iconColorMap: Record<string, string> = {
      heal: "#4CAF50",
      damage: "#E53935",
      boost: "#FFD700",
      none: "#808080",
    };

    const iconCircle = this.add
      .circle(width / 2, cy - 38, 20, isGood ? 0x4caf50 : 0xe53935, 0.3)
      .setDepth(12);

    const icon = this.add
      .text(width / 2, cy - 38, iconMap[effect] ?? "?", {
        fontSize: "28px",
        fontFamily: "sans-serif",
        fontStyle: "bold",
        color: iconColorMap[effect] ?? "#e8d5a8",
      })
      .setOrigin(0.5)
      .setDepth(12);

    // Event text
    const eventText = this.add
      .text(width / 2, cy + 6, text, {
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
    const resultElements: Phaser.GameObjects.GameObject[] = [
      backdrop, cardBg, iconCircle, icon, eventText,
    ];

    if (effect !== "none" && value > 0) {
      const prefix = effect === "damage" ? "-" : "+";
      const suffix = effect === "boost" ? " ATK" : " HP";
      const valueText = this.add
        .text(width / 2, cy + 40, `${prefix}${value}${suffix}`, {
          fontSize: "18px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: iconColorMap[effect] ?? "#e8d5a8",
        })
        .setOrigin(0.5)
        .setDepth(12);
      resultElements.push(valueText);
    }

    this.eventOverlay = this.add
      .container(0, 0, resultElements)
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

    // Background bar — depth 5 so it renders above map nodes
    this.add
      .rectangle(width / 2, barY + 8, width - 16, 40, 0x1a1108, 0.85)
      .setStrokeStyle(1, 0x5a4430, 0.5)
      .setDepth(5);

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
      .setOrigin(0, 0)
      .setDepth(5);

    // Mini HP bar
    const hpBarW = 80;
    const hpBarH = 8;
    this.add.rectangle(20 + 24 + hpBarW / 2, barY + 8, hpBarW, hpBarH, 0x3d2e1a).setDepth(5);
    const hpRatio = Math.max(0, partyHp / maxPartyHp);
    this.add.rectangle(
      20 + 24 + (hpBarW * hpRatio) / 2,
      barY + 8,
      hpBarW * hpRatio,
      hpBarH,
      0x4caf50,
    ).setDepth(5);
    this.add
      .text(20 + 24 + hpBarW + 6, barY + 8, `${partyHp}/${maxPartyHp}`, {
        fontSize: "9px",
        fontFamily: "sans-serif",
        color: "#b8943e",
      })
      .setOrigin(0, 0.5)
      .setDepth(5);

    // Collected loot icons on the right side — with rarity colors
    const collectedLoot =
      (this.registry.get("collectedLoot") as LootItem[] | undefined) ?? [];
    const lootStartX = width - 20;
    collectedLoot.forEach((loot, i) => {
      const lx = lootStartX - i * 28;
      const rarity = getLootRarity(loot);
      const rarityColor = RARITY_COLORS[rarity];
      // Small loot badge with rarity-colored border
      this.add
        .circle(lx, barY + 8, 10, 0xd4a847, 0.4)
        .setStrokeStyle(2, rarityColor.border, 0.9)
        .setDepth(5);
      this.add
        .text(lx, barY + 8, loot.name.charAt(0), {
          fontSize: "10px",
          fontFamily: "sans-serif",
          fontStyle: "bold",
          color: rarityColor.text,
        })
        .setOrigin(0.5)
        .setDepth(5);
    });
  }

  // ---------- Quest Complete ----------

  private showQuestComplete(): void {
    saveScore("promised-land", 3);
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
        .text(width / 2 - 50 + s * 50, starY, "\u2605", {
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

    // Show all collected loot with rarity colors
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
        const rarity = getLootRarity(loot);
        const rarityColor = RARITY_COLORS[rarity];
        const stats: string[] = [];
        if (loot.statBoost.hp) stats.push(`+${loot.statBoost.hp} HP`);
        if (loot.statBoost.attack) stats.push(`+${loot.statBoost.attack} ATK`);
        this.add
          .text(
            width / 2,
            ly,
            `${loot.name}  ${stats.join(" ")}  [${RARITY_LABELS[rarity]}]`,
            {
              fontSize: "11px",
              fontFamily: "sans-serif",
              color: rarityColor.text,
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
