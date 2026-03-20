import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty, type Difficulty } from "@/hooks/useDifficulty";
import { TowerScene } from "./scenes/TowerScene";

export function TowerDefense() {
  const { lesson, loading, error } = useLesson();
  const { difficulty: contextDifficulty, setDifficulty } = useDifficulty();
  const [difficultyConfirmed, setDifficultyConfirmed] = useState(false);
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePickDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    setDifficultyConfirmed(true);
  };

  useEffect(() => {
    if (!containerRef.current || !lesson || !difficultyConfirmed) return;

    // Destroy any previous game instance
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 800,
      height: 600,
      backgroundColor: "#111118",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [TowerScene],
    });

    // Pass data to Phaser via registry
    game.registry.set("lesson", lesson);
    game.registry.set("difficulty", contextDifficulty);

    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [lesson, contextDifficulty, difficultyConfirmed]);

  if (loading) {
    return (
      <div className="adventure-container">
        <div className="loading">Loading lesson...</div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="adventure-container">
        <div className="adventure-error">
          <h2>Could not load lesson</h2>
          <p>{error ?? "No lesson data available."}</p>
          <a href="#/" className="btn btn-primary">
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  if (!difficultyConfirmed) {
    return (
      <div className="adventure-container">
        <a href="#/" className="adventure-back-btn btn btn-secondary">
          &larr; Back to Games
        </a>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: "24px",
            color: "#fff",
            fontFamily: "'Segoe UI', Arial, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "32px", color: "#ffdd00", margin: 0 }}>
            Faith Fortress
          </h1>
          <p style={{ fontSize: "16px", color: "#ccc", margin: 0 }}>
            Choose your difficulty:
          </p>
          <div style={{ display: "flex", gap: "20px" }}>
            <button
              className="btn btn-primary"
              style={{
                padding: "16px 32px",
                fontSize: "18px",
                cursor: "pointer",
                backgroundColor:
                  contextDifficulty === "little-kids" ? "#44aa44" : "#336633",
                border: "2px solid #44aa44",
                borderRadius: "8px",
                color: "#fff",
              }}
              onClick={() => handlePickDifficulty("little-kids")}
            >
              Little Kids
            </button>
            <button
              className="btn btn-primary"
              style={{
                padding: "16px 32px",
                fontSize: "18px",
                cursor: "pointer",
                backgroundColor:
                  contextDifficulty === "big-kids" ? "#4488ff" : "#335588",
                border: "2px solid #4488ff",
                borderRadius: "8px",
                color: "#fff",
              }}
              onClick={() => handlePickDifficulty("big-kids")}
            >
              Big Kids
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="adventure-container">
      <a href="#/" className="adventure-back-btn btn btn-secondary">
        &larr; Back to Games
      </a>
      <div ref={containerRef} className="phaser-container" />
    </div>
  );
}
