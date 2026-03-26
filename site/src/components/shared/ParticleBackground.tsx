const COLORS = ["#00d4ff", "#ff2d78", "#ffd700"];

const PARTICLES = Array.from({ length: 15 }, (_, i) => ({
  left: `${2 + Math.random() * 96}%`,
  size: 2 + Math.random() * 4,
  color: COLORS[i % COLORS.length],
  opacity: 0.2 + Math.random() * 0.4,
  duration: 15 + Math.random() * 15,
  delay: -(Math.random() * 30),
  drift: -40 + Math.random() * 80,
}));

export function ParticleBackground() {
  return (
    <div className="particle-bg" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="particle"
          style={
            {
              left: p.left,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              boxShadow: `0 0 6px ${p.color}`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              "--particle-opacity": p.opacity,
              "--particle-drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
