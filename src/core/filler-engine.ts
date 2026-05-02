import type { FillerPhrase, FillerCategory, InterviewPhase, TranscriptEntry } from "../types";
import {
  APP_CONFIG,
  INTENT_FILLERS,
  INTENT_PATTERNS,
  type QuestionIntent,
  type FillerEntry,
} from "../config";

/**
 * Smart, context-aware filler engine.
 *
 * FIXED: Properly tracks silence count and cooldown.
 * DEBUG: Logs all decisions to console for troubleshooting.
 */
export class FillerEngine {
  private fillerTimestamps: number[] = [];
  private recentlyUsed: Set<string> = new Set();
  private readonly maxRecentTracking = 12;
  private fillerHistory: FillerPhrase[] = [];
  private readonly maxHistorySize = 50;
  private consecutiveSilences = 0;

  // ─── Public API ──────────────────────────────────────

  /**
   * Attempt to generate a context-aware filler.
   * Returns null if filler should NOT play (cooldown, frequency limit, etc.).
   */
  tryGenerate(
    phase: InterviewPhase,
    recentEntries: readonly TranscriptEntry[]
  ): FillerPhrase | null {
    const checks = this.runGuards(recentEntries);

    if (!checks.passed) {
      console.log(`[FillerEngine] SKIPPED: ${checks.reason}`);
      return null;
    }

    // All guards passed → generate
    console.log(`[FillerEngine] GENERATING filler (silence #${this.consecutiveSilences})`);
    const filler = this.generate(phase, recentEntries);
    this.consecutiveSilences = 0; // Reset after playing
    return filler;
  }

  /**
   * Force-generate a filler (bypasses ALL guards).
   * Used for manual "Insert Filler" button.
   */
  generate(
    phase: InterviewPhase,
    recentEntries: readonly TranscriptEntry[]
  ): FillerPhrase {
    const intent = this.detectIntent(recentEntries);
    console.log(`[FillerEngine] Detected intent: ${intent}`);

    const candidates = INTENT_FILLERS[intent];
    const selected = this.selectWeighted(candidates);

    const category = this.intentToCategory(intent);

    const filler: FillerPhrase = {
      text: selected.text,
      category,
      contextTag: intent,
    };

    this.recordUsage(filler);
    console.log(`[FillerEngine] Generated: "${filler.text}" [${intent}/${category}]`);

    return filler;
  }

  /** Call when speech is detected (resets silence counter) */
  onSpeechResumed(): void {
    if (this.consecutiveSilences > 0) {
      console.log(`[FillerEngine] Speech resumed, reset silence count (was ${this.consecutiveSilences})`);
    }
    this.consecutiveSilences = 0;
  }

  /** Increment silence counter (called BEFORE tryGenerate) */
  onSilenceDetected(): void {
    this.consecutiveSilences++;
    console.log(`[FillerEngine] Silence #${this.consecutiveSilences}`);
  }

  getHistory(): readonly FillerPhrase[] {
    return [...this.fillerHistory];
  }

  reset(): void {
    this.fillerTimestamps = [];
    this.recentlyUsed.clear();
    this.fillerHistory = [];
    this.consecutiveSilences = 0;
    console.log("[FillerEngine] Reset");
  }

  // ─── Guard Checks ────────────────────────────────────

  private runGuards(recentEntries: readonly TranscriptEntry[]): {
    passed: boolean;
    reason: string;
  } {
    // Guard 1: Minimum conversation length
    if (recentEntries.length < APP_CONFIG.minEntriesBeforeFiller) {
      return {
        passed: false,
        reason: `Not enough entries (${recentEntries.length} < ${APP_CONFIG.minEntriesBeforeFiller})`,
      };
    }

    // Guard 2: Cooldown between fillers
    if (!this.isCooldownClear()) {
      const lastTime = this.fillerTimestamps[this.fillerTimestamps.length - 1];
      const elapsed = Date.now() - lastTime;
      return {
        passed: false,
        reason: `Cooldown active (${elapsed}ms / ${APP_CONFIG.fillerCooldownMs}ms)`,
      };
    }

    // Guard 3: Per-minute frequency limit
    if (!this.isUnderFrequencyLimit()) {
      return {
        passed: false,
        reason: `Frequency limit reached (max ${APP_CONFIG.maxFillersPerMinute}/min)`,
      };
    }

    // Guard 4: Require enough consecutive silences
    // NOTE: consecutiveSilences is incremented BEFORE this check via onSilenceDetected()
    if (this.consecutiveSilences < APP_CONFIG.silenceCountBeforeFiller) {
      return {
        passed: false,
        reason: `Not enough silences (${this.consecutiveSilences} < ${APP_CONFIG.silenceCountBeforeFiller})`,
      };
    }

    return { passed: true, reason: "OK" };
  }

  // ─── Intent Detection ────────────────────────────────

  private detectIntent(entries: readonly TranscriptEntry[]): QuestionIntent {
    const lastQuestion = this.findLastInterviewerMessage(entries);
    if (!lastQuestion) {
      console.log("[FillerEngine] No interviewer message found, using 'general'");
      return "general";
    }

    const text = lastQuestion.toLowerCase();

    for (const { intent, keywords, patterns } of INTENT_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(text)) return intent;
      }
      for (const keyword of keywords) {
        if (text.includes(keyword)) return intent;
      }
    }

    // Fallback: analyze question structure
    if (text.includes("?")) {
      if (text.startsWith("how")) return "technical";
      if (text.startsWith("why")) return "motivation";
      if (text.startsWith("what")) return "opinion";
      if (text.startsWith("tell")) return "behavioral";
    }

    return "general";
  }

  private findLastInterviewerMessage(
    entries: readonly TranscriptEntry[]
  ): string | null {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].speaker === "interviewer") {
        return entries[i].text;
      }
    }
    return null;
  }

  // ─── Weighted Selection ──────────────────────────────

  private selectWeighted(candidates: readonly FillerEntry[]): FillerEntry {
    const fresh = candidates.filter((c) => !this.recentlyUsed.has(c.text));
    const pool = fresh.length > 0 ? fresh : [...candidates];

    const totalWeight = pool.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;

    for (const candidate of pool) {
      random -= candidate.weight;
      if (random <= 0) return candidate;
    }

    return pool[0];
  }

  // ─── Rate Limiting ───────────────────────────────────

  private isCooldownClear(): boolean {
    if (this.fillerTimestamps.length === 0) return true;
    const lastTime = this.fillerTimestamps[this.fillerTimestamps.length - 1];
    return Date.now() - lastTime >= APP_CONFIG.fillerCooldownMs;
  }

  private isUnderFrequencyLimit(): boolean {
    const oneMinuteAgo = Date.now() - 60000;
    const recentCount = this.fillerTimestamps.filter((t) => t > oneMinuteAgo).length;
    return recentCount < APP_CONFIG.maxFillersPerMinute;
  }

  // ─── Bookkeeping ─────────────────────────────────────

  private recordUsage(filler: FillerPhrase): void {
    const now = Date.now();
    this.fillerTimestamps.push(now);
    const cutoff = now - 120000;
    this.fillerTimestamps = this.fillerTimestamps.filter((t) => t > cutoff);

    this.recentlyUsed.add(filler.text);
    if (this.recentlyUsed.size > this.maxRecentTracking) {
      const oldest = this.recentlyUsed.values().next().value;
      if (oldest) this.recentlyUsed.delete(oldest);
    }

    this.fillerHistory.push(filler);
    if (this.fillerHistory.length > this.maxHistorySize) {
      this.fillerHistory = this.fillerHistory.slice(-this.maxHistorySize);
    }
  }

  private intentToCategory(intent: QuestionIntent): FillerCategory {
    const map: Record<QuestionIntent, FillerCategory> = {
      self_introduction: "acknowledgment",
      strengths: "thinking",
      weaknesses: "thinking",
      project_experience: "transition",
      challenge: "thinking",
      future_goals: "thinking",
      motivation: "acknowledgment",
      teamwork: "empathy",
      technical: "transition",
      behavioral: "transition",
      opinion: "thinking",
      clarification_needed: "clarification",
      general: "thinking",
    };
    return map[intent];
  }
}