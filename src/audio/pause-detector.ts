import type { TTSEvent } from "../types";
import { APP_CONFIG } from "../config";
import { TTSController } from "./tts-controller";

type PauseCallback = (durationMs: number) => void;

/**
 * Detects pauses in TTS output for filler insertion points.
 * Uses boundary events and timing analysis.
 */
export class PauseDetector {
  private lastBoundaryTime = 0;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private pauseCallbacks: PauseCallback[] = [];
  private isActive = false;
  private unsubscribers: (() => void)[] = [];

  constructor(private tts: TTSController) {}

  /** Start monitoring TTS for pauses */
  start(): void {
    if (this.isActive) return;
    this.isActive = true;

    const unsub1 = this.tts.on("boundary", (event: TTSEvent) => {
      this.handleBoundary(event);
    });

    const unsub2 = this.tts.on("start", () => {
      this.lastBoundaryTime = Date.now();
    });

    const unsub3 = this.tts.on("end", () => {
      this.clearPauseTimer();
    });

    this.unsubscribers.push(unsub1, unsub2, unsub3);
  }

  /** Stop monitoring */
  stop(): void {
    this.isActive = false;
    this.clearPauseTimer();
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  /** Register pause detection callback */
  onPause(callback: PauseCallback): () => void {
    this.pauseCallbacks.push(callback);
    return () => {
      const idx = this.pauseCallbacks.indexOf(callback);
      if (idx >= 0) this.pauseCallbacks.splice(idx, 1);
    };
  }

  private handleBoundary(event: TTSEvent): void {
    const now = event.timestamp;
    const gap = now - this.lastBoundaryTime;

    this.lastBoundaryTime = now;
    this.clearPauseTimer();

    // Start a new pause timer
    this.pauseTimer = setTimeout(() => {
      if (this.isActive && this.tts.isSpeaking) {
        const pauseDuration = Date.now() - this.lastBoundaryTime;
        if (pauseDuration >= APP_CONFIG.minPauseDurationMs) {
          this.emitPause(pauseDuration);
        }
      }
    }, APP_CONFIG.minPauseDurationMs);
  }

  private emitPause(durationMs: number): void {
    for (const cb of this.pauseCallbacks) {
      try { cb(durationMs); } catch (e) { console.error("Pause callback error:", e); }
    }
  }

  private clearPauseTimer(): void {
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
  }
}