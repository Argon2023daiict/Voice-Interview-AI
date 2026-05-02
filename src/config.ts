import type { ModelConfig } from "./types";

export const APP_CONFIG = {
  maxTranscriptEntries: 500,
  summaryDebounceMs: 600,
  maxSummarySentences: 5,
  ttsRate: 1.0,
  ttsPitch: 1.0,
  minPauseDurationMs: 1200,
  maxFillerDurationMs: 2000,
  latencyTargetMs: 50,
  enableOnnxSummarizer: false,
  enableWebGPU: true,

  // ─── Filler Behavior (tuned for actual usage) ────────
  fillerCooldownMs: 5000,       // 5s between fillers (was 8s — too long for demo)
  maxFillersPerMinute: 5,       // 5/min (was 3 — too restrictive)
  minEntriesBeforeFiller: 1,    // Need at least 1 entry
  silenceCountBeforeFiller: 1,  // Trigger on first real silence
} as const;

export const MODEL_CONFIG: ModelConfig = {
  modelPath: "/models/summarizer",
  tokenizerPath: "/models/tokenizer.json",
  maxInputLength: 512,
  maxOutputLength: 128,
  executionProvider: "wasm",
};

// ─── Intent-Mapped Filler Phrase Bank ──────────────────────

export type QuestionIntent =
  | "self_introduction"
  | "strengths"
  | "weaknesses"
  | "project_experience"
  | "challenge"
  | "future_goals"
  | "motivation"
  | "teamwork"
  | "technical"
  | "behavioral"
  | "opinion"
  | "clarification_needed"
  | "general";

export interface FillerEntry {
  readonly text: string;
  readonly weight: number;
}

export const INTENT_FILLERS: Record<QuestionIntent, readonly FillerEntry[]> = {
  self_introduction: [
    { text: "Sure, let me introduce myself.", weight: 8 },
    { text: "Of course.", weight: 7 },
    { text: "Happy to share.", weight: 6 },
    { text: "Absolutely.", weight: 5 },
  ],
  strengths: [
    { text: "That's a great question.", weight: 8 },
    { text: "I'd say…", weight: 7 },
    { text: "Good question.", weight: 6 },
    { text: "If I had to pick…", weight: 5 },
  ],
  weaknesses: [
    { text: "That's fair to ask.", weight: 8 },
    { text: "Honestly…", weight: 7 },
    { text: "I've reflected on that.", weight: 6 },
    { text: "Good question.", weight: 5 },
  ],
  project_experience: [
    { text: "Let me walk you through that.", weight: 9 },
    { text: "Sure, so…", weight: 7 },
    { text: "One project that stands out…", weight: 8 },
    { text: "Let me give you an example.", weight: 6 },
  ],
  challenge: [
    { text: "One situation I recall…", weight: 9 },
    { text: "That's interesting to reflect on.", weight: 7 },
    { text: "Let me think…", weight: 6 },
    { text: "A challenging one was…", weight: 8 },
  ],
  future_goals: [
    { text: "I've thought about this a lot.", weight: 8 },
    { text: "Great question.", weight: 6 },
    { text: "Looking ahead…", weight: 7 },
    { text: "Long-term…", weight: 5 },
  ],
  motivation: [
    { text: "What excites me is…", weight: 8 },
    { text: "That's what drew me here.", weight: 7 },
    { text: "I'd say…", weight: 5 },
    { text: "Great question.", weight: 6 },
  ],
  teamwork: [
    { text: "I value collaboration.", weight: 7 },
    { text: "In my experience…", weight: 8 },
    { text: "Working with teams…", weight: 6 },
    { text: "That's important to me.", weight: 5 },
  ],
  technical: [
    { text: "Let me break this down.", weight: 9 },
    { text: "Sure, so technically…", weight: 8 },
    { text: "Good question.", weight: 5 },
    { text: "The way I'd approach this…", weight: 7 },
  ],
  behavioral: [
    { text: "I recall a situation…", weight: 8 },
    { text: "Let me give an example.", weight: 9 },
    { text: "That reminds me of…", weight: 7 },
    { text: "In one instance…", weight: 6 },
  ],
  opinion: [
    { text: "In my view…", weight: 8 },
    { text: "I believe…", weight: 7 },
    { text: "From my perspective…", weight: 6 },
    { text: "That's interesting.", weight: 5 },
  ],
  clarification_needed: [
    { text: "Just to clarify…", weight: 9 },
    { text: "Do you mean…", weight: 8 },
    { text: "Could you elaborate?", weight: 7 },
    { text: "Let me make sure I understand.", weight: 6 },
  ],
  general: [
    { text: "Let me think…", weight: 7 },
    { text: "That's interesting.", weight: 6 },
    { text: "Sure.", weight: 5 },
    { text: "Hmm…", weight: 4 },
  ],
} as const;

export const INTENT_PATTERNS: {
  intent: QuestionIntent;
  keywords: readonly string[];
  patterns: readonly RegExp[];
}[] = [
  {
    intent: "self_introduction",
    keywords: ["yourself", "about you", "introduce", "background", "who are you"],
    patterns: [/tell\s+(me\s+)?about\s+yourself/i, /introduce/i, /your\s+background/i],
  },
  {
    intent: "strengths",
    keywords: ["strength", "best at", "good at", "excel", "superpower"],
    patterns: [/greatest?\s+strength/i, /what.*good\s+at/i, /best\s+quality/i],
  },
  {
    intent: "weaknesses",
    keywords: ["weakness", "improve", "struggle", "worst", "lacking"],
    patterns: [/greatest?\s+weakness/i, /areas?\s+(for\s+)?improve/i, /struggle\s+with/i],
  },
  {
    intent: "project_experience",
    keywords: ["project", "built", "developed", "worked on", "portfolio", "system", "application"],
    patterns: [/tell.*about.*project/i, /what.*built/i, /describe.*work/i, /walk.*through/i],
  },
  {
    intent: "challenge",
    keywords: ["challenge", "difficult", "tough", "hardest", "obstacle", "failure", "mistake"],
    patterns: [/challenging/i, /difficult\s+(situation|time|project)/i, /overcome/i, /toughest/i],
  },
  {
    intent: "future_goals",
    keywords: ["future", "five years", "10 years", "goals", "plan", "vision", "aspiration"],
    patterns: [/where.*see\s+yourself/i, /five\s+years/i, /long[\s-]?term/i, /career\s+goal/i],
  },
  {
    intent: "motivation",
    keywords: ["why", "interest", "motivated", "passion", "excited", "reason", "apply"],
    patterns: [/why.*interest/i, /what\s+motivat/i, /why.*apply/i, /why.*this\s+(role|position|company)/i],
  },
  {
    intent: "teamwork",
    keywords: ["team", "collaborate", "colleague", "together", "conflict", "disagree"],
    patterns: [/work.*team/i, /collaborat/i, /disagree.*colleague/i, /team\s+player/i],
  },
  {
    intent: "technical",
    keywords: [
      "how would you", "design", "implement", "architecture", "algorithm",
      "database", "api", "system design", "code", "technology", "stack",
    ],
    patterns: [/how\s+would\s+you/i, /design\s+a/i, /implement/i, /technical/i, /explain.*concept/i],
  },
  {
    intent: "behavioral",
    keywords: ["time when", "example of", "describe a situation", "tell me about a time"],
    patterns: [/tell.*time\s+(when|you)/i, /give.*example/i, /describe.*situation/i, /a\s+time\s+when/i],
  },
  {
    intent: "opinion",
    keywords: ["think about", "opinion", "feel about", "prefer", "favorite"],
    patterns: [/what.*think/i, /your\s+opinion/i, /how.*feel\s+about/i, /do\s+you\s+prefer/i],
  },
  {
    intent: "clarification_needed",
    keywords: [],
    patterns: [/^.{0,15}$/],
  },
];