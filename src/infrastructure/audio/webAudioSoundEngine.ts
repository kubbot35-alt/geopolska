import type {ISoundEngine} from '../../domain/types';

const MUTE_STORAGE_KEY = 'geopolska_sound_muted';

/**
 * Zero-dependency procedural Web Audio synthesizer providing subtle tactile game audio feedback.
 */
export class WebAudioSoundEngine implements ISoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  constructor() {
    try {
      if (typeof window !== 'undefined') {
        this.muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
      }
    } catch {
      this.muted = false;
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') {
      return null;
    }
    if (!this.ctx) {
      const AudioCtor = window.AudioContext;
      if (!AudioCtor) {
        return null;
      }
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType,
    volume: number,
    delaySec = 0,
  ): void {
    const ctx = this.getContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + durationSec);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
    } catch {
      // Storage unavailable
    }
  }

  playPinDrop(): void {
    this.playTone(540, 290, 0.09, 'triangle', 0.11);
    this.playTone(860, 620, 0.06, 'sine', 0.06, 0.025);
  }

  playHintUnlock(): void {
    this.playTone(440, 587.33, 0.14, 'sine', 0.09);
    this.playTone(587.33, 659.25, 0.18, 'triangle', 0.07, 0.09);
  }

  playRoundScore(score: number): void {
    if (score >= 4200) {
      this.playTone(523.25, 523.25, 0.14, 'sine', 0.11, 0);
      this.playTone(659.25, 659.25, 0.14, 'sine', 0.11, 0.09);
      this.playTone(783.99, 1046.5, 0.28, 'triangle', 0.12, 0.18);
    } else if (score >= 2200) {
      this.playTone(440, 440, 0.14, 'sine', 0.1, 0);
      this.playTone(554.37, 659.25, 0.2, 'triangle', 0.1, 0.1);
    } else {
      this.playTone(311.13, 246.94, 0.24, 'sine', 0.09, 0);
    }
  }

  playVictoryFanfare(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((note, idx) => {
      this.playTone(note, note, 0.26, 'triangle', 0.1, idx * 0.1);
    });
  }

  playTimerTick(): void {
    this.playTone(920, 740, 0.045, 'sine', 0.045);
  }
}

export const soundEngine = new WebAudioSoundEngine();
