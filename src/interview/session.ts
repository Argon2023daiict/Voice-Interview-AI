import type {
  InterviewSession,
  InterviewPhase,
  SummaryResult,
  PerformanceMetrics,
  TranscriptEntry,
  FillerPhrase,
} from "../types";
import { APP_CONFIG } from "../config";
import { ModelManager } from "../core/model-manager";
import { FillerEngine } from "../core/filler-engine";
import { TranscriptStore } from "./transcript";
import { TTSController } from "../audio/tts-controller";
import { PauseDetector } from "../audio/pause-detector";
import { FillerPlayer } from "../audio/filler-player";
import {
  SpeechRecognitionController,
  type RecognitionEvent,
} from "../audio/speech-recognition";

type SessionEventMap = {
  phaseChange: (phase: InterviewPhase) => void;
  summaryUpdate: (summary: SummaryResult) => void;
  fillerPlayed: (filler: FillerPhrase) => void;
  fillerSkipped: (reason: string) => void;
  metricsUpdate: (metrics: PerformanceMetrics) => void;
  transcriptUpdate: (entries: readonly TranscriptEntry[]) => void;
  recognitionEvent: (event: RecognitionEvent) => void;
  volumeChange: (volume: number) => void;
  interimTranscript: (text: string) => void;
  neuralLoadProgress: (progress: { loaded: number; total: number; status: string }) => void;
};

export class InterviewSessionManager {
  readonly session: InterviewSession;
  readonly transcript: TranscriptStore;
  readonly modelManager: ModelManager;
  readonly fillerEngine: FillerEngine;
  readonly tts: TTSController;
  readonly pauseDetector: PauseDetector;
  readonly fillerPlayer: FillerPlayer;
  readonly speechRecognition: SpeechRecognitionController;

  private summaryTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSummary: SummaryResult | null = null;
  private listeners: Partial<{
    [K in keyof SessionEventMap]: SessionEventMap[K][];
  }> = {};

  private interimText = "";
  private finalTextBuffer = "";
  private finalBufferTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly finalBufferDelayMs = 1200;

  constructor() {
    this.transcript = new TranscriptStore();
    this.modelManager = new ModelManager();
    this.fillerEngine = new FillerEngine();
    this.tts = new TTSController();
    this.pauseDetector = new PauseDetector(this.tts);
    this.fillerPlayer = new FillerPlayer(this.tts);
    this.speechRecognition = new SpeechRecognitionController({
      language: "en-US",
      continuous: true,
      interimResults: true,
      silenceTimeoutMs: 3000,
      noiseGateThreshold: 0.015,
      autoRestart: true,
    });

    this.session = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      phase: "idle",
      startTime: Date.now(),
      transcript: [],
      summaries: [],
      metrics: this.modelManager.metrics,
    };

    this.setupEventWiring();
    this.setupSpeechRecognition();
  }

  // ═══════════════════════════════════════════════════════
  // EVENT SYSTEM
  // ═══════════════════════════════════════════════════════

  on<K extends keyof SessionEventMap>(
    event: K,
    callback: SessionEventMap[K]
  ): () => void {
    const list = (this.listeners[event] ??= []) as SessionEventMap[K][];
    list.push(callback);
    return () => {
      const idx = list.indexOf(callback);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  // ═══════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    console.log("[Session] Initializing...");
    await this.modelManager.initialize();
    await this.transcript.loadFromStorage();
    this.pauseDetector.start();
    this.setPhase("idle");
    this.emit("metricsUpdate", this.modelManager.metrics);
    console.log("[Session] Ready");
  }

  async enableNeuralSummarizer(
    onProgress?: (progress: { loaded: number; total: number; status: string }) => void
  ): Promise<void> {
    const progressHandler = (progress: { loaded: number; total: number; status: string }) => {
      this.emit("neuralLoadProgress", progress);
      if (onProgress) onProgress(progress);
    };
    await this.modelManager.loadNeuralSummarizer(progressHandler);
    this.emit("metricsUpdate", this.modelManager.metrics);
  }

  get isNeuralReady(): boolean {
    return this.modelManager.isNeuralReady;
  }

  // ═══════════════════════════════════════════════════════
  // CONVERSATION ACTIONS
  // ═══════════════════════════════════════════════════════

  async askQuestion(text: string): Promise<void> {
    console.log(`[Session] askQuestion: "${text.slice(0, 50)}..."`);
    this.setPhase("questioning");
    this.transcript.add("interviewer", text);

    // Trigger summary after adding entry
    this.scheduleSummary();

    const wasListening = this.speechRecognition.isListening;
    if (wasListening) this.speechRecognition.pause();

    try {
      await this.tts.speak(text);
    } catch (err) {
      console.error("TTS failed:", err);
    }

    if (wasListening) this.speechRecognition.resume();
    this.setPhase("listening");
  }

  addResponse(text: string): void {
    console.log(`[Session] addResponse: "${text.slice(0, 50)}..."`);
    this.transcript.add("candidate", text);
    this.fillerEngine.onSpeechResumed();
    this.scheduleSummary();
  }

  // ═══════════════════════════════════════════════════════
  // SUMMARIZATION
  // ═══════════════════════════════════════════════════════

  async summarizeNow(): Promise<SummaryResult> {
    const entries = this.transcript.getAll();
    console.log(`[Session] summarizeNow() with ${entries.length} entries`);

    if (entries.length === 0) {
      console.log("[Session] No entries to summarize");
      const empty: SummaryResult = {
        text: "No conversation to summarize yet.",
        keyPoints: [],
        confidence: 0,
        latencyMs: 0,
        method: "extractive",
      };
      return empty;
    }

    this.setPhase("summarizing");

    let result: SummaryResult;

    if (this.modelManager.isNeuralReady) {
      try {
        result = await this.modelManager.transformersSummarizer!.summarize(entries);
        console.log(`[Session] Tier 2 summary in ${result.latencyMs.toFixed(0)}ms`);
      } catch (err) {
        console.warn("[Session] Tier 2 failed, fallback to Tier 1:", err);
        result = this.modelManager.extractiveSummarizer.summarize(entries);
      }
    } else {
      result = this.modelManager.extractiveSummarizer.summarize(entries);
      console.log(`[Session] Tier 1 summary in ${result.latencyMs.toFixed(0)}ms`);
    }

    this.currentSummary = result;
    this.session.summaries.push(result);
    this.modelManager.recordInference(result.latencyMs);

    this.emit("summaryUpdate", result);
    this.emit("metricsUpdate", this.modelManager.metrics);
    this.setPhase("listening");

    console.log(`[Session] Summary: "${result.text.slice(0, 80)}..."`);
    return result;
  }

  getTopics(): string[] {
    return this.modelManager.extractiveSummarizer.extractTopics(this.transcript.getAll());
  }

  getLatestSummary(): SummaryResult | null {
    return this.currentSummary;
  }

  setPhase(phase: InterviewPhase): void {
    if (this.session.phase !== phase) {
      this.session.phase = phase;
      this.emit("phaseChange", phase);
    }
  }

  // ═══════════════════════════════════════════════════════
  // FILLER: SMART TRIGGER
  // ═══════════════════════════════════════════════════════

  /**
   * Smart filler: checks guards (cooldown, frequency, silence count).
   * Call fillerEngine.onSilenceDetected() BEFORE this to increment counter.
   */
  async tryInsertFiller(): Promise<FillerPhrase | null> {
    const recent = this.transcript.getRecent(10);
    console.log(`[Session] tryInsertFiller() — ${recent.length} recent entries`);

    // Increment silence counter BEFORE guard check
    this.fillerEngine.onSilenceDetected();

    const filler = this.fillerEngine.tryGenerate(this.session.phase, recent);

    if (!filler) {
      this.emit("fillerSkipped", "Guard check failed");
      return null;
    }

    return await this.playFiller(filler);
  }

  /**
   * Force-insert a filler (manual button). Bypasses ALL guards.
   */
  async forceInsertFiller(): Promise<FillerPhrase> {
    const recent = this.transcript.getRecent(10);
    console.log(`[Session] forceInsertFiller() — ${recent.length} recent entries`);

    const filler = this.fillerEngine.generate(this.session.phase, recent);
    return await this.playFiller(filler);
  }

  /** Play a filler phrase via TTS and emit events */
  private async playFiller(filler: FillerPhrase): Promise<FillerPhrase> {
    this.emit("fillerPlayed", filler);

    const wasListening = this.speechRecognition.isListening;
    if (wasListening) this.speechRecognition.pause();

    try {
      await this.fillerPlayer.playImmediate(filler);
    } catch (err) {
      console.warn("Filler playback failed:", err);
    }

    if (wasListening) this.speechRecognition.resume();
    return filler;
  }

  // ═══════════════════════════════════════════════════════
  // SPEECH RECOGNITION
  // ═══════════════════════════════════════════════════════

  async startListening(): Promise<void> {
    if (!this.speechRecognition.isSupported) {
      throw new Error("Speech recognition is not supported in this browser");
    }
    await this.speechRecognition.start();
    this.modelManager.setMicActive(true);
    this.emit("metricsUpdate", this.modelManager.metrics);
    this.setPhase("listening");
  }

  stopListening(): void {
    this.speechRecognition.stop();
    this.flushFinalBuffer();
    this.modelManager.setMicActive(false);
    this.emit("metricsUpdate", this.modelManager.metrics);
    if (this.session.phase === "listening") this.setPhase("idle");
  }

  async toggleListening(): Promise<boolean> {
    if (this.speechRecognition.isListening) {
      this.stopListening();
      return false;
    } else {
      await this.startListening();
      return true;
    }
  }

  getInterimTranscript(): string {
    return this.interimText;
  }

  get isSpeechRecognitionSupported(): boolean {
    return this.speechRecognition.isSupported;
  }

  // ═══════════════════════════════════════════════════════
  // SESSION CONTROLS
  // ═══════════════════════════════════════════════════════

  reset(): void {
    console.log("[Session] Reset");
    if (this.speechRecognition.isListening) this.speechRecognition.stop();
    this.transcript.clear();
    this.fillerEngine.reset();
    this.currentSummary = null;
    this.session.summaries = [];
    this.tts.stop();
    this.interimText = "";
    this.finalTextBuffer = "";
    this.modelManager.setMicActive(false);
    this.modelManager.setRecognitionConfidence(0);
    this.setPhase("idle");
    this.emit("metricsUpdate", this.modelManager.metrics);
  }

  async dispose(): Promise<void> {
    this.speechRecognition.stop();
    this.pauseDetector.stop();
    this.tts.stop();
    this.fillerPlayer.clearQueue();
    await this.modelManager.dispose();
    if (this.summaryTimer) clearTimeout(this.summaryTimer);
    if (this.finalBufferTimer) clearTimeout(this.finalBufferTimer);
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: WIRING
  // ═══════════════════════════════════════════════════════

  private setupEventWiring(): void {
    this.pauseDetector.onPause((durationMs) => {
      console.log(`[Session] TTS pause: ${durationMs}ms`);
      this.tryInsertFiller();
    });

    this.transcript.onChange((entries) => {
      this.emit("transcriptUpdate", entries);
    });
  }

  private setupSpeechRecognition(): void {
    this.speechRecognition.on((event: RecognitionEvent) => {
      this.emit("recognitionEvent", event);

      switch (event.type) {
        case "final":
          this.handleFinalTranscript(event.transcript ?? "");
          if (event.confidence !== undefined) {
            this.modelManager.setRecognitionConfidence(event.confidence);
            this.emit("metricsUpdate", this.modelManager.metrics);
          }
          this.fillerEngine.onSpeechResumed();
          break;

        case "interim":
          this.interimText = event.transcript ?? "";
          this.emit("interimTranscript", this.interimText);
          this.fillerEngine.onSpeechResumed();
          break;

        case "silence":
          this.flushFinalBuffer();
          if (this.session.phase === "listening") {
            this.tryInsertFiller();
          }
          break;

        case "volume":
          this.emit("volumeChange", event.volume ?? 0);
          break;

        case "error":
          console.warn("[Session] Recognition error:", event.transcript);
          break;

        case "end":
          if (this.session.phase === "listening") this.flushFinalBuffer();
          break;
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: SPEECH BUFFERING
  // ═══════════════════════════════════════════════════════

  private handleFinalTranscript(text: string): void {
    if (!text.trim()) return;
    this.interimText = "";
    this.emit("interimTranscript", "");
    this.finalTextBuffer += (this.finalTextBuffer ? " " : "") + text.trim();
    if (this.finalBufferTimer) clearTimeout(this.finalBufferTimer);
    this.finalBufferTimer = setTimeout(() => this.flushFinalBuffer(), this.finalBufferDelayMs);
  }

  private flushFinalBuffer(): void {
    if (this.finalBufferTimer) {
      clearTimeout(this.finalBufferTimer);
      this.finalBufferTimer = null;
    }
    const text = this.finalTextBuffer.trim();
    if (text.length > 0) {
      this.addResponse(text);
      this.finalTextBuffer = "";
    }
  }

  private scheduleSummary(): void {
    if (this.summaryTimer) clearTimeout(this.summaryTimer);
    this.summaryTimer = setTimeout(() => {
      console.log("[Session] Debounced summary triggered");
      this.summarizeNow();
    }, APP_CONFIG.summaryDebounceMs);
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: EMITTER
  // ═══════════════════════════════════════════════════════

  private emit<K extends keyof SessionEventMap>(
    event: K,
    ...args: Parameters<SessionEventMap[K]>
  ): void {
    const callbacks = this.listeners[event] as SessionEventMap[K][] | undefined;
    if (!callbacks) return;
    for (const cb of callbacks) {
      try {
        (cb as (...a: any[]) => void)(...args);
      } catch (e) {
        console.error(`[Session] Event error (${event}):`, e);
      }
    }
  }
}