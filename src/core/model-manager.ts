import type { ModelConfig, PerformanceMetrics } from "../types";
import { MODEL_CONFIG, APP_CONFIG } from "../config";
import { ExtractiveSummarizer } from "./summarizer";
import { TransformersSummarizer } from "./transformers-summarizer";

/**
 * Manages model lifecycle with Tier system:
 *
 * Tier 1 (ALWAYS ON):  TextRank extractive — 0MB, 2-15ms
 * Tier 2 (OPT-IN):     Transformers.js flan-t5-small — ~60MB, 0.5-2s
 */
export class ModelManager {
  private extractive: ExtractiveSummarizer;
  private transformers: TransformersSummarizer | null = null;
  private _metrics: PerformanceMetrics;

  constructor() {
    this.extractive = new ExtractiveSummarizer();
    this._metrics = {
      modelLoadTimeMs: 0,
      averageInferenceMs: 0,
      peakInferenceMs: 0,
      totalInferences: 0,
      lastInferenceMs: 0,
      memoryUsageMB: 0,
      modelSizeMB: 0,
      isOffline: !navigator.onLine,
      isMicActive: false,
      recognitionConfidence: 0,
    };

    window.addEventListener("online", () => {
      this._metrics.isOffline = false;
    });
    window.addEventListener("offline", () => {
      this._metrics.isOffline = true;
    });
  }

  get metrics(): Readonly<PerformanceMetrics> {
    return { ...this._metrics };
  }

  get extractiveSummarizer(): ExtractiveSummarizer {
    return this.extractive;
  }

  get transformersSummarizer(): TransformersSummarizer | null {
    return this.transformers;
  }

  get isNeuralReady(): boolean {
    return this.transformers?.isReady ?? false;
  }

  /**
   * Initialize Tier 1 (always instant, 0 MB).
   * Tier 2 is NOT loaded here — see loadNeuralSummarizer().
   */
  async initialize(_config: ModelConfig = MODEL_CONFIG): Promise<void> {
    const startTime = performance.now();
    console.log("[ModelManager] Tier 1 (TextRank) ready — 0 MB, <15ms");
    this._metrics.modelLoadTimeMs = performance.now() - startTime;
    this.updateMemoryUsage();
  }

  /**
   * Opt-in: Load Tier 2 neural summarizer.
   * Downloads ~60MB model. Only called when user clicks "Enable AI Summary".
   */
  async loadNeuralSummarizer(
    onProgress?: (progress: { loaded: number; total: number; status: string }) => void
  ): Promise<void> {
    if (this.transformers?.isReady) {
      console.log("[ModelManager] Tier 2 already loaded");
      return;
    }

    this.transformers = new TransformersSummarizer({
      modelId: "Xenova/flan-t5-small",
      quantized: true,
      maxNewTokens: 80,
      minNewTokens: 20,
    });

    try {
      const { loadTimeMs, modelSizeMB } = await this.transformers.initialize(onProgress);
      this._metrics.modelSizeMB = modelSizeMB;
      this._metrics.modelLoadTimeMs = loadTimeMs;
      console.log(
        `[ModelManager] Tier 2 (flan-t5-small) ready — ~${modelSizeMB.toFixed(0)}MB in ${loadTimeMs.toFixed(0)}ms`
      );
    } catch (error) {
      console.warn("[ModelManager] Tier 2 load failed, staying on Tier 1:", error);
      this.transformers = null;
      throw error;
    }

    this.updateMemoryUsage();
  }

  recordInference(latencyMs: number): void {
    this._metrics.totalInferences++;
    this._metrics.lastInferenceMs = latencyMs;
    this._metrics.peakInferenceMs = Math.max(this._metrics.peakInferenceMs, latencyMs);
    this._metrics.averageInferenceMs =
      (this._metrics.averageInferenceMs * (this._metrics.totalInferences - 1) + latencyMs) /
      this._metrics.totalInferences;
    this.updateMemoryUsage();
  }

  setMicActive(active: boolean): void {
    this._metrics.isMicActive = active;
  }

  setRecognitionConfidence(confidence: number): void {
    this._metrics.recognitionConfidence = confidence;
  }

  isWithinLatencyBudget(latencyMs: number): boolean {
    return latencyMs <= APP_CONFIG.latencyTargetMs;
  }

  private updateMemoryUsage(): void {
    if ("memory" in performance) {
      const mem = (performance as any).memory;
      this._metrics.memoryUsageMB = mem.usedJSHeapSize / (1024 * 1024);
    }
  }

  async dispose(): Promise<void> {
    if (this.transformers) {
      await this.transformers.dispose();
      this.transformers = null;
    }
  }
}