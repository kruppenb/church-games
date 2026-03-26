import { useEffect, useRef, useState } from "react";
import { sounds } from "@/lib/sounds";

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

const SHAPE_CLASSES = [
  "",
  "",
  "confetti-streamer",
  "confetti-diamond",
  "",
] as const;

interface ConfettiData {
  color: string;
  left: number;
  delay: number;
  size: number;
  drift: number;
  rotation: number;
  shapeClass: string;
  isCircle: boolean;
}

interface FireworkParticle {
  dx: number;
  dy: number;
  color: string;
}

interface FireworkBurst {
  cx: number;
  cy: number;
  delay: number;
  particles: FireworkParticle[];
}

function generateConfetti(): ConfettiData[] {
  return Array.from({ length: 60 }, (_, i) => ({
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: Math.random() * 100,
    delay: Math.random() * 2,
    size: 6 + Math.random() * 8,
    drift: -40 + Math.random() * 80,
    rotation: Math.random() * 720,
    shapeClass: SHAPE_CLASSES[i % SHAPE_CLASSES.length],
    isCircle: i % 3 === 0,
  }));
}

function generateFireworks(): FireworkBurst[] {
  return [
    { cx: 30 + Math.random() * 15, cy: 25 + Math.random() * 15, delay: 0 },
    { cx: 55 + Math.random() * 15, cy: 20 + Math.random() * 15, delay: 300 },
  ].map((burst) => ({
    ...burst,
    particles: Array.from({ length: 10 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 50;
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      };
    }),
  }));
}

export function Celebration({
  show,
  text = "Great Job!",
  stars = 3,
  score,
  onDismiss,
}: CelebrationProps) {
  const [phase, setPhase] = useState(0);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const confettiRef = useRef<ConfettiData[]>([]);
  const fireworksRef = useRef<FireworkBurst[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Generate confetti/firework data when show transitions to true
  useEffect(() => {
    if (!show) {
      setPhase(0);
      return;
    }

    confettiRef.current = generateConfetti();
    fireworksRef.current = generateFireworks();

    // Play enhanced fanfare
    sounds.playVictoryFanfare();

    // Staggered phase reveals
    const schedule = (ms: number, fn: () => void) => {
      const id = setTimeout(fn, ms);
      timersRef.current.push(id);
    };

    schedule(500, () => setPhase(1));   // stars
    schedule(1200, () => setPhase(2));  // fireworks
    schedule(1600, () => setPhase(3));  // text
    schedule(2200, () => setPhase(4));  // trophy + shake
    schedule(5000, () => onDismissRef.current()); // auto-dismiss

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [show]);

  if (!show) return null;

  const clampedStars = Math.max(0, Math.min(3, stars));
  const confetti = confettiRef.current;
  const fireworks = fireworksRef.current;

  return (
    <div className="celebration-overlay" onClick={() => onDismissRef.current()}>
      {/* Confetti pieces — phase 0+ */}
      {confetti.map((c, i) => (
        <span
          key={i}
          className={`confetti-piece ${c.shapeClass}`}
          style={{
            left: `${c.left}%`,
            width: `${c.size}px`,
            height: c.shapeClass === "confetti-streamer" ? `${c.size * 2.5}px` : `${c.size}px`,
            backgroundColor: c.color,
            animationDelay: `${c.delay}s`,
            borderRadius: c.isCircle ? "50%" : "2px",
            "--confetti-drift": `${c.drift}px`,
            "--confetti-rotation": `${c.rotation}deg`,
          } as React.CSSProperties}
        />
      ))}

      {/* Firework bursts — phase 2+ */}
      {phase >= 2 && fireworks.map((burst, bi) => (
        <div
          key={`fw-${bi}`}
          className="firework-burst"
          style={{
            left: `${burst.cx}%`,
            top: `${burst.cy}%`,
            animationDelay: `${burst.delay}ms`,
          }}
        >
          {burst.particles.map((p, pi) => (
            <span
              key={pi}
              className="firework-particle"
              style={{
                "--fw-x": `${p.dx}px`,
                "--fw-y": `${p.dy}px`,
                backgroundColor: p.color,
                animationDelay: `${burst.delay}ms`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      ))}

      {/* Central content — shake on trophy phase */}
      <div className={`celebration-content ${phase >= 4 && clampedStars === 3 ? "celebration-shake" : ""}`}>
        {/* Text — phase 3+ */}
        <div className={`celebration-text ${phase >= 3 ? "celebration-text-visible" : "celebration-text-hidden"}`}>
          {text}
        </div>

        {/* Stars — phase 1+ */}
        {clampedStars > 0 && (
          <div className="celebration-stars">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={`celebration-star ${phase >= 1 && i < clampedStars ? "celebration-star-earned" : "celebration-star-empty"}`}
                style={
                  phase >= 1 && i < clampedStars
                    ? { animationDelay: `${i * 0.2}s` }
                    : undefined
                }
              >
                &#9733;
              </span>
            ))}
          </div>
        )}

        {/* Score */}
        {score !== undefined && (
          <div className="celebration-score">{score} points</div>
        )}

        {/* Trophy — phase 4+, 3 stars only */}
        {clampedStars === 3 && phase >= 4 && (
          <div className="celebration-trophy" aria-label="Trophy">
            &#127942;
          </div>
        )}
      </div>
    </div>
  );
}
