interface ComboEffectsProps {
  streak: number;
  streakJustBroke: boolean;
}

function getGlowClass(streak: number): string {
  if (streak >= 5) return "combo-glow-rainbow";
  if (streak >= 3) return "combo-glow-gold";
  if (streak >= 2) return "combo-glow-green";
  return "";
}

export function ComboEffects({ streak, streakJustBroke }: ComboEffectsProps) {
  if (streak < 2 && !streakJustBroke) return null;

  const glowClass = getGlowClass(streak);

  return (
    <div className="combo-effects-layer">
      {/* Screen edge glow */}
      {glowClass && <div className={`combo-screen-glow ${glowClass}`} />}

      {/* Combo counter — key forces re-mount to retrigger pop animation */}
      {streak >= 2 && (
        <div
          key={streak}
          className={`combo-counter ${streak >= 5 ? "combo-counter-fire" : ""}`}
        >
          {streak}x COMBO!
        </div>
      )}

      {/* Streak lost flash */}
      {streakJustBroke && (
        <div className="combo-streak-lost">Streak Lost!</div>
      )}
    </div>
  );
}
