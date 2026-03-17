import { useEffect } from "react";

interface CelebrationProps {
  show: boolean;
  text?: string;
  stars?: number;
  score?: number;
  onDismiss: () => void;
}

const CONFETTI_COLORS = [
  "#E53935",
  "#1E88E5",
  "#43A047",
  "#FB8C00",
  "#8E24AA",
  "#FFC107",
  "#00897B",
  "#FF5722",
];

export function Celebration({
  show,
  text = "Great Job!",
  stars = 3,
  score,
  onDismiss,
}: CelebrationProps) {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [show, onDismiss]);

  if (!show) return null;

  const clampedStars = Math.max(0, Math.min(3, stars));

  return (
    <div className="celebration-overlay" onClick={onDismiss}>
      {/* Confetti pieces */}
      {Array.from({ length: 40 }).map((_, i) => {
        const color =
          CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const size = 6 + Math.random() * 8;
        const drift = -30 + Math.random() * 60;
        const rotation = Math.random() * 360;
        const isCircle = i % 3 === 0;

        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              backgroundColor: color,
              animationDelay: `${delay}s`,
              borderRadius: isCircle ? "50%" : "2px",
              // Pass drift and rotation as CSS custom properties
              "--confetti-drift": `${drift}px`,
              "--confetti-rotation": `${rotation}deg`,
            } as React.CSSProperties}
          />
        );
      })}

      {/* Central content */}
      <div className="celebration-content">
        <div className="celebration-text">{text}</div>
        {clampedStars > 0 && (
          <div className="celebration-stars">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={`celebration-star ${i < clampedStars ? "celebration-star-earned" : "celebration-star-empty"}`}
                style={
                  i < clampedStars
                    ? { animationDelay: `${0.2 + i * 0.2}s` }
                    : undefined
                }
              >
                &#9733;
              </span>
            ))}
          </div>
        )}
        {score !== undefined && (
          <div className="celebration-score">{score} points</div>
        )}
      </div>
    </div>
  );
}
