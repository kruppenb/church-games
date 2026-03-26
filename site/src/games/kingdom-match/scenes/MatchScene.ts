import Phaser from "phaser";
import type { LessonConfig, Question } from "@/types/lesson";
import { QuestionPool } from "@/lib/question-pool";
import { saveScore } from "@/lib/score-store";
import {
  TileType,
  SpecialType,
  createGrid,
  findMatches,
  removeMatches,
  applyGravity,
  swapTiles,
  areAdjacent,
  findValidMove,
  reshuffleGrid,
  getLevelConfig,
  calculateStars,
  calculateMatchScore,
  TILE_COLORS,
  TILE_NAMES,
  SPECIAL_COLORS,
} from "../logic/match-logic";
import type {
  Tile,
  Position,
  LevelConfig,
  CascadeStep,
  MatchResult,
} from "../logic/match-logic";

/** Layout constants */
const GAME_W = 800;
const GAME_H = 600;
const HUD_HEIGHT = 70;
const BOTTOM_MARGIN = 20;

const SWAP_DURATION = 150;
const FALL_DURATION = 120;
const MATCH_DURATION = 200;
const CASCADE_DELAY = 100;

const TILE_ICONS: Record<TileType, string> = {
  [TileType.Heart]: "\u2764",
  [TileType.Star]: "\u2605",
  [TileType.Cross]: "\u271A",
  [TileType.Dove]: "\u2766",
  [TileType.Crown]: "\u265B",
  [TileType.Scroll]: "\u2234",
};

const SPECIAL_ICONS: Record<SpecialType, string> = {
  [SpecialType.None]: "",
  [SpecialType.LineBlastH]: "\u2194",
  [SpecialType.LineBlastV]: "\u2195",
  [SpecialType.Bomb]: "\u2737",
  [SpecialType.Rainbow]: "\u2726",
  [SpecialType.Propeller]: "\u2738",
};

/** Mapping from TileType to image asset key */
const TILE_IMAGE_KEYS: Record<TileType, string> = {
  [TileType.Heart]: "match-heart",
  [TileType.Star]: "match-star",
  [TileType.Cross]: "match-cross",
  [TileType.Dove]: "match-dove",
  [TileType.Crown]: "match-crown",
  [TileType.Scroll]: "match-scroll",
};

/** Mapping from SpecialType to image asset key */
const SPECIAL_IMAGE_KEYS: Record<SpecialType, string> = {
  [SpecialType.None]: "",
  [SpecialType.LineBlastH]: "match-lineblast",
  [SpecialType.LineBlastV]: "match-lineblast",
  [SpecialType.Bomb]: "match-bomb",
  [SpecialType.Rainbow]: "match-rainbow",
  [SpecialType.Propeller]: "match-propeller",
};

const ANSWER_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00];
const ANSWER_LABELS = ["A", "B", "C", "D"];

type SceneState =
  | "intro"
  | "playing"
  | "animating"
  | "question"
  | "feedback"
  | "level-complete"
  | "game-over"
  | "all-complete";

export class MatchScene extends Phaser.Scene {
  // Game data
  private lesson!: LessonConfig;
  private difficulty!: "little-kids" | "big-kids";
  private levelConfig!: LevelConfig;
  private questionPool!: QuestionPool;

  // Grid state
  private grid!: (Tile | null)[][];
  private tileSprites: (Phaser.GameObjects.Container | null)[][] = [];
  private gridSize = 8;
  private tileCount = 6;
  private tileSize = 0;
  private gridOffsetX = 0;
  private gridOffsetY = 0;

  // Game state
  private sceneState: SceneState = "intro";
  private score = 0;
  private movesRemaining = 0;
  private currentLevel = 1;
  private levelsCompleted = 0;
  private bonusMoves = 0;
  private totalStars = 0;

  // Selection state
  private selectedTile: Position | null = null;
  private selectedHighlight: Phaser.GameObjects.Rectangle | null = null;

  // HUD elements
  private scoreText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  // Overlay container
  private overlay!: Phaser.GameObjects.Container;

  // Particles
  private particleEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

  // Question state
  private currentQuestion: Question | null = null;

  // Track which image assets loaded successfully
  private loadedImages = new Set<string>();

  constructor() {
    super({ key: "MatchScene" });
  }

  preload(): void {
    // Attempt to load tile images — if they don't exist, we fall back to shapes
    const tileAssets = [
      { key: "match-heart", path: "assets/match/heart.png" },
      { key: "match-star", path: "assets/match/star.png" },
      { key: "match-cross", path: "assets/match/cross.png" },
      { key: "match-dove", path: "assets/match/dove.png" },
      { key: "match-crown", path: "assets/match/crown.png" },
      { key: "match-scroll", path: "assets/match/scroll.png" },
      { key: "match-lineblast", path: "assets/match/lineblast.png" },
      { key: "match-bomb", path: "assets/match/bomb.png" },
      { key: "match-rainbow", path: "assets/match/rainbow.png" },
      { key: "match-propeller", path: "assets/match/propeller.png" },
    ];

    for (const asset of tileAssets) {
      this.load.image(asset.key, asset.path);
    }

    // Track successful loads
    this.load.on("filecomplete", (key: string) => {
      this.loadedImages.add(key);
    });

    // Suppress errors for missing images (we have fallbacks)
    this.load.on(
      "loaderror",
      (file: Phaser.Loader.File) => {
        // Silently ignore — will use geometric shape fallback
        console.debug(`Match icon not found: ${file.key} — using shape fallback`);
      },
    );
  }

  create(): void {
    this.lesson = this.registry.get("lesson") as LessonConfig;
    this.difficulty = this.registry.get("difficulty") as
      | "little-kids"
      | "big-kids";

    this.questionPool = new QuestionPool(
      this.lesson.questions,
      this.difficulty,
    );

    this.overlay = this.add.container(0, 0).setDepth(100);

    this.showIntro();
  }

  // ─── Intro Screen ───────────────────────────────

  private showIntro(): void {
    this.sceneState = "intro";
    this.overlay.removeAll(true);

    // Background
    const bg = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x1a0a2e, 0.97)
      .setInteractive();
    this.overlay.add(bg);

    const title = this.add
      .text(GAME_W / 2, 120, "Kingdom Match", {
        fontSize: "42px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.overlay.add(title);

    const crown = this.add
      .text(GAME_W / 2, 190, "\u{1F451}", {
        fontSize: "48px",
      })
      .setOrigin(0.5);
    this.overlay.add(crown);

    const lessonTitle = this.add
      .text(GAME_W / 2, 250, this.lesson.meta.title, {
        fontSize: "20px",
        fontFamily: "Arial, sans-serif",
        color: "#e0d0ff",
        wordWrap: { width: 500 },
        align: "center",
      })
      .setOrigin(0.5);
    this.overlay.add(lessonTitle);

    const verse = this.add
      .text(GAME_W / 2, 300, this.lesson.meta.verseReference, {
        fontSize: "16px",
        fontFamily: "Arial, sans-serif",
        color: "#b0a0d0",
        fontStyle: "italic",
      })
      .setOrigin(0.5);
    this.overlay.add(verse);

    const desc = this.add
      .text(
        GAME_W / 2,
        360,
        "Match tiles to build the Kingdom!\nAnswer questions to earn bonus moves.",
        {
          fontSize: "16px",
          fontFamily: "Arial, sans-serif",
          color: "#c0b0e0",
          align: "center",
          lineSpacing: 6,
        },
      )
      .setOrigin(0.5);
    this.overlay.add(desc);

    const diffLabel = this.add
      .text(
        GAME_W / 2,
        410,
        this.difficulty === "little-kids"
          ? "Mode: Little Kids (6x6)"
          : "Mode: Big Kids (8x8)",
        {
          fontSize: "14px",
          fontFamily: "Arial, sans-serif",
          color: "#9080b0",
        },
      )
      .setOrigin(0.5);
    this.overlay.add(diffLabel);

    // Start button
    const btnBg = this.add
      .rectangle(GAME_W / 2, 480, 220, 55, 0x9b59b6)
      .setStrokeStyle(2, 0xffd700)
      .setInteractive({ useHandCursor: true });
    this.overlay.add(btnBg);

    const btnText = this.add
      .text(GAME_W / 2, 480, "Start Game", {
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay.add(btnText);

    btnBg.on("pointerover", () => btnBg.setFillStyle(0xb06fd6));
    btnBg.on("pointerout", () => btnBg.setFillStyle(0x9b59b6));
    btnBg.on("pointerdown", () => {
      this.startLevel(1);
    });
  }

  // ─── Level Setup ───────────────────────────────

  private startLevel(level: number): void {
    this.currentLevel = level;
    this.levelConfig = getLevelConfig(level, this.difficulty);
    this.gridSize = this.levelConfig.gridSize;
    this.tileCount = this.levelConfig.tileCount;
    this.score = 0;
    this.movesRemaining = this.levelConfig.moves + this.bonusMoves;
    this.bonusMoves = 0;

    // Calculate tile size and offsets to center the grid
    const availableH = GAME_H - HUD_HEIGHT - BOTTOM_MARGIN;
    const availableW = GAME_W - 40;
    this.tileSize = Math.floor(
      Math.min(availableW / this.gridSize, availableH / this.gridSize),
    );
    const gridPixelW = this.tileSize * this.gridSize;
    const gridPixelH = this.tileSize * this.gridSize;
    this.gridOffsetX = Math.floor((GAME_W - gridPixelW) / 2);
    this.gridOffsetY = HUD_HEIGHT + Math.floor((availableH - gridPixelH) / 2);

    // Create the grid (no initial matches)
    this.grid = createGrid(this.gridSize, this.gridSize, this.tileCount);

    // Ensure at least one valid move
    if (!findValidMove(this.grid)) {
      this.grid = reshuffleGrid(this.grid, this.tileCount) as Tile[][];
    }

    this.overlay.removeAll(true);
    this.clearBoard();
    this.createHUD();
    this.drawGrid();

    // Animate tiles falling in
    this.animateGridEntrance(() => {
      this.sceneState = "playing";
    });
  }

  // ─── HUD ───────────────────────────────

  private createHUD(): void {
    // Background bar
    const hudBg = this.add.rectangle(
      GAME_W / 2,
      HUD_HEIGHT / 2,
      GAME_W,
      HUD_HEIGHT,
      0x1a0a2e,
    );
    hudBg.setDepth(50);

    // Level
    this.levelText = this.add
      .text(20, 12, `Level ${this.currentLevel}`, {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setDepth(51);

    // Target
    this.targetText = this.add
      .text(20, 38, `Target: ${this.levelConfig.targetScore}`, {
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
        color: "#b0a0d0",
      })
      .setDepth(51);

    // Score (center)
    this.scoreText = this.add
      .text(GAME_W / 2, 18, `Score: ${this.score}`, {
        fontSize: "22px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0)
      .setDepth(51);

    // Moves (right)
    this.movesText = this.add
      .text(GAME_W - 20, 18, `Moves: ${this.movesRemaining}`, {
        fontSize: "20px",
        fontFamily: "Arial, sans-serif",
        color: "#4fc3f7",
        fontStyle: "bold",
      })
      .setOrigin(1, 0)
      .setDepth(51);

    // Combo text (hidden by default)
    this.comboText = this.add
      .text(GAME_W / 2, 50, "", {
        fontSize: "16px",
        fontFamily: "Arial, sans-serif",
        color: "#ff9800",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0)
      .setDepth(51)
      .setAlpha(0);

    // Progress bar for score target
    const barWidth = 200;
    const barX = GAME_W / 2 - barWidth / 2;
    const barY = 48;

    this.add
      .rectangle(barX + barWidth / 2, barY + 5, barWidth, 10, 0x333355)
      .setDepth(51);

    // The fill will be updated in updateHUD
    const fill = this.add
      .rectangle(barX + 1, barY + 5, 0, 8, 0x9b59b6)
      .setOrigin(0, 0.5)
      .setDepth(52);
    fill.setData("barX", barX + 1);
    fill.setData("barWidth", barWidth - 2);
    fill.setName("progressFill");
  }

  private updateHUD(): void {
    this.scoreText.setText(`Score: ${this.score}`);
    this.movesText.setText(`Moves: ${this.movesRemaining}`);
    this.levelText.setText(`Level ${this.currentLevel}`);
    this.targetText.setText(`Target: ${this.levelConfig.targetScore}`);

    // Update color based on moves
    if (this.movesRemaining <= 3) {
      this.movesText.setColor("#ff4444");
    } else if (this.movesRemaining <= 5) {
      this.movesText.setColor("#ff9800");
    } else {
      this.movesText.setColor("#4fc3f7");
    }

    // Update progress bar
    const fill = this.children.getByName("progressFill") as
      | Phaser.GameObjects.Rectangle
      | undefined;
    if (fill) {
      const barWidth = fill.getData("barWidth") as number;
      const pct = Math.min(1, this.score / this.levelConfig.targetScore);
      fill.width = Math.max(0, barWidth * pct);
      fill.setFillStyle(pct >= 1 ? 0x4caf50 : 0x9b59b6);
    }
  }

  // ─── Grid Drawing ───────────────────────────────

  private clearBoard(): void {
    // Kill all running tweens so nothing references destroyed objects
    this.tweens.killAll();

    // Explicitly destroy every tile sprite container
    for (let r = 0; r < this.tileSprites.length; r++) {
      for (let c = 0; c < (this.tileSprites[r]?.length ?? 0); c++) {
        const sprite = this.tileSprites[r][c];
        if (sprite) {
          sprite.destroy();
          this.tileSprites[r][c] = null;
        }
      }
    }
    this.tileSprites = [];

    // Destroy selection highlight
    if (this.selectedHighlight) {
      this.selectedHighlight.destroy();
      this.selectedHighlight = null;
    }
    this.selectedTile = null;

    // Remove all game objects except the overlay container and its children.
    // Collect first, then destroy, to avoid mutating the list while iterating.
    const toDestroy: Phaser.GameObjects.GameObject[] = [];
    this.children.each((child) => {
      if (child !== this.overlay) {
        toDestroy.push(child);
      }
    });
    for (const obj of toDestroy) {
      obj.destroy();
    }
  }

  private drawGrid(): void {
    // Initialize sprite array
    this.tileSprites = [];
    for (let r = 0; r < this.gridSize; r++) {
      this.tileSprites[r] = [];
      for (let c = 0; c < this.gridSize; c++) {
        this.tileSprites[r][c] = null;
      }
    }

    // Draw grid background
    const gridBg = this.add.rectangle(
      this.gridOffsetX + (this.tileSize * this.gridSize) / 2,
      this.gridOffsetY + (this.tileSize * this.gridSize) / 2,
      this.tileSize * this.gridSize + 4,
      this.tileSize * this.gridSize + 4,
      0x0d0520,
    );
    gridBg.setStrokeStyle(2, 0x2a1a4e);
    gridBg.setDepth(1);

    // Draw cell backgrounds (checkerboard)
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const x = this.gridOffsetX + c * this.tileSize + this.tileSize / 2;
        const y = this.gridOffsetY + r * this.tileSize + this.tileSize / 2;
        const shade = (r + c) % 2 === 0 ? 0x1a0a3e : 0x150832;
        this.add.rectangle(x, y, this.tileSize - 1, this.tileSize - 1, shade).setDepth(2);
      }
    }

    // Draw tiles
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const t = this.grid[r][c];
        if (t) {
          this.createTileSprite(r, c, t);
        }
      }
    }
  }

  /** Check if an image asset key was loaded successfully */
  private hasImage(key: string): boolean {
    return this.loadedImages.has(key) && this.textures.exists(key);
  }

  private createTileSprite(
    row: number,
    col: number,
    t: Tile,
  ): Phaser.GameObjects.Container {
    const x = this.gridOffsetX + col * this.tileSize + this.tileSize / 2;
    const y = this.gridOffsetY + row * this.tileSize + this.tileSize / 2;
    const size = this.tileSize - 6;

    const container = this.add.container(x, y);
    container.setDepth(10);

    const tileImageKey = TILE_IMAGE_KEYS[t.type];
    const useImage = this.hasImage(tileImageKey);

    if (useImage) {
      // Use generated image asset
      const img = this.add.image(0, 0, tileImageKey);
      // Scale to fit tile size
      const scale = size / Math.max(img.width, img.height);
      img.setScale(scale);
      container.add(img);
    } else {
      // Fallback: geometric shape with icon text
      const color = TILE_COLORS[t.type];
      const bg = this.add.rectangle(0, 0, size, size, color);
      bg.setStrokeStyle(2, 0xffffff30);
      container.add(bg);

      // Inner highlight for 3D effect
      const highlight = this.add.rectangle(
        0,
        -size * 0.08,
        size * 0.8,
        size * 0.4,
        0xffffff,
        0.15,
      );
      container.add(highlight);

      // Icon text
      const iconSize = Math.max(14, Math.floor(size * 0.4));
      const icon = this.add
        .text(0, -2, TILE_ICONS[t.type], {
          fontSize: `${iconSize}px`,
          fontFamily: "Arial, sans-serif",
        })
        .setOrigin(0.5);
      container.add(icon);
    }

    // Special tile indicator
    if (t.special !== SpecialType.None) {
      const specialColor = SPECIAL_COLORS[t.special];
      const specialImageKey = SPECIAL_IMAGE_KEYS[t.special];
      const useSpecialImage = specialImageKey && this.hasImage(specialImageKey);

      if (useSpecialImage) {
        // Show special powerup image overlay
        const specialImg = this.add.image(0, size * 0.2, specialImageKey);
        const specialScale = (size * 0.45) / Math.max(specialImg.width, specialImg.height);
        specialImg.setScale(specialScale);
        specialImg.setAlpha(0.9);
        container.add(specialImg);
      } else {
        // Fallback: text icon for special
        const iconSize = Math.max(14, Math.floor(size * 0.4));
        const specialIcon = this.add
          .text(0, size * 0.28, SPECIAL_ICONS[t.special], {
            fontSize: `${Math.floor(iconSize * 0.7)}px`,
            fontFamily: "Arial, sans-serif",
            color:
              "#" +
              specialColor.toString(16).padStart(6, "0"),
          })
          .setOrigin(0.5);
        container.add(specialIcon);
      }

      // Glow effect for special tiles (applies to both image and fallback)
      const glow = this.add.rectangle(0, 0, size + 4, size + 4, specialColor, 0.2);
      container.addAt(glow, 0);

      // Pulsing animation for special tiles
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.1, to: 0.35 },
        duration: 800,
        yoyo: true,
        repeat: -1,
      });

      // Spin animation for Propeller tiles
      if (t.special === SpecialType.Propeller) {
        this.tweens.add({
          targets: container,
          angle: 360,
          duration: 2000,
          repeat: -1,
          ease: "Linear",
        });
      }

      // Add a colored border around the tile for specials (visible in both modes)
      if (!useImage) {
        // For fallback shapes, update the existing bg stroke
        const bg = container.getAt(0) as Phaser.GameObjects.Rectangle;
        if (bg && bg.setStrokeStyle) {
          bg.setStrokeStyle(3, specialColor);
        }
      }
    }

    // Make interactive — use an invisible hit area covering the tile
    const hitArea = this.add.rectangle(0, 0, size, size, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on("pointerdown", () => this.onTileClick(row, col));
    container.add(hitArea);

    this.tileSprites[row][col] = container;
    return container;
  }

  private animateGridEntrance(onComplete: () => void): void {
    this.sceneState = "animating";
    let completed = 0;
    const total = this.gridSize * this.gridSize;

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const sprite = this.tileSprites[r]?.[c];
        if (!sprite) {
          completed++;
          if (completed >= total) onComplete();
          continue;
        }

        const finalY = sprite.y;
        sprite.y = -this.tileSize;
        sprite.setAlpha(0);

        const delay = c * 30 + r * 50;

        this.tweens.add({
          targets: sprite,
          y: finalY,
          alpha: 1,
          duration: 300,
          delay,
          ease: "Bounce.easeOut",
          onComplete: () => {
            completed++;
            if (completed >= total) onComplete();
          },
        });
      }
    }
  }

  // ─── Tile Interaction ───────────────────────────────

  private onTileClick(row: number, col: number): void {
    if (this.sceneState !== "playing") return;

    const pos: Position = { row, col };

    if (!this.selectedTile) {
      // Select this tile
      this.selectedTile = pos;
      this.showSelection(row, col);
    } else if (
      this.selectedTile.row === row &&
      this.selectedTile.col === col
    ) {
      // Deselect
      this.clearSelection();
    } else if (areAdjacent(this.selectedTile, pos)) {
      // Try swap
      this.trySwap(this.selectedTile, pos);
      this.clearSelection();
    } else {
      // Select different tile
      this.clearSelection();
      this.selectedTile = pos;
      this.showSelection(row, col);
    }
  }

  private showSelection(row: number, col: number): void {
    this.clearSelection();
    const x = this.gridOffsetX + col * this.tileSize + this.tileSize / 2;
    const y = this.gridOffsetY + row * this.tileSize + this.tileSize / 2;
    this.selectedHighlight = this.add
      .rectangle(
        x,
        y,
        this.tileSize - 2,
        this.tileSize - 2,
        0xffffff,
        0.35,
      )
      .setStrokeStyle(4, 0xffd700)
      .setDepth(15);

    // Pulse animation - more visible range
    this.tweens.add({
      targets: this.selectedHighlight,
      alpha: { from: 0.45, to: 0.2 },
      scaleX: { from: 1.0, to: 1.06 },
      scaleY: { from: 1.0, to: 1.06 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    this.selectedTile = { row, col };
  }

  private clearSelection(): void {
    if (this.selectedHighlight) {
      this.selectedHighlight.destroy();
      this.selectedHighlight = null;
    }
    this.selectedTile = null;
  }

  // ─── Swap and Match Processing ───────────────────

  private trySwap(a: Position, b: Position): void {
    this.sceneState = "animating";

    // Animate the swap
    const spriteA = this.tileSprites[a.row]?.[a.col];
    const spriteB = this.tileSprites[b.row]?.[b.col];

    if (!spriteA || !spriteB) {
      this.sceneState = "playing";
      return;
    }

    const targetAx =
      this.gridOffsetX + b.col * this.tileSize + this.tileSize / 2;
    const targetAy =
      this.gridOffsetY + b.row * this.tileSize + this.tileSize / 2;
    const targetBx =
      this.gridOffsetX + a.col * this.tileSize + this.tileSize / 2;
    const targetBy =
      this.gridOffsetY + a.row * this.tileSize + this.tileSize / 2;

    // Swap in sprite array
    this.tileSprites[a.row][a.col] = spriteB;
    this.tileSprites[b.row][b.col] = spriteA;

    // Animate
    this.tweens.add({
      targets: spriteA,
      x: targetAx,
      y: targetAy,
      duration: SWAP_DURATION,
      ease: "Quad.easeInOut",
    });

    this.tweens.add({
      targets: spriteB,
      x: targetBx,
      y: targetBy,
      duration: SWAP_DURATION,
      ease: "Quad.easeInOut",
      onComplete: () => {
        // Check if swap creates a match
        const swappedGrid = swapTiles(this.grid, a, b);
        const matches = findMatches(swappedGrid);

        if (matches.length === 0) {
          // Invalid swap - swap back
          this.tileSprites[a.row][a.col] = spriteA;
          this.tileSprites[b.row][b.col] = spriteB;

          this.tweens.add({
            targets: spriteA,
            x: targetBx,
            y: targetBy,
            duration: SWAP_DURATION,
            ease: "Quad.easeInOut",
          });
          this.tweens.add({
            targets: spriteB,
            x: targetAx,
            y: targetAy,
            duration: SWAP_DURATION,
            ease: "Quad.easeInOut",
            onComplete: () => {
              // Shake to indicate invalid
              this.cameras.main.shake(100, 0.005);
              this.sceneState = "playing";
            },
          });
          return;
        }

        // Valid swap!
        this.grid = swappedGrid;
        this.movesRemaining--;
        this.updateHUD();

        // Process cascades
        this.processCascade(0);
      },
    });
  }

  private processCascade(chainIndex: number): void {
    const matches = findMatches(this.grid);

    if (matches.length === 0) {
      // No more matches - check game state
      this.afterMatchesComplete(chainIndex);
      return;
    }

    // Show combo text for chains
    if (chainIndex > 0) {
      this.showCombo(chainIndex + 1);
    }

    // Calculate and add score
    const toRemove = new Set<string>();
    for (const match of matches) {
      for (const pos of match.positions) {
        toRemove.add(`${pos.row},${pos.col}`);
      }
    }

    const { grid: gridAfterRemoval, removedCount, specialsActivated } =
      removeMatches(this.grid, matches);

    const stepScore = calculateMatchScore(
      removedCount,
      chainIndex,
      specialsActivated,
    );
    this.score += stepScore;
    this.updateHUD();

    // Show score popup
    this.showScorePopup(stepScore, matches[0].positions[0]);

    // Animate match removal
    this.animateMatchRemoval(matches, gridAfterRemoval, () => {
      this.grid = gridAfterRemoval;

      // Apply gravity
      const gravity = applyGravity(this.grid, this.tileCount);
      this.grid = gravity.grid;

      this.animateGravityAndSpawn(gravity, () => {
        // Cascade: check for new matches
        this.time.delayedCall(CASCADE_DELAY, () => {
          this.processCascade(chainIndex + 1);
        });
      });
    });
  }

  private afterMatchesComplete(chainCount: number): void {
    // Check level complete
    if (this.score >= this.levelConfig.targetScore) {
      this.handleLevelComplete();
      return;
    }

    // Check game over
    if (this.movesRemaining <= 0) {
      this.handleGameOver();
      return;
    }

    // Check for valid moves
    if (!findValidMove(this.grid)) {
      // No valid moves - reshuffle
      this.showReshuffle(() => {
        this.grid = reshuffleGrid(
          this.grid,
          this.tileCount,
        ) as Tile[][];
        this.rebuildGridSprites();
        this.sceneState = "playing";
      });
      return;
    }

    this.sceneState = "playing";
  }

  // ─── Animations ───────────────────────────────

  private animateMatchRemoval(
    matches: MatchResult[],
    gridAfterRemoval: (Tile | null)[][],
    onComplete: () => void,
  ): void {
    const allPositions = new Set<string>();
    for (const match of matches) {
      for (const pos of match.positions) {
        allPositions.add(`${pos.row},${pos.col}`);
      }
    }

    let completed = 0;
    const total = allPositions.size;

    if (total === 0) {
      onComplete();
      return;
    }

    for (const key of allPositions) {
      const [r, c] = key.split(",").map(Number);
      const sprite = this.tileSprites[r]?.[c];

      // Check if this position has a special tile that was created (should be kept)
      const afterTile = gridAfterRemoval[r][c];
      if (afterTile && afterTile.special !== SpecialType.None) {
        // This is a newly created special tile - don't destroy, rebuild instead
        if (sprite) sprite.destroy();
        this.tileSprites[r][c] = this.createTileSprite(r, c, afterTile);
        // Scale-in animation for special tile
        const newSprite = this.tileSprites[r][c]!;
        newSprite.setScale(0);
        this.tweens.add({
          targets: newSprite,
          scale: 1,
          duration: 300,
          ease: "Back.easeOut",
        });
        completed++;
        if (completed >= total) {
          this.time.delayedCall(MATCH_DURATION, onComplete);
        }
        continue;
      }

      if (sprite) {
        // Particle burst at tile position
        this.createMatchParticles(sprite.x, sprite.y, this.grid[r]?.[c]?.type ?? TileType.Heart);

        this.tweens.add({
          targets: sprite,
          scale: 0,
          alpha: 0,
          duration: MATCH_DURATION,
          ease: "Quad.easeIn",
          onComplete: () => {
            sprite.destroy();
            this.tileSprites[r][c] = null;
            completed++;
            if (completed >= total) {
              this.time.delayedCall(50, onComplete);
            }
          },
        });
      } else {
        this.tileSprites[r][c] = null;
        completed++;
        if (completed >= total) {
          this.time.delayedCall(MATCH_DURATION, onComplete);
        }
      }
    }
  }

  private animateGravityAndSpawn(
    gravity: ReturnType<typeof applyGravity>,
    onComplete: () => void,
  ): void {
    // Rebuild tile sprites to match new grid
    // First, move existing tiles down
    const oldSprites = this.tileSprites.map((row) => [...row]);
    this.tileSprites = [];
    for (let r = 0; r < this.gridSize; r++) {
      this.tileSprites[r] = [];
      for (let c = 0; c < this.gridSize; c++) {
        this.tileSprites[r][c] = null;
      }
    }

    // Destroy old sprites that are no longer valid
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const old = oldSprites[r]?.[c];
        if (old) old.destroy();
      }
    }

    // Create new sprites for the entire grid and animate them
    let animCount = 0;
    let totalAnims = 0;

    const spawnedKeys = new Set(
      gravity.spawned.map((s) => `${s.position.row},${s.position.col}`),
    );

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const t = this.grid[r][c];
        if (!t) continue;

        const sprite = this.createTileSprite(r, c, t);
        this.tileSprites[r][c] = sprite;

        if (spawnedKeys.has(`${r},${c}`)) {
          // New tile spawned from top
          const finalY = sprite.y;
          sprite.y = this.gridOffsetY - this.tileSize;
          sprite.setAlpha(0.5);
          totalAnims++;

          this.tweens.add({
            targets: sprite,
            y: finalY,
            alpha: 1,
            duration: FALL_DURATION + r * 30,
            delay: c * 20,
            ease: "Bounce.easeOut",
            onComplete: () => {
              animCount++;
              if (animCount >= totalAnims) onComplete();
            },
          });
        }
      }
    }

    if (totalAnims === 0) {
      onComplete();
    }
  }

  private createMatchParticles(x: number, y: number, type: TileType): void {
    const color = TILE_COLORS[type];
    const count = 8;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 60 + Math.random() * 40;
      const size = 3 + Math.random() * 3;

      const particle = this.add
        .rectangle(x, y, size, size, color)
        .setDepth(20);

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0,
        duration: 400 + Math.random() * 200,
        ease: "Quad.easeOut",
        onComplete: () => particle.destroy(),
      });
    }
  }

  private showScorePopup(score: number, pos: Position): void {
    const x = this.gridOffsetX + pos.col * this.tileSize + this.tileSize / 2;
    const y = this.gridOffsetY + pos.row * this.tileSize;

    const text = this.add
      .text(x, y, `+${score}`, {
        fontSize: "22px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.tweens.add({
      targets: text,
      y: y - 50,
      alpha: 0,
      duration: 800,
      ease: "Quad.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  private showCombo(count: number): void {
    this.comboText.setText(`${count}x Combo!`);
    this.comboText.setAlpha(1);
    this.comboText.setScale(1.3);

    this.tweens.add({
      targets: this.comboText,
      scale: 1,
      duration: 300,
      ease: "Back.easeOut",
    });

    this.tweens.add({
      targets: this.comboText,
      alpha: 0,
      duration: 500,
      delay: 800,
    });
  }

  private showReshuffle(onComplete: () => void): void {
    const text = this.add
      .text(GAME_W / 2, GAME_H / 2, "No moves!\nReshuffling...", {
        fontSize: "28px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(40);

    this.tweens.add({
      targets: text,
      scale: { from: 0.5, to: 1.2 },
      alpha: { from: 0, to: 1 },
      duration: 500,
      yoyo: true,
      onComplete: () => {
        text.destroy();
        onComplete();
      },
    });
  }

  private rebuildGridSprites(): void {
    // Destroy all existing tile sprites
    for (let r = 0; r < this.tileSprites.length; r++) {
      for (let c = 0; c < (this.tileSprites[r]?.length ?? 0); c++) {
        this.tileSprites[r][c]?.destroy();
      }
    }
    this.tileSprites = [];

    // Recreate
    for (let r = 0; r < this.gridSize; r++) {
      this.tileSprites[r] = [];
      for (let c = 0; c < this.gridSize; c++) {
        const t = this.grid[r][c];
        if (t) {
          this.tileSprites[r][c] = this.createTileSprite(r, c, t);
        } else {
          this.tileSprites[r][c] = null;
        }
      }
    }
  }

  // ─── Level Complete ───────────────────────────────

  private handleLevelComplete(): void {
    this.sceneState = "level-complete";
    this.levelsCompleted++;

    const stars = calculateStars(
      this.score,
      this.levelConfig.starThresholds,
    );
    this.totalStars += stars;

    // Check if all 10 levels completed
    if (this.currentLevel >= 10) {
      this.showAllComplete();
      return;
    }

    // Check if should show question (every 2 levels)
    if (this.levelsCompleted % 2 === 0 && this.questionPool.hasMore()) {
      this.showLevelCompleteOverlay(stars, () => {
        this.showQuestion();
      });
    } else {
      this.showLevelCompleteOverlay(stars, () => {
        this.startLevel(this.currentLevel + 1);
      });
    }
  }

  private showLevelCompleteOverlay(
    stars: number,
    onContinue: () => void,
  ): void {
    this.overlay.removeAll(true);

    const bg = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.85)
      .setInteractive();
    this.overlay.add(bg);

    const title = this.add
      .text(GAME_W / 2, 140, "Level Complete!", {
        fontSize: "36px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.overlay.add(title);

    // Stars
    const starY = 210;
    for (let i = 0; i < 3; i++) {
      const earned = i < stars;
      const star = this.add
        .text(GAME_W / 2 - 60 + i * 60, starY, "\u2605", {
          fontSize: "48px",
          fontFamily: "Arial, sans-serif",
          color: earned ? "#ffd700" : "#444444",
        })
        .setOrigin(0.5);

      if (earned) {
        star.setScale(0);
        this.tweens.add({
          targets: star,
          scale: 1,
          duration: 400,
          delay: 200 + i * 200,
          ease: "Back.easeOut",
        });
      }

      this.overlay.add(star);
    }

    // Score
    const scoreLabel = this.add
      .text(GAME_W / 2, 280, `Score: ${this.score}`, {
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    this.overlay.add(scoreLabel);

    // Continue button
    const btnBg = this.add
      .rectangle(GAME_W / 2, 380, 200, 50, 0x4caf50)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    this.overlay.add(btnBg);

    const btnText = this.add
      .text(GAME_W / 2, 380, "Continue", {
        fontSize: "22px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay.add(btnText);

    btnBg.on("pointerover", () => btnBg.setFillStyle(0x66bb6a));
    btnBg.on("pointerout", () => btnBg.setFillStyle(0x4caf50));
    btnBg.on("pointerdown", () => {
      this.overlay.removeAll(true);
      onContinue();
    });
  }

  // ─── Game Over ───────────────────────────────

  private handleGameOver(): void {
    this.sceneState = "game-over";

    this.overlay.removeAll(true);

    const bg = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.85)
      .setInteractive();
    this.overlay.add(bg);

    const title = this.add
      .text(GAME_W / 2, 140, "Out of Moves!", {
        fontSize: "36px",
        fontFamily: "Arial, sans-serif",
        color: "#ff4444",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.overlay.add(title);

    const scoreLabel = this.add
      .text(
        GAME_W / 2,
        210,
        `Score: ${this.score} / ${this.levelConfig.targetScore}`,
        {
          fontSize: "22px",
          fontFamily: "Arial, sans-serif",
          color: "#ffffff",
        },
      )
      .setOrigin(0.5);
    this.overlay.add(scoreLabel);

    const encouragement = this.add
      .text(GAME_W / 2, 260, "Keep trying! You can do it!", {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#b0a0d0",
      })
      .setOrigin(0.5);
    this.overlay.add(encouragement);

    // Retry button
    const retryBg = this.add
      .rectangle(GAME_W / 2, 340, 200, 50, 0x9b59b6)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    this.overlay.add(retryBg);

    const retryText = this.add
      .text(GAME_W / 2, 340, "Try Again", {
        fontSize: "22px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay.add(retryText);

    retryBg.on("pointerover", () => retryBg.setFillStyle(0xb06fd6));
    retryBg.on("pointerout", () => retryBg.setFillStyle(0x9b59b6));
    retryBg.on("pointerdown", () => {
      this.overlay.removeAll(true);
      this.startLevel(this.currentLevel);
    });

    // Back button
    const backBg = this.add
      .rectangle(GAME_W / 2, 410, 200, 50, 0x333355)
      .setStrokeStyle(2, 0x666688)
      .setInteractive({ useHandCursor: true });
    this.overlay.add(backBg);

    const backText = this.add
      .text(GAME_W / 2, 410, "Back to Games", {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#aaaacc",
      })
      .setOrigin(0.5);
    this.overlay.add(backText);

    backBg.on("pointerover", () => backBg.setFillStyle(0x444466));
    backBg.on("pointerout", () => backBg.setFillStyle(0x333355));
    backBg.on("pointerdown", () => {
      window.location.hash = "/";
    });
  }

  // ─── All Levels Complete ───────────────────────────

  private showAllComplete(): void {
    const overallStars = this.totalStars >= 20 ? 3 : this.totalStars >= 10 ? 2 : 1;
    saveScore("kingdom-match", overallStars);
    this.sceneState = "all-complete";
    this.overlay.removeAll(true);

    const bg = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x1a0a2e, 0.97)
      .setInteractive();
    this.overlay.add(bg);

    const title = this.add
      .text(GAME_W / 2, 100, "Kingdom Built!", {
        fontSize: "40px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.overlay.add(title);

    const crown = this.add
      .text(GAME_W / 2, 170, "\u{1F451}\u{1F3F0}\u{1F451}", {
        fontSize: "40px",
      })
      .setOrigin(0.5);
    this.overlay.add(crown);

    // Total stars
    const starsLabel = this.add
      .text(GAME_W / 2, 230, `Total Stars: ${this.totalStars} / 30`, {
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay.add(starsLabel);

    // Verse
    const verse = this.add
      .text(
        GAME_W / 2,
        300,
        `"${this.lesson.meta.verseText || this.lesson.meta.verseReference}"`,
        {
          fontSize: "16px",
          fontFamily: "Arial, sans-serif",
          color: "#e0d0ff",
          fontStyle: "italic",
          wordWrap: { width: 500 },
          align: "center",
        },
      )
      .setOrigin(0.5);
    this.overlay.add(verse);

    const verseRef = this.add
      .text(GAME_W / 2, 350, `- ${this.lesson.meta.verseReference}`, {
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
        color: "#b0a0d0",
      })
      .setOrigin(0.5);
    this.overlay.add(verseRef);

    // Play Again
    const playBg = this.add
      .rectangle(GAME_W / 2, 420, 200, 50, 0x9b59b6)
      .setStrokeStyle(2, 0xffd700)
      .setInteractive({ useHandCursor: true });
    this.overlay.add(playBg);

    const playText = this.add
      .text(GAME_W / 2, 420, "Play Again", {
        fontSize: "22px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay.add(playText);

    playBg.on("pointerover", () => playBg.setFillStyle(0xb06fd6));
    playBg.on("pointerout", () => playBg.setFillStyle(0x9b59b6));
    playBg.on("pointerdown", () => {
      this.totalStars = 0;
      this.levelsCompleted = 0;
      this.bonusMoves = 0;
      this.questionPool.reset();
      this.startLevel(1);
    });

    // Back
    const backBg = this.add
      .rectangle(GAME_W / 2, 490, 200, 50, 0x333355)
      .setStrokeStyle(2, 0x666688)
      .setInteractive({ useHandCursor: true });
    this.overlay.add(backBg);

    const backText = this.add
      .text(GAME_W / 2, 490, "Back to Games", {
        fontSize: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#aaaacc",
      })
      .setOrigin(0.5);
    this.overlay.add(backText);

    backBg.on("pointerover", () => backBg.setFillStyle(0x444466));
    backBg.on("pointerout", () => backBg.setFillStyle(0x333355));
    backBg.on("pointerdown", () => {
      window.location.hash = "/";
    });

    // Fireworks particles
    this.createFireworks();
  }

  private createFireworks(): void {
    const colors = [0xffd700, 0xff4444, 0x4caf50, 0x2196f3, 0x9b59b6];

    const createBurst = () => {
      const x = 100 + Math.random() * 600;
      const y = 50 + Math.random() * 200;
      const color = colors[Math.floor(Math.random() * colors.length)];

      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        const speed = 40 + Math.random() * 60;
        const size = 2 + Math.random() * 3;

        const p = this.add
          .rectangle(x, y, size, size, color)
          .setDepth(101);

        this.overlay.add(p);

        this.tweens.add({
          targets: p,
          x: x + Math.cos(angle) * speed,
          y: y + Math.sin(angle) * speed + 30,
          alpha: 0,
          duration: 600 + Math.random() * 400,
          ease: "Quad.easeOut",
          onComplete: () => p.destroy(),
        });
      }
    };

    // Create bursts over time
    for (let i = 0; i < 5; i++) {
      this.time.delayedCall(i * 400, createBurst);
    }
  }

  // ─── Question Overlay ───────────────────────────────

  private showQuestion(): void {
    this.sceneState = "question";
    this.currentQuestion = this.questionPool.next();

    if (!this.currentQuestion) {
      // No more questions - just continue
      this.startLevel(this.currentLevel + 1);
      return;
    }

    this.overlay.removeAll(true);

    const bg = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.9)
      .setInteractive();
    this.overlay.add(bg);

    // Banner
    const banner = this.add
      .text(GAME_W / 2, 60, "\u2B50 Bonus Question!", {
        fontSize: "26px",
        fontFamily: "Arial, sans-serif",
        color: "#ffd700",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.overlay.add(banner);

    const subtitle = this.add
      .text(GAME_W / 2, 95, "Answer correctly for +3 bonus moves!", {
        fontSize: "15px",
        fontFamily: "Arial, sans-serif",
        color: "#b0e0ff",
      })
      .setOrigin(0.5);
    this.overlay.add(subtitle);

    // Question text
    const question = this.currentQuestion;
    const qText = this.add
      .text(GAME_W / 2, 155, question.text, {
        fontSize: "20px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        wordWrap: { width: 600 },
        align: "center",
        lineSpacing: 4,
      })
      .setOrigin(0.5);
    this.overlay.add(qText);

    // Answer buttons
    const startY = 230;
    const btnHeight = 50;
    const btnGap = 12;
    const btnWidth = 550;

    question.options.forEach((option, idx) => {
      const y = startY + idx * (btnHeight + btnGap);
      const color = ANSWER_COLORS[idx];

      const aBg = this.add
        .rectangle(GAME_W / 2, y, btnWidth, btnHeight, color, 0.8)
        .setStrokeStyle(2, 0xffffff40)
        .setInteractive({ useHandCursor: true });
      this.overlay.add(aBg);

      const label = this.add
        .text(GAME_W / 2 - btnWidth / 2 + 30, y, ANSWER_LABELS[idx], {
          fontSize: "18px",
          fontFamily: "Arial, sans-serif",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.overlay.add(label);

      const aText = this.add
        .text(GAME_W / 2 + 10, y, option, {
          fontSize: "17px",
          fontFamily: "Arial, sans-serif",
          color: "#ffffff",
          wordWrap: { width: 400 },
        })
        .setOrigin(0.5);
      this.overlay.add(aText);

      aBg.on("pointerover", () => aBg.setAlpha(1));
      aBg.on("pointerout", () => aBg.setAlpha(0.8));
      aBg.on("pointerdown", () => {
        this.handleAnswer(idx);
      });
    });
  }

  private handleAnswer(selectedIndex: number): void {
    if (this.sceneState !== "question" || !this.currentQuestion) return;
    this.sceneState = "feedback";

    const correct = selectedIndex === this.currentQuestion.correctIndex;

    if (correct) {
      this.bonusMoves = 3;
    }

    this.showFeedback(correct, this.currentQuestion.explanation);
  }

  private showFeedback(correct: boolean, explanation: string): void {
    this.overlay.removeAll(true);

    const bg = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.9)
      .setInteractive();
    this.overlay.add(bg);

    const icon = correct ? "\u2705" : "\u274C";
    const title = correct ? "Correct!" : "Not quite!";
    const titleColor = correct ? "#4caf50" : "#ff9800";

    const iconText = this.add
      .text(GAME_W / 2, 150, icon, {
        fontSize: "60px",
      })
      .setOrigin(0.5);
    this.overlay.add(iconText);

    const titleText = this.add
      .text(GAME_W / 2, 220, title, {
        fontSize: "32px",
        fontFamily: "Arial, sans-serif",
        color: titleColor,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay.add(titleText);

    if (correct) {
      const bonusText = this.add
        .text(GAME_W / 2, 265, "+3 Bonus Moves!", {
          fontSize: "20px",
          fontFamily: "Arial, sans-serif",
          color: "#ffd700",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.overlay.add(bonusText);
    }

    // Explanation
    const expText = this.add
      .text(GAME_W / 2, 320, explanation, {
        fontSize: "16px",
        fontFamily: "Arial, sans-serif",
        color: "#c0c0c0",
        wordWrap: { width: 500 },
        align: "center",
        lineSpacing: 4,
      })
      .setOrigin(0.5);
    this.overlay.add(expText);

    // Continue button
    const btnBg = this.add
      .rectangle(GAME_W / 2, 430, 200, 50, 0x4caf50)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    this.overlay.add(btnBg);

    const btnText = this.add
      .text(GAME_W / 2, 430, "Continue", {
        fontSize: "22px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.overlay.add(btnText);

    btnBg.on("pointerover", () => btnBg.setFillStyle(0x66bb6a));
    btnBg.on("pointerout", () => btnBg.setFillStyle(0x4caf50));
    btnBg.on("pointerdown", () => {
      this.overlay.removeAll(true);
      this.startLevel(this.currentLevel + 1);
    });
  }
}
