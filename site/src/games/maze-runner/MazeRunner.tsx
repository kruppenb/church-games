import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { EscapeScene } from "./scenes/EscapeScene";

export function MazeRunner() {
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || !lesson) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      backgroundColor: "#1a1a2e",
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [EscapeScene],
      input: {
        touch: true,
      },
      audio: {
        noAudio: true,
      },
    });

    // Pass data via registry — scene handles filtering
    game.registry.set("difficulty", difficulty);
    game.registry.set("lesson", lesson);

    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [lesson, difficulty]);

  if (loading) {
    return (
      <div className="maze-container">
        <div className="loading">Loading lesson...</div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="maze-container">
        <div className="quiz-error">
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
    <div className="maze-container">
      <a href="#/" className="maze-back-btn">
        &larr; Back
      </a>
      <div ref={containerRef} className="phaser-container" />
    </div>
  );
}
