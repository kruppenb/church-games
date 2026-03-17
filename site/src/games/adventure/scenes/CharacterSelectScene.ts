import Phaser from "phaser";

interface CharacterOption {
  name: string;
  color: number;
  label: string;
}

const CHARACTERS: CharacterOption[] = [
  { name: "Knight", color: 0x1e88e5, label: "Knight" },
  { name: "Wizard", color: 0x8e24aa, label: "Wizard" },
  { name: "Archer", color: 0x43a047, label: "Archer" },
  { name: "Princess", color: 0xe91e63, label: "Princess" },
];

export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: "CharacterSelectScene" });
  }

  create(): void {
    const { width, height } = this.scale;
    const isGroup = this.registry.get("mode") === "group";
    const titleSize = isGroup ? "40px" : "32px";
    const cardSize = isGroup ? 100 : 80;
    const nameSize = isGroup ? "20px" : "16px";

    // Background
    this.cameras.main.setBackgroundColor("#f5f0e8");

    // Title
    this.add
      .text(width / 2, height * 0.12, "Choose Your Hero!", {
        fontSize: titleSize,
        fontFamily: "sans-serif",
        color: "#333333",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Character cards
    const totalWidth = CHARACTERS.length * (cardSize + 40) - 40;
    const startX = (width - totalWidth) / 2 + cardSize / 2;
    const centerY = height * 0.45;

    CHARACTERS.forEach((char, i) => {
      const x = startX + i * (cardSize + 40);

      // Card background
      const cardBg = this.add.rectangle(
        x,
        centerY,
        cardSize + 30,
        cardSize + 60,
        0xffffff,
      );
      cardBg.setStrokeStyle(3, 0xe0e0e0);

      // Character circle
      const circle = this.add.circle(x, centerY - 12, cardSize / 2, char.color);

      // Character initial letter
      this.add
        .text(x, centerY - 12, char.name[0], {
          fontSize: `${Math.round(cardSize * 0.5)}px`,
          fontFamily: "sans-serif",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      // Character name
      this.add
        .text(x, centerY + cardSize / 2 + 10, char.label, {
          fontSize: nameSize,
          fontFamily: "sans-serif",
          color: "#333333",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      // Make interactive
      cardBg.setInteractive({ useHandCursor: true });
      circle.setInteractive({ useHandCursor: true });

      const onSelect = () => {
        this.registry.set("character", char);
        // Brief scale-up animation then start adventure
        this.tweens.add({
          targets: [circle, cardBg],
          scaleX: 1.2,
          scaleY: 1.2,
          duration: 200,
          yoyo: true,
          onComplete: () => {
            this.scene.start("BrawlerScene");
          },
        });
      };

      cardBg.on("pointerdown", onSelect);
      circle.on("pointerdown", onSelect);

      // Hover effect
      const onHover = () => {
        cardBg.setStrokeStyle(3, char.color);
      };
      const onOut = () => {
        cardBg.setStrokeStyle(3, 0xe0e0e0);
      };

      cardBg.on("pointerover", onHover);
      cardBg.on("pointerout", onOut);
      circle.on("pointerover", onHover);
      circle.on("pointerout", onOut);
    });

    // Subtitle
    this.add
      .text(width / 2, height * 0.75, "Tap a hero to begin your adventure!", {
        fontSize: isGroup ? "22px" : "16px",
        fontFamily: "sans-serif",
        color: "#757575",
      })
      .setOrigin(0.5);
  }
}
