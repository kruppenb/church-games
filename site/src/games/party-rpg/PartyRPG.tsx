import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { useLesson } from "@/hooks/useLesson";
import { useDifficulty } from "@/hooks/useDifficulty";
import { TeamSelectScene } from "./scenes/TeamSelectScene";
import { MapScene } from "./scenes/MapScene";
import { BattleScene } from "./scenes/BattleScene";

export function PartyRPG() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const { lesson, loading, error } = useLesson();
  const { difficulty } = useDifficulty();

  useEffect(() => {
    if (!containerRef.current || !lesson) return;

    // Destroy previous game instance if it exists
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 420,
      height: 600,
      backgroundColor: "#fafafa",
      scene: [TeamSelectScene, MapScene, BattleScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        activePointers: 1,
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Pass data to Phaser via registry
    game.registry.set("lesson", lesson);
    game.registry.set("difficulty", difficulty);

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // We intentionally only re-create the game when the lesson changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson]);

  // Update registry values without restarting the game
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.registry.set("difficulty", difficulty);
    }
  }, [difficulty]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error || !lesson) {
    return (
      <div className="rpg-container">
        <a href="#/" className="rpg-back-btn">
          &larr; Back
        </a>
        <div className="quiz-error">
          <p>Could not load lesson data.</p>
          <a href="#/" className="btn btn-primary">
            Go Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rpg-container">
      <a href="#/" className="rpg-back-btn">
        &larr; Back
      </a>
      <div ref={containerRef} className="phaser-container" />
    </div>
  );
}
