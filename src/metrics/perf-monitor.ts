import type { PerformanceMetrics } from "../types";

interface TimingEntry {
  label: string;
  startTime: number;
  endTime: number;
  durationMs: number;
}

/**
 * Real-time performance monitoring for the entire pipeline.
 * Tracks load times, inference latency, memory, and frame budget.
 */
export class PerformanceMonitor {
  private timings: TimingEntry[] = [];
  private readonly maxTimings = 200;
  private frameTimestamps: number[] = [];
  private animFrameId: number | null = null;

  /** Start a named timer, returns a stop function */
  startTimer(label: string): () => TimingEntry {
    const startTime = performance.now();
    return () => {
      const endTime = performance.now();
      const entry: TimingEntry = {
        label,
        startTime,
        endTime,
        durationMs: endTime - startTime,
      };
      this.timings.push(entry);
      if (this.timings.length > this.maxTimings) {
        this.timings = this.timings.slice(-this.maxTimings);
      }
      return entry;
    };
  }

  /** Measure an async operation */
  async measure<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const stop = this.startTimer(label);
    const result = await fn();
    const entry = stop();
    return { result, durationMs: entry.durationMs };
  }

  /** Get average duration for a specific label */
  getAverage(label: string): number {
    const matching = this.timings.filter((t) => t.label === label);
    if (matching.length === 0) return 0;
    return matching.reduce((s, t) => s + t.durationMs, 0) / matching.length;
  }

  /** Get P95 latency for a specific label */
  getP95(label: string): number {
    const matching = this.timings
      .filter((t) => t.label === label)
      .map((t) => t.durationMs)
      .sort((a, b) => a - b);
    if (matching.length === 0) return 0;
    const idx = Math.floor(matching.length * 0.95);
    return matching[idx];
  }

  /** Get all timing entries */
  getAllTimings(): readonly TimingEntry[] {
    return [...this.timings];
  }

  /** Start FPS monitoring */
  startFPSMonitor(callback: (fps: number) => void): void {
    const tick = (timestamp: number) => {
      this.frameTimestamps.push(timestamp);
      const cutoff = timestamp - 2000;
      this.frameTimestamps = this.frameTimestamps.filter((t) => t > cutoff);
      const fps = Math.round(this.frameTimestamps.length / 2);
      callback(fps);
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  /** Stop FPS monitoring */
  stopFPSMonitor(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /** Get current memory usage estimate */
  getMemoryUsage(): { usedMB: number; totalMB: number } | null {
    if ("memory" in performance) {
      const mem = (performance as any).memory;
      return {
        usedMB: mem.usedJSHeapSize / (1024 * 1024),
        totalMB: mem.totalJSHeapSize / (1024 * 1024),
      };
    }
    return null;
  }

  /** Generate full snapshot */
  getSnapshot(modelMetrics: PerformanceMetrics): PerformanceSnapshot {
    return {
      modelLoadTimeMs: modelMetrics.modelLoadTimeMs,
      avgInferenceMs: modelMetrics.averageInferenceMs,
      peakInferenceMs: modelMetrics.peakInferenceMs,
      lastInferenceMs: modelMetrics.lastInferenceMs,
      totalInferences: modelMetrics.totalInferences,
      modelSizeMB: modelMetrics.modelSizeMB,
      memoryUsageMB: this.getMemoryUsage()?.usedMB ?? modelMetrics.memoryUsageMB,
      isOffline: modelMetrics.isOffline,
      p95InferenceMs: this.getP95("summarize"),
      avgSummaryMs: this.getAverage("summarize"),
      isMicActive: modelMetrics.isMicActive,
      recognitionConfidence: modelMetrics.recognitionConfidence,
    };
  }

  /** Reset all collected data */
  reset(): void {
    this.timings = [];
    this.frameTimestamps = [];
  }
}

export interface PerformanceSnapshot {
  modelLoadTimeMs: number;
  avgInferenceMs: number;
  peakInferenceMs: number;
  lastInferenceMs: number;
  totalInferences: number;
  modelSizeMB: number;
  memoryUsageMB: number;
  isOffline: boolean;
  p95InferenceMs: number;
  avgSummaryMs: number;
  isMicActive: boolean;
  recognitionConfidence: number;
}