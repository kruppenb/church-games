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
