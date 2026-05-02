/**
 * Client-side speech recognition controller.
 * Uses Web Speech API (SpeechRecognition) with:
 *  - Continuous listening mode
 *  - Interim + final transcript streaming
 *  - Voice Activity Detection (VAD) via Web Audio API
 *  - Silence detection for auto-stop
 *  - Noise gate for cleaner input
 */

export interface RecognitionEvent {
  readonly type:
    | "start"
    | "end"
    | "interim"
    | "final"
    | "error"
    | "silence"
    | "volume";
  readonly transcript?: string;
  readonly confidence?: number;
  readonly timestamp: number;
  readonly isFinal?: boolean;
  readonly volume?: number;
}

export interface RecognitionConfig {
  /** BCP-47 language tag */
  language: string;
  /** Continuous recognition mode */
  continuous: boolean;
  /** Return interim (partial) results */
  interimResults: boolean;
  /** Max alternatives per result */
  maxAlternatives: number;
  /** Silence duration (ms) before auto-stop in non-continuous mode */
  silenceTimeoutMs: number;
  /** Minimum volume threshold (0–1) to consider speech */
  noiseGateThreshold: number;
  /** Auto-restart on unexpected end */
  autoRestart: boolean;
}

const DEFAULT_CONFIG: RecognitionConfig = {
  language: "en-US",
  continuous: true,
  interimResults: true,
  maxAlternatives: 1,
  silenceTimeoutMs: 3000,
  noiseGateThreshold: 0.015,
  autoRestart: true,
};

type RecognitionCallback = (event: RecognitionEvent) => void;

export class SpeechRecognitionController {
  private recognition: SpeechRecognition | null = null;
  private config: RecognitionConfig;
  private configAutoRestart: boolean;
  private listeners: RecognitionCallback[] = [];
  private _isListening = false;
  private _isSupported = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private restartAttempts = 0;
  private readonly maxRestartAttempts = 5;

  // ─── Web Audio VAD ───────────────────────────────────
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private vadInterval: ReturnType<typeof setInterval> | null = null;
  private _currentVolume = 0;
  private _isSpeechDetected = false;

  constructor(config: Partial<RecognitionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.configAutoRestart = this.config.autoRestart;
    this._isSupported = this.checkSupport();
  }

  // ─── Public API ──────────────────────────────────────

  get isListening(): boolean {
    return this._isListening;
  }

  get isSupported(): boolean {
    return this._isSupported;
  }

  get currentVolume(): number {
    return this._currentVolume;
  }

  get isSpeechDetected(): boolean {
    return this._isSpeechDetected;
  }

  /** Subscribe to recognition events */
  on(callback: RecognitionCallback): () => void {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  /** Request mic permission and start recognition */
  async start(): Promise<void> {
    if (this._isListening) return;

    if (!this._isSupported) {
      this.emit({
        type: "error",
        transcript: "Speech recognition not supported in this browser.",
        timestamp: Date.now(),
      });
      throw new Error("SpeechRecognition API not supported");
    }

    // Request microphone access
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow access and try again."
          : `Microphone error: ${err instanceof Error ? err.message : String(err)}`;

      this.emit({ type: "error", transcript: message, timestamp: Date.now() });
      throw new Error(message);
    }

    // Set up Web Audio VAD
    this.initVAD();

    // Set up SpeechRecognition
    this.initRecognition();

    try {
      this.recognition!.start();
      this._isListening = true;
      this.config.autoRestart = this.configAutoRestart;
      this.restartAttempts = 0;
      this.emit({ type: "start", timestamp: Date.now() });
    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  /** Stop recognition and release resources */
  stop(): void {
    if (!this._isListening) return;
    this._isListening = false;
    this.config.autoRestart = false;

    this.cleanup();
    this.emit({ type: "end", timestamp: Date.now() });

    this.config.autoRestart = this.configAutoRestart;
  }

  /** Temporarily pause recognition */
  pause(): void {
    if (this.recognition && this._isListening) {
      try {
        this.recognition.stop();
      } catch {
        /* already stopped */
      }
    }
    this.stopVAD();
  }

  /** Resume after pause */
  resume(): void {
    if (this._isListening && this.recognition) {
      try {
        this.recognition.start();
      } catch {
        /* already started */
      }
      this.startVAD();
    }
  }

  /** Update language at runtime */
  setLanguage(lang: string): void {
    this.config.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  /** Get available audio input devices */
  async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "audioinput");
    } catch {
      return [];
    }
  }

  // ─── SpeechRecognition Setup ─────────────────────────

  private initRecognition(): void {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    this.recognition = new SpeechRecognitionCtor();
    this.recognition.lang = this.config.language;
    this.recognition.continuous = this.config.continuous;
    this.recognition.interimResults = this.config.interimResults;
    this.recognition.maxAlternatives = this.config.maxAlternatives;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.handleResult(event);
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.handleError(event);
    };

    this.recognition.onend = () => {
      this.handleEnd();
    };

    this.recognition.onsoundstart = () => {
      this._isSpeechDetected = true;
      this.clearSilenceTimer();
    };

    this.recognition.onsoundend = () => {
      this._isSpeechDetected = false;
      this.startSilenceTimer();
    };
  }

  private handleResult(event: SpeechRecognitionEvent): void {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const best = result[0];

      if (result.isFinal) {
        this.emit({
          type: "final",
          transcript: best.transcript.trim(),
          confidence: best.confidence,
          timestamp: Date.now(),
          isFinal: true,
        });
        this.clearSilenceTimer();
        this.startSilenceTimer();
      } else {
        this.emit({
          type: "interim",
          transcript: best.transcript.trim(),
          confidence: best.confidence,
          timestamp: Date.now(),
          isFinal: false,
        });
      }
    }
  }

  private handleError(event: SpeechRecognitionErrorEvent): void {
    const ignorable = new Set(["no-speech", "aborted"]);

    if (ignorable.has(event.error)) {
      this.emit({ type: "silence", timestamp: Date.now() });
      return;
    }

    console.error("[SpeechRecognition] Error:", event.error, event.message);
    this.emit({
      type: "error",
      transcript: `Recognition error: ${event.error}`,
      timestamp: Date.now(),
    });

    if (event.error === "not-allowed") {
      this._isListening = false;
      this.cleanup();
    }
  }

  private handleEnd(): void {
    if (this._isListening && this.config.autoRestart) {
      if (this.restartAttempts < this.maxRestartAttempts) {
        this.restartAttempts++;
        console.log(
          `[SpeechRecognition] Auto-restart attempt ${this.restartAttempts}/${this.maxRestartAttempts}`
        );
        setTimeout(() => {
          if (this._isListening && this.recognition) {
            try {
              this.recognition.start();
            } catch {
              /* already started */
            }
          }
        }, 100);
      } else {
        console.warn("[SpeechRecognition] Max restart attempts reached");
        this._isListening = false;
        this.emit({ type: "end", timestamp: Date.now() });
        this.cleanup();
      }
    }
  }

  // ─── Web Audio VAD (Voice Activity Detection) ────────

  private initVAD(): void {
    if (!this.mediaStream) return;

    try {
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.8;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyser);

      this.startVAD();
    } catch (err) {
      console.warn("[VAD] Web Audio initialization failed:", err);
    }
  }

  private startVAD(): void {
    if (!this.analyser) return;

    const bufferLength = this.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);

    this.vadInterval = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / bufferLength);
      this._currentVolume = Math.min(rms * 5, 1.0);

      this.emit({
        type: "volume",
        volume: this._currentVolume,
        timestamp: Date.now(),
      });

      const wasSpeaking = this._isSpeechDetected;
      this._isSpeechDetected = rms > this.config.noiseGateThreshold;

      if (wasSpeaking && !this._isSpeechDetected) {
        this.startSilenceTimer();
      } else if (!wasSpeaking && this._isSpeechDetected) {
        this.clearSilenceTimer();
      }
    }, 100);
  }

  private stopVAD(): void {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
  }

  // ─── Silence Detection ───────────────────────────────

  private startSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      this.emit({ type: "silence", timestamp: Date.now() });
    }, this.config.silenceTimeoutMs);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  // ─── Helpers ─────────────────────────────────────────

  private checkSupport(): boolean {
    return !!(
      window.SpeechRecognition || (window as any).webkitSpeechRecognition
    );
  }

  private cleanup(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* already stopped */
      }
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition = null;
    }

    this.stopVAD();

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    this.clearSilenceTimer();
    this._currentVolume = 0;
    this._isSpeechDetected = false;
  }

  private emit(event: RecognitionEvent): void {
    for (const cb of this.listeners) {
      try {
        cb(event);
      } catch (err) {
        console.error("[SpeechRecognition] Listener error:", err);
      }
    }
  }
}