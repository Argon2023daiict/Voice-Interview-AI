import type { FillerPhrase } from "../types";
import { TTSController } from "./tts-controller";
import { APP_CONFIG } from "../config";

/**
 * Plays filler phrases using the same TTS engine.
 * Coordinates with pause detection to insert fillers naturally.
 */
export class FillerPlayer {
  private queue: FillerPhrase[] = [];
  private isPlaying = false;
  private playCount = 0;

  constructor(private tts: TTSController) {}

  /** Queue a filler phrase for playback */
  enqueue(filler: FillerPhrase): void {
    // Limit queue to prevent buildup
    if (this.queue.length < 3) {
      this.queue.push(filler);
    }
    this.processQueue();
  }

  /** Play a filler phrase immediately (pauses main TTS) */
  async playImmediate(filler: FillerPhrase): Promise<void> {
    if (this.isPlaying) return;

    this.isPlaying = true;
    const wasSpeaking = this.tts.isSpeaking;

    try {
      // Pause main speech if active
      if (wasSpeaking) {
        this.tts.pause();
        // Brief pause before filler for natural feel
        await this.delay(200);
      }

      // Speak the filler
      await this.tts.speak(filler.text);
      this.playCount++;

      // Brief pause after filler
      await this.delay(300);

      // Resume main speech
      if (wasSpeaking) {
        this.tts.resume();
      }
    } catch (error) {
      console.error("Filler playback error:", error);
    } finally {
      this.isPlaying = false;
    }
  }

  /** Get total fillers played */
  get totalPlayed(): number {
    return this.playCount;
  }

  /** Clear the filler queue */
  clearQueue(): void {
    this.queue = [];
  }

  private async processQueue(): Promise<void> {
    if (this.isPlaying || this.queue.length === 0) return;

    const filler = this.queue.shift();
    if (filler) {
      await this.playImmediate(filler);
      // Process next in queue
      this.processQueue();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}