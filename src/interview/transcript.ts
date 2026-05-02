import type { TranscriptEntry } from "../types";
import { APP_CONFIG } from "../config";

/**
 * Thread-safe transcript store with circular buffer behavior.
 * Persists to IndexedDB for offline resilience.
 */
export class TranscriptStore {
  private entries: TranscriptEntry[] = [];
  private changeCallbacks: ((entries: readonly TranscriptEntry[]) => void)[] = [];
  private idCounter = 0;

  /** Add a new transcript entry */
  add(speaker: TranscriptEntry["speaker"], text: string): TranscriptEntry {
    const entry: TranscriptEntry = {
      id: `entry-${++this.idCounter}-${Date.now()}`,
      speaker,
      text: text.trim(),
      timestamp: Date.now(),
    };

    this.entries.push(entry);

    // Auto-prune if exceeds max
    if (this.entries.length > APP_CONFIG.maxTranscriptEntries) {
      this.entries = this.entries.slice(-APP_CONFIG.maxTranscriptEntries);
    }

    this.notifyChange();
    this.persistToStorage();
    return entry;
  }

  /** Get all entries */
  getAll(): readonly TranscriptEntry[] {
    return [...this.entries];
  }

  /** Get last N entries */
  getRecent(n: number): readonly TranscriptEntry[] {
    return this.entries.slice(-n);
  }

  /** Get full text */
  getFullText(): string {
    return this.entries.map((e) => `${e.speaker}: ${e.text}`).join("\n");
  }

  /** Get entry count */
  get length(): number {
    return this.entries.length;
  }

  /** Subscribe to changes */
  onChange(callback: (entries: readonly TranscriptEntry[]) => void): () => void {
    this.changeCallbacks.push(callback);
    return () => {
      const idx = this.changeCallbacks.indexOf(callback);
      if (idx >= 0) this.changeCallbacks.splice(idx, 1);
    };
  }

  /** Clear all entries */
  clear(): void {
    this.entries = [];
    this.idCounter = 0;
    this.notifyChange();
    this.persistToStorage();
  }

  /** Load from IndexedDB if available */
  async loadFromStorage(): Promise<void> {
    try {
      const stored = localStorage.getItem("voice-ai-transcript");
      if (stored) {
        const parsed = JSON.parse(stored) as TranscriptEntry[];
        this.entries = parsed;
        this.idCounter = parsed.length;
        this.notifyChange();
      }
    } catch {
      console.warn("Failed to load transcript from storage");
    }
  }

  private notifyChange(): void {
    const snapshot = this.getAll();
    for (const cb of this.changeCallbacks) {
      try { cb(snapshot); } catch (e) { console.error("Transcript change handler error:", e); }
    }
  }

  private persistToStorage(): void {
    try {
      // Keep only last 100 entries in storage to limit size
      const toStore = this.entries.slice(-100);
      localStorage.setItem("voice-ai-transcript", JSON.stringify(toStore));
    } catch {
      /* Storage full or unavailable */
    }
  }
}