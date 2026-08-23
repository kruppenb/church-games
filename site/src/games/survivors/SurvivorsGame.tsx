import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { HighScoreFlow } from "@/components/shared/HighScoreFlow";
import { SurvivorsScene } from "./scenes/SurvivorsScene";

export function SurvivorsGame() {
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();
  const [finishedScore, setFinishedScore] = useState<number | null>(null);

  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !lesson) return;

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
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scene: [SurvivorsScene],
    });

    // Pass data to Phaser via registry
    game.registry.set("lesson", lesson);
    game.registry.set("difficulty", difficulty);

    gameRef.current = game;

    const onFinished = (data: { score: number }) => setFinishedScore(data.score);
    game.events.on("game:finished", onFinished);

    return () => {
      game.events.off("game:finished", onFinished);
      game.destroy(true);
      gameRef.current = null;
    };
  }, [lesson, difficulty]);

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

  return (
    <div className="adventure-container">
      <a href="#/" className="adventure-back-btn btn btn-secondary">
        &larr; Back to Games
      </a>
      <div ref={containerRef} className="phaser-container" />
      <HighScoreFlow
        gameId="survivors"
        gameName="Survivors"
        score={finishedScore ?? 0}
        show={finishedScore !== null}
        onDone={() => setFinishedScore(null)}
      />
    </div>
  );
}
