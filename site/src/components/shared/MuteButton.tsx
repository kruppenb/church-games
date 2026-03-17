import { useState, useCallback } from "react";
import { sounds } from "@/lib/sounds";

export function MuteButton() {
  const [muted, setMuted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const handleClick = useCallback(() => {
    if (!unlocked) {
      // First click: unlock audio context and play a test tone
      sounds.unlock();
      sounds.playClick();
      setUnlocked(true);
      return;
    }
    const nowMuted = sounds.toggleMute();
    setMuted(nowMuted);
  }, [unlocked]);

  return (
    <button
      className="mute-button"
      onClick={handleClick}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      title={muted ? "Unmute sounds" : "Mute sounds"}
    >
      {muted ? (
        // Muted speaker icon (SVG)
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        // Speaker icon with waves (SVG)
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )}
    </button>
  );
}
