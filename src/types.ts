// ─── Core Domain Types ─────────────────────────────────────────

export interface TranscriptEntry {
  readonly id: string;
  readonly speaker: "interviewer" | "candidate";
  readonly text: string;
  readonly timestamp: number;
}

export interface SummaryResult {
  readonly text: string;
  readonly keyPoints: readonly string[];
  readonly confidence: number;
  readonly latencyMs: number;
  readonly method: "extractive" | "abstractive";
}

export interface FillerPhrase {
  readonly text: string;
  readonly category: FillerCategory;
  readonly contextTag: string;
}

export type FillerCategory =
  | "acknowledgment"
  | "thinking"
  | "transition"
  | "clarification"
  | "empathy";

export type InterviewPhase =
  | "idle"
  | "greeting"
  | "questioning"
  | "listening"
  | "summarizing"
  | "closing";

export interface InterviewSession {
  readonly id: string;
  phase: InterviewPhase;
  readonly startTime: number;
  transcript: TranscriptEntry[];
  summaries: SummaryResult[];
  readonly metrics: PerformanceMetrics;
}

export interface PerformanceMetrics {
  modelLoadTimeMs: number;
  averageInferenceMs: number;
  peakInferenceMs: number;
  totalInferences: number;
  lastInferenceMs: number;
  memoryUsageMB: number;
  modelSizeMB: number;
  isOffline: boolean;
  /** Whether mic is currently active */
  isMicActive: boolean;
  /** Current speech recognition confidence */
  recognitionConfidence: number;
}

export interface TTSEvent {
  readonly type: "start" | "end" | "pause" | "resume" | "boundary" | "error";
  readonly timestamp: number;
  readonly charIndex?: number;
  readonly utteranceText?: string;
}

export interface ModelConfig {
  readonly modelPath: string;
  readonly tokenizerPath: string;
  readonly maxInputLength: number;
  readonly maxOutputLength: number;
  readonly executionProvider: "wasm" | "webgpu" | "webgl";
}

// ─── Worker Message Protocol ───────────────────────────────────

export type WorkerRequest =
  | { type: "init"; config: ModelConfig }
  | { type: "summarize"; text: string; requestId: string }
  | { type: "embed"; text: string; requestId: string }
  | { type: "dispose" };

export type WorkerResponse =
  | { type: "ready"; modelSizeMB: number }
  | { type: "summary"; result: SummaryResult; requestId: string }
  | { type: "embedding"; vector: Float32Array; requestId: string }
  | { type: "error"; message: string; requestId?: string }
  | { type: "metrics"; latencyMs: number };