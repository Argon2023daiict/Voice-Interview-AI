import type { SummaryResult, TranscriptEntry } from "../types";

/**
 * Abstractive summarizer using HuggingFace Transformers.js
 *
 * Tier 2: Optional, user opt-in only (~60MB download).
 * Uses Xenova/flan-t5-small quantized via WASM backend.
 */

let pipelineInstance: any = null;
let isLoading = false;

export interface TransformersSummarizerConfig {
  modelId: string;
  quantized: boolean;
  maxNewTokens: number;
  minNewTokens: number;
}

const DEFAULT_CONFIG: TransformersSummarizerConfig = {
  modelId: "Xenova/flan-t5-small",
  quantized: true,
  maxNewTokens: 80,
  minNewTokens: 20,
};

export class TransformersSummarizer {
  private config: TransformersSummarizerConfig;
  private _isReady = false;
  private _loadTimeMs = 0;
  private _modelSizeMB = 0;

  constructor(config: Partial<TransformersSummarizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get loadTimeMs(): number {
    return this._loadTimeMs;
  }

  get modelSizeMB(): number {
    return this._modelSizeMB;
  }

  /**
   * Initialize: dynamically import Transformers.js and load model.
   * Downloads ~60MB on first load, then cached by browser.
   *
   * ONLY called when user explicitly clicks "Enable AI Summary".
   */
  async initialize(
    onProgress?: (progress: { loaded: number; total: number; status: string }) => void
  ): Promise<{ loadTimeMs: number; modelSizeMB: number }> {
    if (this._isReady) {
      return { loadTimeMs: this._loadTimeMs, modelSizeMB: this._modelSizeMB };
    }
    if (isLoading) {
      throw new Error("Model is already loading");
    }

    isLoading = true;
    const startTime = performance.now();

    try {
      // Dynamic import — NOT included in initial bundle
      const { pipeline, env } = await import("@huggingface/transformers");

      env.allowLocalModels = false;

      console.log(
        `[TransformersSummarizer] Loading ${this.config.modelId} (quantized=${this.config.quantized})...`
      );

      // For T5/flan-T5, use text2text-generation with "summarize:" prefix
      pipelineInstance = await pipeline(
        "text2text-generation",
        this.config.modelId,
        {
          quantized: this.config.quantized,
          progress_callback: onProgress
            ? (data: any) => {
                if (data.status === "progress" && data.total) {
                  onProgress({
                    loaded: data.loaded ?? 0,
                    total: data.total,
                    status: `Downloading: ${((data.loaded / data.total) * 100).toFixed(0)}%`,
                  });
                } else if (data.status === "ready") {
                  onProgress({ loaded: 1, total: 1, status: "Model ready" });
                } else if (data.status === "initiate") {
                  onProgress({ loaded: 0, total: 1, status: "Starting download..." });
                }
              }
            : undefined,
        }
      );

      this._isReady = true;
      this._loadTimeMs = performance.now() - startTime;
      this._modelSizeMB = this.estimateModelSize();

      console.log(
        `[TransformersSummarizer] Ready in ${this._loadTimeMs.toFixed(0)}ms (~${this._modelSizeMB.toFixed(0)}MB)`
      );

      return {
        loadTimeMs: this._loadTimeMs,
        modelSizeMB: this._modelSizeMB,
      };
    } catch (error) {
      console.error("[TransformersSummarizer] Failed to load:", error);
      throw error;
    } finally {
      isLoading = false;
    }
  }

  /**
   * Summarize transcript entries using the loaded model.
   */
  async summarize(entries: readonly TranscriptEntry[]): Promise<SummaryResult> {
    if (!this._isReady || !pipelineInstance) {
      throw new Error("Model not initialized. Call initialize() first.");
    }

    const startTime = performance.now();

    // Build input text
    const conversationText = entries
      .map((e) => `${e.speaker}: ${e.text}`)
      .join(" ");

    // Truncate to avoid exceeding model max input (512 tokens for T5-small)
    const truncated = conversationText.slice(0, 2000);
    const promptedInput = `summarize: ${truncated}`;

    try {
      const output = await pipelineInstance(promptedInput, {
        max_new_tokens: this.config.maxNewTokens,
        min_new_tokens: this.config.minNewTokens,
        do_sample: false,
      });

      const summaryText =
        output?.[0]?.generated_text?.trim() ??
        output?.[0]?.summary_text?.trim() ??
        "";

      const latencyMs = performance.now() - startTime;

      const keyPoints = summaryText
        .split(/(?<=[.!?])\s+/)
        .filter((s: string) => s.length > 10);

      return {
        text: summaryText,
        keyPoints: keyPoints.length > 0 ? keyPoints : [summaryText],
        confidence: 0.85,
        latencyMs,
        method: "abstractive",
      };
    } catch (error) {
      console.error("[TransformersSummarizer] Inference failed:", error);
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (pipelineInstance) {
      pipelineInstance = null;
    }
    this._isReady = false;
  }

  private estimateModelSize(): number {
    if ("memory" in performance) {
      const mem = (performance as any).memory;
      return (mem.usedJSHeapSize ?? 0) / (1024 * 1024);
    }
    return this.config.quantized ? 60 : 240;
  }
}