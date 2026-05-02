import type { TTSEvent } from "../types";
import { APP_CONFIG } from "../config";

type TTSEventCallback = (event: TTSEvent) => void;

/**
 * Manages Web Speech API text-to-speech with event streaming.
 * Provides pause detection hooks for filler insertion.
 */
export class TTSController {
  private synth: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private listeners: Map<string, TTSEventCallback[]> = new Map();
  private _isSpeaking = false;
  private _isPaused = false;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private voicesLoaded = false;

  constructor() {
    this.synth = window.speechSynthesis;
    this.loadVoices();
  }

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  /** Subscribe to TTS events */
  on(eventType: TTSEvent["type"], callback: TTSEventCallback): () => void {
    const list = this.listeners.get(eventType) ?? [];
    list.push(callback);
    this.listeners.set(eventType, list);
    return () => {
      const idx = list.indexOf(callback);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  /** Speak text with full event tracking */
  speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Cancel any ongoing speech
      this.stop();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = APP_CONFIG.ttsRate;
      utterance.pitch = APP_CONFIG.ttsPitch;
      utterance.volume = 1.0;

      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }

      utterance.onstart = () => {
        this._isSpeaking = true;
        this.emit({ type: "start", timestamp: Date.now(), utteranceText: text });
      };

      utterance.onend = () => {
        this._isSpeaking = false;
        this._isPaused = false;
        this.currentUtterance = null;
        this.emit({ type: "end", timestamp: Date.now(), utteranceText: text });
        resolve();
      };

      utterance.onpause = () => {
        this._isPaused = true;
        this.emit({ type: "pause", timestamp: Date.now() });
      };

      utterance.onresume = () => {
        this._isPaused = false;
        this.emit({ type: "resume", timestamp: Date.now() });
      };

      utterance.onboundary = (e) => {
        this.emit({
          type: "boundary",
          timestamp: Date.now(),
          charIndex: e.charIndex,
          utteranceText: text,
        });
      };

      utterance.onerror = (e) => {
        this._isSpeaking = false;
        this.emit({ type: "error", timestamp: Date.now() });
        reject(new Error(`TTS error: ${e.error}`));
      };

      this.currentUtterance = utterance;
      this.synth.speak(utterance);
    });
  }

  /** Pause current speech */
  pause(): void {
    if (this._isSpeaking && !this._isPaused) {
      this.synth.pause();
    }
  }

  /** Resume paused speech */
  resume(): void {
    if (this._isPaused) {
      this.synth.resume();
    }
  }

  /** Stop all speech */
  stop(): void {
    this.synth.cancel();
    this._isSpeaking = false;
    this._isPaused = false;
    this.currentUtterance = null;
  }

  /** Get available voices */
  getVoices(): SpeechSynthesisVoice[] {
    return this.synth.getVoices();
  }

  /** Set preferred voice */
  setVoice(voice: SpeechSynthesisVoice): void {
    this.selectedVoice = voice;
  }

  /** Select best available English voice */
  selectBestVoice(): void {
    const voices = this.synth.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && v.localService
    );
    if (preferred) this.selectedVoice = preferred;
  }

  private emit(event: TTSEvent): void {
    const callbacks = this.listeners.get(event.type) ?? [];
    for (const cb of callbacks) {
      try { cb(event); } catch (e) { console.error("TTS event handler error:", e); }
    }
  }

  private loadVoices(): void {
    const setVoices = () => {
      if (!this.voicesLoaded) {
        this.voicesLoaded = true;
        this.selectBestVoice();
      }
    };
    // Voices may load async
    if (this.synth.getVoices().length > 0) {
      setVoices();
    }
    this.synth.addEventListener("voiceschanged", setVoices);
  }
}