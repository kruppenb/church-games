import Phaser from "phaser";
import type { LessonConfig, Question } from "@/types/lesson";
import { filterByDifficulty } from "@/lib/difficulty";
import {
  createInitialState,
  answerQuestion,
  tickTimer,
  isRoomCleared,
  isEscapeComplete,
  calculateStars,
  ROOM_TYPES,
  type EscapeState,
  type RoomType,
} from "../logic/escape-logic";

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

/** Background color per room type. */
const ROOM_COLORS: Record<RoomType, number> = {
  decode: 0x1a237e, // deep indigo
  timeline: 0x004d40, // teal
  search: 0x4a148c, // deep purple
  code: 0xbf360c, // deep orange
  final: 0x880e4f, // deep pink
};

/** Friendly label per room type. */
const ROOM_LABELS: Record<RoomType, string> = {
  decode: "Decode Room",
  timeline: "Timeline Room",
  search: "Search Room",
  code: "Code Room",
  final: "Final Room",
};

/** Answer button colors matching the project convention. */
const ANSWER_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00];

const COLOR_CORRECT = 0x4caf50;
const COLOR_WRONG = 0xf44336;

const TOTAL_ROOMS = 5;
const TIME_LITTLE_KIDS = 180;
const TIME_BIG_KIDS = 120;

// ---------------------------------------------------------------------------
// EscapeScene
// ---------------------------------------------------------------------------

export class EscapeScene extends Phaser.Scene {
  private state!: EscapeState;
  private filteredQuestions: Question[] = [];
  private difficulty: "little-kids" | "big-kids" = "little-kids";

  // Timer
  private timerEvent?: Phaser.Time.TimerEvent;
  private timerText!: Phaser.GameObjects.Text;

  // Room HUD
  private roomTitleText!: Phaser.GameObjects.Text;
  private roomNumberText!: Phaser.GameObjects.Text;
  private progressBarBg!: Phaser.GameObjects.Rectangle;
  private progressBarFill!: Phaser.GameObjects.Rectangle;

  // Room visuals
  private roomBg!: Phaser.GameObjects.Rectangle;
  private roomIcon!: Phaser.GameObjects.Graphics;

  // Question panel objects (cleaned up between questions)
  private questionPanel: Phaser.GameObjects.GameObject[] = [];
  private isShowingQuestion = false;
  private isTransitioning = false;

  // Track which questions have been used
  private questionIndex = 0;

  constructor() {
    super({ key: "EscapeScene" });
  }

  create(): void {
    const lesson = this.registry.get("lesson") as LessonConfig;
    this.difficulty = (this.registry.get("difficulty") as string as "little-kids" | "big-kids") ?? "little-kids";

    // Filter questions by difficulty inside the scene
    this.filteredQuestions = filterByDifficulty(
      lesson.questions,
      this.difficulty,
    );

    if (this.filteredQuestions.length === 0) {
      this.add
        .text(
          this.scale.width / 2,
          this.scale.height / 2,
          "No questions available for this difficulty!",
          {
            fontSize: "24px",
            fontFamily: "sans-serif",
            color: "#ffffff",
          },
        )
        .setOrigin(0.5);
      return;
    }

    // Determine room count — cap at available questions
    const roomCount = Math.min(TOTAL_ROOMS, this.filteredQuestions.length);
    const timeLimit =
      this.difficulty === "little-kids" ? TIME_LITTLE_KIDS : TIME_BIG_KIDS;

    this.state = createInitialState(roomCount, timeLimit);
    this.questionIndex = 0;
    this.isShowingQuestion = false;
    this.isTransitioning = false;

    // Background (will be colored per room)
    this.roomBg = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      ROOM_COLORS[this.state.rooms[0].roomType],
    );

    // Room icon graphics layer
    this.roomIcon = this.add.graphics();
    this.roomIcon.setDepth(1);

    // ---- HUD ----

    // Timer (top-right)
    this.timerText = this.add.text(
      this.scale.width - 20,
      15,
      this.formatTime(this.state.timeRemaining),
      {
        fontFamily: "sans-serif",
        fontSize: "22px",
        color: "#ffffff",
        fontStyle: "bold",
        backgroundColor: "rgba(0,0,0,0.4)",
        padding: { x: 10, y: 5 },
      },
    );
    this.timerText.setOrigin(1, 0);
    this.timerText.setDepth(20);

    // Room title (top-center)
    this.roomTitleText = this.add.text(
      this.scale.width / 2,
      15,
      ROOM_LABELS[this.state.rooms[0].roomType],
      {
        fontFamily: "sans-serif",
        fontSize: "24px",
        color: "#ffffff",
        fontStyle: "bold",
      },
    );
    this.roomTitleText.setOrigin(0.5, 0);
    this.roomTitleText.setDepth(20);

    // Room number (top-left, offset to avoid HTML back button)
    this.roomNumberText = this.add.text(
      120,
      15,
      `Room 1 / ${this.state.totalRooms}`,
      {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#ffffff",
        fontStyle: "bold",
        backgroundColor: "rgba(0,0,0,0.4)",
        padding: { x: 8, y: 4 },
      },
    );
    this.roomNumberText.setDepth(20);

    // Progress bar
    const barW = Math.min(this.scale.width - 60, 400);
    const barH = 16;
    const barY = this.scale.height - 30;

    this.progressBarBg = this.add.rectangle(
      this.scale.width / 2,
      barY,
      barW,
      barH,
      0x000000,
      0.4,
    );
    this.progressBarBg.setDepth(20);

    this.progressBarFill = this.add.rectangle(
      this.scale.width / 2 - barW / 2,
      barY,
      0,
      barH,
      0x4caf50,
    );
    this.progressBarFill.setOrigin(0, 0.5);
    this.progressBarFill.setDepth(21);

    // Draw current room
    this.drawRoom();
    this.updateProgressBar();

    // Start countdown timer
    this.timerEvent = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        this.state = tickTimer(this.state, 0.1);
        this.timerText.setText(this.formatTime(this.state.timeRemaining));

        // Color warning when low
        if (this.state.timeRemaining <= 30) {
          this.timerText.setColor("#ff5252");
        }

        if (this.state.failed) {
          this.onFailed();
        }
      },
    });

    // Auto-show first question after a short delay
    this.time.delayedCall(600, () => {
      this.showRoomQuestion();
    });

    // Handle resize
    this.scale.on("resize", () => {
      this.repositionUI();
    });
  }

  // -----------------------------------------------------------------------
  // Room visuals
  // -----------------------------------------------------------------------

  private drawRoom(): void {
    const room = this.state.rooms[this.state.currentRoom];
    const w = this.scale.width;
    const h = this.scale.height;

    // Background color
    this.roomBg.setPosition(w / 2, h / 2);
    this.roomBg.setSize(w, h);
    this.roomBg.setFillStyle(ROOM_COLORS[room.roomType]);

    // Draw thematic icon in center
    this.roomIcon.clear();
    const cx = w / 2;
    const cy = h / 2 - 30;
    const size = Math.min(w, h) * 0.12;

    this.roomIcon.lineStyle(3, 0xffffff, 0.4);

    switch (room.roomType) {
      case "decode":
        // Grid of dots (cipher/decode feel)
        for (let r = -1; r <= 1; r++) {
          for (let c = -1; c <= 1; c++) {
            this.roomIcon.fillStyle(0xffffff, 0.3);
            this.roomIcon.fillCircle(cx + c * size * 0.5, cy + r * size * 0.5, 6);
          }
        }
        break;

      case "timeline":
        // Horizontal line with dots (timeline)
        this.roomIcon.strokeLineShape(
          new Phaser.Geom.Line(cx - size, cy, cx + size, cy),
        );
        for (let i = -2; i <= 2; i++) {
          this.roomIcon.fillStyle(0xffffff, 0.4);
          this.roomIcon.fillCircle(cx + i * (size * 0.5), cy, 8);
        }
        break;

      case "search":
        // Magnifying glass shape
        this.roomIcon.strokeCircle(cx - size * 0.15, cy - size * 0.15, size * 0.4);
        this.roomIcon.strokeLineShape(
          new Phaser.Geom.Line(
            cx + size * 0.15,
            cy + size * 0.15,
            cx + size * 0.5,
            cy + size * 0.5,
          ),
        );
        break;

      case "code":
        // Lock shape (rectangle + circle on top)
        this.roomIcon.strokeRect(
          cx - size * 0.35,
          cy - size * 0.1,
          size * 0.7,
          size * 0.6,
        );
        this.roomIcon.strokeCircle(cx, cy - size * 0.3, size * 0.25);
        break;

      case "final":
        // Star shape
        {
          const points: number[] = [];
          for (let i = 0; i < 10; i++) {
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            const radius = i % 2 === 0 ? size * 0.5 : size * 0.25;
            points.push(cx + Math.cos(angle) * radius);
            points.push(cy + Math.sin(angle) * radius);
          }
          this.roomIcon.fillStyle(0xffffff, 0.25);
          this.roomIcon.fillPoints(points, true);
        }
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Question overlay
  // -----------------------------------------------------------------------

  private showRoomQuestion(): void {
    if (this.isShowingQuestion || this.isTransitioning) return;
    if (this.state.completed || this.state.failed) return;

    const question = this.getNextQuestion();
    if (!question) return;

    this.isShowingQuestion = true;

    const w = this.scale.width;
    const h = this.scale.height;

    // Semi-transparent overlay
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.5);
    overlay.setDepth(30);
    this.questionPanel.push(overlay);

    // Panel
    const panelW = Math.min(w - 40, 520);
    const panelH = Math.min(h - 80, 420);
    const panelX = w / 2;
    const panelY = h / 2;

    const panelBg = this.add.rectangle(panelX, panelY, panelW, panelH, 0xffffff, 0.95);
    panelBg.setStrokeStyle(3, 0x333333);
    panelBg.setDepth(31);
    this.questionPanel.push(panelBg);

    // Room type label at top of panel
    const room = this.state.rooms[this.state.currentRoom];
    const roomLabel = this.add.text(
      panelX,
      panelY - panelH / 2 + 16,
      ROOM_LABELS[room.roomType],
      {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#888888",
        fontStyle: "bold",
      },
    );
    roomLabel.setOrigin(0.5, 0);
    roomLabel.setDepth(32);
    this.questionPanel.push(roomLabel);

    // Question text
    const questionText = this.add.text(
      panelX,
      panelY - panelH / 2 + 45,
      question.text,
      {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#212121",
        fontStyle: "bold",
        wordWrap: { width: panelW - 50 },
        align: "center",
      },
    );
    questionText.setOrigin(0.5, 0);
    questionText.setDepth(32);
    this.questionPanel.push(questionText);

    // Answer buttons
    const btnStartY = panelY - 10;
    const btnHeight = 46;
    const btnGap = 12;
    const btnW = panelW - 60;

    question.options.forEach((option, idx) => {
      const btnY = btnStartY + idx * (btnHeight + btnGap);

      const btnBg = this.add.rectangle(
        panelX,
        btnY,
        btnW,
        btnHeight,
        ANSWER_COLORS[idx % ANSWER_COLORS.length],
      );
      btnBg.setDepth(32);
      btnBg.setInteractive({ useHandCursor: true });
      this.questionPanel.push(btnBg);

      const btnText = this.add.text(panelX, btnY, option, {
        fontFamily: "sans-serif",
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold",
        wordWrap: { width: btnW - 20 },
        align: "center",
      });
      btnText.setOrigin(0.5, 0.5);
      btnText.setDepth(33);
      this.questionPanel.push(btnText);

      btnBg.on("pointerdown", () => {
        const correct = idx === question.correctIndex;
        this.handleAnswer(correct);
      });
    });
  }

  private handleAnswer(correct: boolean): void {
    // Disable further clicks
    for (const obj of this.questionPanel) {
      if (obj instanceof Phaser.GameObjects.Rectangle && obj.input) {
        obj.disableInteractive();
      }
    }

    this.state = answerQuestion(this.state, correct);
    this.updateProgressBar();

    if (correct) {
      this.showAnswerFlash(true);
      this.time.delayedCall(800, () => {
        this.clearQuestionPanel();
        this.isShowingQuestion = false;

        if (isEscapeComplete(this.state)) {
          this.onComplete();
        } else if (isRoomCleared(this.state)) {
          // Already advanced to next room — show transition
          // currentRoom was already advanced by answerQuestion
          // but the previous room was cleared, so show transition
          this.showRoomTransition();
        } else {
          // Room not yet cleared — show next question
          this.showRoomQuestion();
        }
      });
    } else {
      this.showAnswerFlash(false);

      if (this.state.failed) {
        this.time.delayedCall(800, () => {
          this.clearQuestionPanel();
          this.isShowingQuestion = false;
          this.onFailed();
        });
        return;
      }

      // Re-enable after delay so player can retry
      this.time.delayedCall(800, () => {
        this.clearQuestionPanel();
        this.isShowingQuestion = false;
        this.showRoomQuestion();
      });
    }
  }

  private showAnswerFlash(correct: boolean): void {
    const w = this.scale.width;
    const h = this.scale.height;

    const flashColor = correct ? COLOR_CORRECT : COLOR_WRONG;
    const flashLabel = correct ? "Correct!" : "Try Again!";

    const flash = this.add.rectangle(w / 2, h / 2, w, h, flashColor, 0.3);
    flash.setDepth(40);

    const label = this.add.text(w / 2, h / 2, flashLabel, {
      fontFamily: "sans-serif",
      fontSize: "36px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 3,
    });
    label.setOrigin(0.5, 0.5);
    label.setDepth(41);

    this.time.delayedCall(700, () => {
      flash.destroy();
      label.destroy();
    });
  }

  private clearQuestionPanel(): void {
    for (const obj of this.questionPanel) {
      obj.destroy();
    }
    this.questionPanel = [];
  }

  // -----------------------------------------------------------------------
  // Room transition
  // -----------------------------------------------------------------------

  private showRoomTransition(): void {
    this.isTransitioning = true;

    const w = this.scale.width;
    const h = this.scale.height;

    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.7);
    overlay.setDepth(50);

    const cleared = this.add.text(w / 2, h / 2 - 20, "Room Cleared!", {
      fontFamily: "sans-serif",
      fontSize: "40px",
      color: "#4caf50",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 3,
    });
    cleared.setOrigin(0.5, 0.5);
    cleared.setDepth(51);
    cleared.setAlpha(0);

    // Animate in
    this.tweens.add({
      targets: cleared,
      alpha: 1,
      scaleX: { from: 0.5, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      duration: 400,
      ease: "Back.easeOut",
    });

    this.time.delayedCall(1200, () => {
      overlay.destroy();
      cleared.destroy();
      this.isTransitioning = false;

      // Update visuals for new room
      this.drawRoom();
      this.updateHUD();

      // Show next room question
      this.time.delayedCall(400, () => {
        this.showRoomQuestion();
      });
    });
  }

  // -----------------------------------------------------------------------
  // HUD updates
  // -----------------------------------------------------------------------

  private updateHUD(): void {
    const room = this.state.rooms[this.state.currentRoom];
    this.roomTitleText.setText(ROOM_LABELS[room.roomType]);
    this.roomNumberText.setText(
      `Room ${this.state.currentRoom + 1} / ${this.state.totalRooms}`,
    );
  }

  private updateProgressBar(): void {
    const cleared = this.state.rooms.filter((r) => r.cleared).length;
    const fraction = cleared / this.state.totalRooms;
    const barW = Math.min(this.scale.width - 60, 400);
    this.progressBarFill.setSize(barW * fraction, 16);
  }

  private repositionUI(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.roomBg.setPosition(w / 2, h / 2);
    this.roomBg.setSize(w, h);

    this.timerText.setPosition(w - 20, 15);
    this.roomTitleText.setPosition(w / 2, 15);
    this.roomNumberText.setPosition(20, 15);

    const barW = Math.min(w - 60, 400);
    const barY = h - 30;
    this.progressBarBg.setPosition(w / 2, barY);
    this.progressBarBg.setSize(barW, 16);
    this.progressBarFill.setPosition(w / 2 - barW / 2, barY);
    this.updateProgressBar();

    this.drawRoom();
  }

  // -----------------------------------------------------------------------
  // Completion & Failure
  // -----------------------------------------------------------------------

  private onComplete(): void {
    if (this.timerEvent) {
      this.timerEvent.remove();
    }

    const w = this.scale.width;
    const h = this.scale.height;
    const stars = calculateStars(this.state);
    const timeLeft = Math.floor(this.state.timeRemaining);

    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.7);
    overlay.setDepth(50);

    const title = this.add.text(w / 2, h * 0.18, "Escape Complete!", {
      fontFamily: "sans-serif",
      fontSize: "36px",
      color: "#ffd700",
      fontStyle: "bold",
    });
    title.setOrigin(0.5, 0.5);
    title.setDepth(51);

    // Stars — earned stars in gold, empty in dim white
    const earnedStr = Array(stars).fill("\u2605").join(" ");
    const emptyStr = Array(3 - stars).fill("\u2606").join(" ");

    if (earnedStr) {
      const earnedText = this.add.text(
        w / 2 - (emptyStr ? 30 : 0),
        h * 0.3,
        earnedStr,
        { fontFamily: "sans-serif", fontSize: "48px", color: "#ffc107" },
      );
      earnedText.setOrigin(emptyStr ? 1 : 0.5, 0.5).setDepth(51);
    }
    if (emptyStr) {
      const emptyText = this.add.text(
        w / 2 + (earnedStr ? 30 : 0),
        h * 0.3,
        emptyStr,
        { fontFamily: "sans-serif", fontSize: "48px", color: "rgba(255,255,255,0.25)" },
      );
      emptyText.setOrigin(earnedStr ? 0 : 0.5, 0.5).setDepth(51);
    }

    // Score
    const scoreLabel = this.add.text(w / 2, h * 0.42, `Score: ${this.state.score}`, {
      fontFamily: "sans-serif",
      fontSize: "24px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    scoreLabel.setOrigin(0.5, 0.5);
    scoreLabel.setDepth(51);

    // Time remaining
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timeLabel = this.add.text(
      w / 2,
      h * 0.5,
      `Time remaining: ${mins}:${secs.toString().padStart(2, "0")}`,
      {
        fontFamily: "sans-serif",
        fontSize: "20px",
        color: "#ffffff",
      },
    );
    timeLabel.setOrigin(0.5, 0.5);
    timeLabel.setDepth(51);

    // Wrong answers
    const wrongLabel = this.add.text(
      w / 2,
      h * 0.57,
      `Wrong answers: ${this.state.wrongAnswers}`,
      {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#ffffff",
      },
    );
    wrongLabel.setOrigin(0.5, 0.5);
    wrongLabel.setDepth(51);

    // Play Again button
    this.createEndButton(w / 2 - 90, h * 0.7, "Play Again", 0x43a047, () => {
      this.scene.restart();
    });

    // Back button
    this.createEndButton(w / 2 + 90, h * 0.7, "Back to Games", 0x1e88e5, () => {
      window.location.hash = "#/";
    });
  }

  private onFailed(): void {
    if (this.timerEvent) {
      this.timerEvent.remove();
    }

    // Prevent double-triggering
    if (this.state.completed) return;

    const w = this.scale.width;
    const h = this.scale.height;

    // Clear any open question panel
    this.clearQuestionPanel();
    this.isShowingQuestion = false;

    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.7);
    overlay.setDepth(50);

    const title = this.add.text(w / 2, h * 0.25, "Time's Up!", {
      fontFamily: "sans-serif",
      fontSize: "40px",
      color: "#ff5252",
      fontStyle: "bold",
    });
    title.setOrigin(0.5, 0.5);
    title.setDepth(51);

    const cleared = this.state.rooms.filter((r) => r.cleared).length;
    const infoText = this.add.text(
      w / 2,
      h * 0.4,
      `Rooms cleared: ${cleared} / ${this.state.totalRooms}`,
      {
        fontFamily: "sans-serif",
        fontSize: "22px",
        color: "#ffffff",
      },
    );
    infoText.setOrigin(0.5, 0.5);
    infoText.setDepth(51);

    const scoreText = this.add.text(w / 2, h * 0.48, `Score: ${this.state.score}`, {
      fontFamily: "sans-serif",
      fontSize: "22px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    scoreText.setOrigin(0.5, 0.5);
    scoreText.setDepth(51);

    // Try Again button
    this.createEndButton(w / 2 - 90, h * 0.65, "Try Again", 0x43a047, () => {
      this.scene.restart();
    });

    // Back button
    this.createEndButton(w / 2 + 90, h * 0.65, "Back to Games", 0x1e88e5, () => {
      window.location.hash = "#/";
    });
  }

  private createEndButton(
    x: number,
    y: number,
    label: string,
    color: number,
    onClick: () => void,
  ): void {
    const btnBg = this.add.rectangle(x, y, 160, 50, color);
    btnBg.setStrokeStyle(2, 0x000000);
    btnBg.setDepth(52);
    btnBg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(x, y, label, {
      fontFamily: "sans-serif",
      fontSize: "17px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    btnText.setOrigin(0.5, 0.5);
    btnText.setDepth(53);

    btnBg.on("pointerdown", onClick);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private getNextQuestion(): Question | null {
    if (this.filteredQuestions.length === 0) return null;
    const q = this.filteredQuestions[this.questionIndex % this.filteredQuestions.length];
    this.questionIndex++;
    return q;
  }

  private formatTime(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
}
