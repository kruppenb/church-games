/**
 * Audio manager — generates simple tones programmatically via Web Audio API.
 * No audio files needed.
 */

class SoundManager {
  private audioContext: AudioContext | null = null;
  private unlocked = false;
  private muted = false;

  /** Must be called from a user interaction event to unlock audio. */
  unlock(): void {
    if (this.unlocked) return;
    this.audioContext = new AudioContext();
    this.unlocked = true;
  }

  /** Rising two-tone beep (C5 -> E5). */
  playCorrect(): void {
    this.playTone(523, 0.1);
    setTimeout(() => this.playTone(659, 0.15), 100);
  }

  /** Descending buzz. */
  playWrong(): void {
    this.playTone(200, 0.2);
  }

  /** Ascending arpeggio. */
  playCelebration(): void {
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.15), i * 100);
    });
  }

  /** Short click tone. */
  playClick(): void {
    this.playTone(800, 0.05);
  }

  /** Two-phrase victory fanfare for enhanced celebration overlay. */
  playVictoryFanfare(): void {
    if (!this.audioContext || this.muted) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // Phrase 1: Ascending fanfare (C5-E5-G5-C6)
    const notes = [
      { freq: 523, time: 0, dur: 0.2 },
      { freq: 659, time: 0.15, dur: 0.2 },
      { freq: 784, time: 0.3, dur: 0.2 },
      { freq: 1047, time: 0.45, dur: 0.35 },
      // Phrase 2: Triumphant resolution
      { freq: 784, time: 0.9, dur: 0.15 },
      { freq: 880, time: 1.0, dur: 0.15 },
      { freq: 988, time: 1.1, dur: 0.15 },
      { freq: 1047, time: 1.2, dur: 0.2 },
      { freq: 1319, time: 1.35, dur: 0.4 },
    ];

    for (const { freq, time, dur } of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, now + time);
      gain.gain.linearRampToValueAtTime(0.12, now + time + 0.02);
      gain.gain.setValueAtTime(0.12, now + time + dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);
      osc.start(now + time);
      osc.stop(now + time + dur + 0.01);
    }
  }

  /** Escalating streak tone. Replaces playCorrect when streak >= 2. */
  playStreakTone(streak: number): void {
    const frequencies = [523, 659, 784, 880, 988, 1047, 1175, 1319];
    const idx = Math.min(streak - 2, frequencies.length - 1);
    this.playTone(frequencies[idx], 0.12);
    if (streak >= 4) {
      setTimeout(() => this.playTone(frequencies[idx] * 1.5, 0.08), 50);
    }
  }

  /** Short descending womp for streak break. */
  playStreakLost(): void {
    this.playTone(400, 0.1);
    setTimeout(() => this.playTone(300, 0.15), 80);
  }

  /** Toggle mute on/off. Returns true if now muted. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /** Returns current mute state. */
  isMuted(): boolean {
    return this.muted;
  }

  private playTone(frequency: number, duration: number): void {
    if (!this.audioContext || this.muted) return;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    osc.frequency.value = frequency;
    osc.type = "sine";
    gain.gain.value = 0.1;
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.audioContext.currentTime + duration,
    );
    osc.start();
    osc.stop(this.audioContext.currentTime + duration);
  }
}

export const sounds = new SoundManager();

// Backward-compatible named exports used by existing game components
export function playCorrect(): void {
  sounds.playCorrect();
}

export function playWrong(): void {
  sounds.playWrong();
}

export function playCelebration(): void {
  sounds.playCelebration();
}
