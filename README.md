https://github.com/user-attachments/assets/032e8555-e472-4a90-99a4-5e4dd4ccebf1

# 🎙️ Voice Interview AI — Complete Architecture

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (100% Client-Side)                               │
│                                                                                  │
│  ┌──────────┐    ┌─────────────────┐    ┌───────────────┐    ┌───────────────┐  │
│  │ MICROPHONE│───▶│ Speech          │───▶│ Transcript    │───▶│ Summarizer    │  │
│  │ (WebRTC)  │    │ Recognition     │    │ Store         │    │ (TextRank/T5) │  │
│  └──────────┘    │ + VAD           │    └───────┬───────┘    └───────┬───────┘  │
│                  └─────────────────┘            │                    │           │
│                    │ volume │ silence            │                    │           │
│                    ▼        ▼                    │                    ▼           │
│  ┌──────────┐    ┌─────────────────┐            │            ┌───────────────┐  │
│  │ KEYBOARD │───▶│ Session Manager │◀───────────┘            │ Summary UI    │  │
│  │ (manual)  │    │ (state machine) │                         │ Panel         │  │
│  └──────────┘    └────────┬────────┘                         └───────────────┘  │
│                           │                                                      │
│                    ┌──────┴──────┐                                               │
│                    ▼             ▼                                               │
│            ┌──────────────┐  ┌──────────────┐    ┌───────────────┐              │
│            │ Filler Engine│  │ TTS Controller│───▶│ SPEAKER 🔊    │              │
│            │ (intent-     │─▶│ (Web Speech   │    └───────────────┘              │
│            │  aware)      │  │  API)         │                                   │
│            └──────────────┘  └──────────────┘                                   │
│                                     │                                            │
│                              ┌──────┴──────┐                                    │
│                              ▼             ▼                                    │
│                       ┌────────────┐ ┌────────────┐                             │
│                       │ Pause      │ │ Filler     │                             │
│                       │ Detector   │ │ Player     │                             │
│                       └────────────┘ └────────────┘                             │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │  METRICS: Load Time │ Inference Latency │ Memory │ Mic Status │ FPS        │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌──────────────────┐                                                           │
│  │ SERVICE WORKER    │ ← Caches all assets for offline use                      │
│  └──────────────────┘                                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete File Tree + Purpose

```
voice-interview-ai/
│
├── package.json                    # Dependencies: @huggingface/transformers, vite, typescript
├── tsconfig.json                   # TypeScript config (ES2022, strict mode)
├── vite.config.ts                  # Vite bundler config (COOP/COEP headers, WASM exclude)
├── index.html                      # Entry HTML (CSS variables, dark theme, #app mount)
│
├── public/
│   └── sw.js                       # Service Worker: caches assets + models for offline
│
├── src/
│   ├── main.ts                     # Entry point: creates App, error boundary
│   ├── types.ts                    # All TypeScript interfaces + types
│   ├── config.ts                   # Configuration + intent-mapped filler phrase bank
│   │
│   ├── core/                       # ─── BRAIN (Summarization + Fillers) ───
│   │   ├── summarizer.ts           # Tier 1: TextRank + TF-IDF extractive summarizer
│   │   ├── transformers-summarizer.ts # Tier 2: HuggingFace Transformers.js (flan-t5-small)
│   │   ├── model-manager.ts        # Model lifecycle: load, cache, dispose, metrics
│   │   ├── filler-engine.ts        # Smart context-aware filler generation
│   │   └── tokenizer.ts            # Lightweight BPE tokenizer + TF-IDF vectorizer
│   │
│   ├── audio/                      # ─── EARS + MOUTH (Audio I/O) ───
│   │   ├── speech-recognition.ts   # Mic input: Web Speech API + Web Audio VAD
│   │   ├── tts-controller.ts       # Text-to-Speech output: Web Speech Synthesis
│   │   ├── pause-detector.ts       # Detects pauses in TTS for filler insertion
│   │   └── filler-player.ts        # Plays filler phrases via TTS
│   │
│   ├── interview/                  # ─── COORDINATOR (Session Logic) ───
│   │   ├── session.ts              # Master orchestrator: state machine, all event wiring
│   │   └── transcript.ts           # Transcript store: circular buffer, localStorage persist
│   │
│   ├── metrics/                    # ─── MONITORING ───
│   │   └── perf-monitor.ts         # Performance: timers, P95, memory, FPS
│   │
│   └── ui/                         # ─── FACE (User Interface) ───
│       ├── app.ts                  # Main UI: DOM construction, event binding, rendering
│       ├── dashboard.ts            # Metrics dashboard: live-updating cards
│       └── styles.ts               # All CSS injected at runtime (self-contained)
│
└── (deleted files)
    ├── core/onnx-summarizer.ts     # ❌ REMOVED (replaced by transformers-summarizer.ts)
    └── workers/inference.worker.ts # ❌ REMOVED (was only for ONNX)
```

---

## 3. Technology Stack

| Layer | Technology | Why This |
|---|---|---|
| **Bundler** | Vite 6 | Fast HMR, ES modules, WASM support |
| **Language** | TypeScript (strict) | Type safety, better DX |
| **Summarization Tier 1** | TextRank + TF-IDF (pure JS) | 0 MB, 2-15ms, works offline |
| **Summarization Tier 2** | `@huggingface/transformers` + `Xenova/flan-t5-small` | ~60MB quantized, abstractive quality |
| **Speech-to-Text** | Web Speech API (`SpeechRecognition`) | Built into Chrome/Edge, 0 bytes |
| **Voice Activity Detection** | Web Audio API (`AnalyserNode`) | Real-time volume + silence detection |
| **Text-to-Speech** | Web Speech API (`SpeechSynthesis`) | Built-in voices, 0 bytes |
| **Filler Intelligence** | Custom intent detection engine | Keyword + regex pattern matching |
| **Offline Support** | Service Worker + Cache API | Full offline after first load |
| **Storage** | `localStorage` | Persists transcript across sessions |
| **Styling** | Runtime CSS injection | Zero external CSS files |

---

## 4. Data Flow: Step by Step

### Flow A: User Speaks into Microphone

```
Step 1: User clicks "🎤 Start Mic"
        │
        ▼
Step 2: navigator.mediaDevices.getUserMedia()
        ├── Audio stream → SpeechRecognition (speech-to-text)
        └── Audio stream → AnalyserNode (volume metering + VAD)
        │
        ▼
Step 3: SpeechRecognition fires events:
        ├── "interim" → show partial text in mic bar (grey italic)
        ├── "final"   → buffer text (wait 1.2s for more fragments)
        ├── "silence"  → flush buffer → add to transcript
        └── "volume"  → update volume bar (green/red)
        │
        ▼
Step 4: Final text buffered → flushed to TranscriptStore
        │
        ▼
Step 5: TranscriptStore notifies → 2 things happen:
        ├── UI updates (transcript panel shows new entry)
        └── scheduleSummary() starts 600ms debounce timer
        │
        ▼
Step 6: After 600ms of no new entries → summarizeNow() runs
        ├── Tier 2 ready? → Transformers.js abstractive (~500ms-2s)
        └── Tier 2 not ready? → TextRank extractive (~2-15ms)
        │
        ▼
Step 7: Summary displayed in UI with confidence + latency
```

### Flow B: Silence → Filler Insertion

```
Step 1: VAD detects silence (no speech for 3 seconds)
        │
        ▼
Step 2: SpeechRecognition emits "silence" event
        │
        ▼
Step 3: Session calls fillerEngine.onSilenceDetected()
        └── Increments consecutiveSilences counter
        │
        ▼
Step 4: Session calls fillerEngine.tryGenerate()
        │
        ├── Guard 1: Enough transcript entries? (min 1)
        ├── Guard 2: Cooldown clear? (5s since last filler)
        ├── Guard 3: Under frequency limit? (max 5/minute)
        ├── Guard 4: Enough consecutive silences? (need 1)
        │
        ├── ALL PASS → Generate filler
        └── ANY FAIL → Skip (log reason to console)
        │
        ▼
Step 5: Intent Detection:
        ├── Find last interviewer question
        ├── Run through 12 intent patterns (regex + keywords)
        ├── Match: "Tell me about yourself" → self_introduction
        ├── Match: "greatest strength" → strengths
        ├── Match: "challenging project" → challenge
        └── No match → "general"
        │
        ▼
Step 6: Select filler from intent-mapped bank:
        ├── Filter out recently-used fillers (diversity)
        ├── Weighted random selection (higher weight = more likely)
        └── Result: "Let me walk you through that." [project_experience]
        │
        ▼
Step 7: Pause mic → Play filler via TTS → Resume mic
        │
        ▼
Step 8: UI shows filler in log with intent tag + category badge
```

### Flow C: Demo Mode

```
Step 1: User clicks "🎬 Full Demo"
        │
        ▼
Step 2: Loop 4 times:
        │
        ├── askQuestion("Tell me about yourself...")
        │   ├── Add to transcript as "interviewer"
        │   ├── Speak via TTS (pause mic during)
        │   └── Wait 1000ms
        │
        ├── addResponse("I have over five years...")
        │   ├── Add to transcript as "candidate"
        │   └── Wait 500ms
        │
        ├── forceInsertFiller() ← bypasses all guards
        │   ├── Detect intent from last question
        │   ├── Select matching filler
        │   ├── Play via TTS
        │   └── Wait 500ms
        │
        └── summarizeNow() ← explicit trigger
            ├── TextRank processes all entries
            ├── Returns key points + confidence
            └── Wait 500ms
        │
        ▼
Step 3: All 4 rounds complete → button re-enabled
```

---

## 5. Summarization Pipeline Detail

### Tier 1: TextRank (Default — Always On)

```
Input: ["interviewer: Tell me about...", "candidate: I have 5 years..."]
        │
        ▼
Step 1: Split into sentences (rule-based: split on .!? + newlines)
        → ["Tell me about yourself", "I have 5 years of experience", ...]
        │
        ▼
Step 2: Tokenize each sentence into words
        → [["tell","about","yourself"], ["have","years","experience"], ...]
        │
        ▼
Step 3: Build TF-IDF vectors
        ├── TF (Term Frequency): count each word per sentence
        ├── IDF (Inverse Document Frequency): log(N/df) per word
        └── TF-IDF vector per sentence: Float32Array
        │
        ▼
Step 4: Build cosine similarity matrix (sentence × sentence)
        similarity[i][j] = dot(vec_i, vec_j) / (norm_i * norm_j)
        │
        ▼
Step 5: TextRank algorithm (PageRank variant):
        ├── Initialize scores: 1/N for each sentence
        ├── Iterate until convergence (max 50 iterations):
        │   score[i] = (1-d)/N + d * Σ (similarity[j][i]/outSum[j]) * score[j]
        │   where d = 0.85 (damping factor)
        └── Converge when max delta < 0.0001
        │
        ▼
Step 6: Select top-K sentences by score, preserve original order
        │
        ▼
Output: { text: "...", keyPoints: [...], confidence: 0.72, latencyMs: 8.3 }
```

**Size**: 0 MB | **Latency**: 2-15ms | **Quality**: Good for extractive

### Tier 2: Transformers.js flan-t5-small (Optional — User Opt-In)

```
Input: "summarize: interviewer: Tell me... candidate: I have 5 years..."
        │
        ▼
Step 1: Dynamic import("@huggingface/transformers")
        └── Only loads when user clicks "🧠 Enable AI Summary"
        │
        ▼
Step 2: pipeline("text2text-generation", "Xenova/flan-t5-small", { quantized: true })
        ├── Downloads ~60MB ONNX model (INT8 quantized)
        ├── Cached by browser after first download
        └── Runs via WASM backend (works everywhere)
        │
        ▼
Step 3: Tokenize input with T5 tokenizer
        └── BPE (Byte-Pair Encoding) → token IDs
        │
        ▼
Step 4: Run encoder → hidden states
        │
        ▼
Step 5: Greedy decode: generate tokens one by one
        ├── max_new_tokens: 80
        ├── min_new_tokens: 20
        └── do_sample: false (deterministic)
        │
        ▼
Step 6: Decode token IDs back to text
        │
        ▼
Output: { text: "...", keyPoints: [...], confidence: 0.85, latencyMs: 1200 }
```

**Size**: ~60 MB (one-time download) | **Latency**: 500ms-2s | **Quality**: Better abstractive

---

## 6. Filler Intelligence Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    FILLER ENGINE PIPELINE                         │
│                                                                  │
│  1. TRIGGER                                                      │
│     ├── Silence detected (3s no speech)                         │
│     ├── TTS pause detected (1.2s gap in boundaries)             │
│     └── Manual button press (bypasses guards)                    │
│                                                                  │
│  2. GUARD CHECKS (auto-trigger only)                            │
│     ├── ≥1 transcript entry exists?                   yes/no    │
│     ├── ≥5s since last filler? (cooldown)             yes/no    │
│     ├── <5 fillers in last minute? (frequency)        yes/no    │
│     └── ≥1 consecutive silence? (not just a pause)    yes/no    │
│     ALL must pass → continue. ANY fail → skip.                  │
│                                                                  │
│  3. INTENT DETECTION                                            │
│     Find last interviewer message, then:                         │
│                                                                  │
│     "Tell me about yourself"  → self_introduction               │
│     "greatest strengths"      → strengths                       │
│     "challenging project"     → challenge                       │
│     "five years"              → future_goals                    │
│     "why interested"          → motivation                      │
│     "work in a team"          → teamwork                        │
│     "how would you design"    → technical                       │
│     "tell me about a time"    → behavioral                      │
│     "what do you think"       → opinion                         │
│     (short/ambiguous)         → clarification_needed            │
│     (no match)                → general                         │
│                                                                  │
│  4. FILLER SELECTION                                            │
│     ├── Get candidates for detected intent                      │
│     ├── Filter out recently-used (last 12) for diversity        │
│     └── Weighted random pick (weight 1-10)                      │
│                                                                  │
│     Example for intent "project_experience":                    │
│     ┌───────────────────────────────────┬────────┐              │
│     │ Filler                            │ Weight │              │
│     ├───────────────────────────────────┼────────┤              │
│     │ "Let me walk you through that."   │ 9      │              │
│     │ "One project that stands out…"    │ 8      │              │
│     │ "Sure, so…"                       │ 7      │              │
│     │ "Let me give you an example."     │ 6      │              │
│     └───────────────────────────────────┴────────┘              │
│                                                                  │
│  5. PLAYBACK                                                    │
│     ├── Pause mic (prevent echo)                                │
│     ├── Speak filler via SpeechSynthesis TTS                    │
│     ├── Resume mic                                              │
│     └── Display in UI with intent tag + category + timestamp    │
│                                                                  │
│  6. BOOKKEEPING                                                 │
│     ├── Record timestamp (for cooldown/frequency tracking)      │
│     ├── Add to recently-used set (for diversity)                │
│     ├── Add to history (for UI display)                         │
│     └── Reset silence counter to 0                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Speech Recognition Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│              SPEECH RECOGNITION PIPELINE                         │
│                                                                  │
│  LAYER 1: Web Speech API (SpeechRecognition)                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - Browser-native speech-to-text                            │ │
│  │ - Continuous mode (keeps listening)                         │ │
│  │ - Interim results (shows partial text as you speak)        │ │
│  │ - Auto-restart (max 5 attempts if browser kills it)        │ │
│  │ - Language: en-US (configurable)                           │ │
│  │                                                            │ │
│  │ Events:                                                    │ │
│  │   "interim"  → partial text (grey italic in mic bar)       │ │
│  │   "final"    → confirmed text (buffered for 1.2s)          │ │
│  │   "error"    → "no-speech" (ignored), "not-allowed" (fatal)│ │
│  │   "end"      → auto-restart if still listening             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  LAYER 2: Web Audio API (Voice Activity Detection)              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - AudioContext (16kHz sample rate)                          │ │
│  │ - AnalyserNode (FFT size 512, smoothing 0.8)               │ │
│  │ - MediaStreamSource → Analyser (NOT connected to speaker)  │ │
│  │ - 10Hz polling (every 100ms):                              │ │
│  │     1. getFloatTimeDomainData()                            │ │
│  │     2. Compute RMS volume: sqrt(sum(x²)/N)                │ │
│  │     3. Normalize to 0-1: min(rms * 5, 1.0)                │ │
│  │     4. Compare to noise gate threshold (0.015)             │ │
│  │     5. If below threshold for 3s → emit "silence"          │ │
│  │                                                            │ │
│  │ Events:                                                    │ │
│  │   "volume"   → volume level 0-1 (updates meter bar)        │ │
│  │   "silence"  → no speech for 3 seconds                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  LAYER 3: Text Buffering (in session.ts)                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Problem: SpeechRecognition returns fragments like:          │ │
│  │   "I have"  →  "I have five"  →  "I have five years"      │ │
│  │                                                            │ │
│  │ Solution: Buffer final results for 1.2 seconds:            │ │
│  │   final("I have five years") → buffer                      │ │
│  │   final("of experience")     → buffer + " " + text         │ │
│  │   ... 1.2s silence ...                                     │ │
│  │   flush → addResponse("I have five years of experience")   │ │
│  │                                                            │ │
│  │ Result: Clean, coherent transcript entries                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  MICROPHONE CONSTRAINTS (getUserMedia):                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ echoCancellation: true    ← prevents TTS feedback loop     │ │
│  │ noiseSuppression: true    ← filters ambient noise          │ │
│  │ autoGainControl:  true    ← normalizes volume levels       │ │
│  │ channelCount:     1       ← mono (speech doesn't need stereo)│
│  │ sampleRate:       16000   ← standard for speech recognition│ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. TTS + Pause Detection Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                TTS + PAUSE DETECTION PIPELINE                    │
│                                                                  │
│  TTSController (tts-controller.ts)                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - Uses window.speechSynthesis (Web Speech API)             │ │
│  │ - Auto-selects best English voice (local preferred)        │ │
│  │ - Configurable rate (1.0) and pitch (1.0)                  │ │
│  │                                                            │ │
│  │ Event flow for speak("Tell me about yourself"):            │ │
│  │   1. Cancel any ongoing speech                             │ │
│  │   2. Create SpeechSynthesisUtterance                       │ │
│  │   3. Set voice, rate, pitch                                │ │
│  │   4. Emit "start" → synth.speak(utterance)                 │ │
│  │   5. During speech: "boundary" events (word boundaries)    │ │
│  │   6. Emit "end" when complete                              │ │
│  │                                                            │ │
│  │ Mic coordination:                                          │ │
│  │   - askQuestion() → pause mic → speak → resume mic         │ │
│  │   - forceInsertFiller() → pause mic → speak → resume mic   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  PauseDetector (pause-detector.ts)                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - Monitors TTS "boundary" events for timing gaps           │ │
│  │ - If 1.2s passes between boundaries during active speech:  │ │
│  │     → Emit "pause" → triggers filler insertion             │ │
│  │ - Does NOT fire on normal speech end (only mid-speech gaps)│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  FillerPlayer (filler-player.ts)                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - Queue-based: max 3 fillers queued                        │ │
│  │ - Playback: pause main TTS → 200ms wait → speak filler    │ │
│  │             → 300ms wait → resume main TTS                 │ │
│  │ - Prevents overlapping fillers                              │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. State Machine

```
                    ┌───────────┐
                    │   IDLE    │ ← Initial state / after reset
                    └─────┬─────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌───────────┐  ┌────────────┐  ┌───────────┐
    │QUESTIONING│  │  GREETING  │  │  CLOSING  │
    │(TTS asking)│  │            │  │           │
    └─────┬─────┘  └────────────┘  └───────────┘
          │
          ▼
    ┌───────────┐
    │ LISTENING │ ← Mic active, waiting for response
    │           │ ← Fillers can trigger here
    │           │ ← Summary auto-generates here
    └─────┬─────┘
          │
          ▼
    ┌────────────┐
    │SUMMARIZING │ ← TextRank / Transformers.js running
    └─────┬──────┘
          │
          ▼
    ┌───────────┐
    │ LISTENING │ ← Back to listening after summary
    └───────────┘
```

---

## 10. Performance Budget

```
┌────────────────────────┬──────────────┬──────────────┬────────────┐
│ Metric                 │ Requirement  │ Tier 1       │ Tier 2     │
│                        │              │ (TextRank)   │ (flan-t5)  │
├────────────────────────┼──────────────┼──────────────┼────────────┤
│ Model download size    │ ≤ 30MB       │ 0 MB ✅      │ ~60MB ⚠️   │
│ Total bundle size      │ ≤ 100MB      │ ~2MB ✅      │ ~62MB ✅   │
│ Inference latency      │ < 50ms       │ 2-15ms ✅    │ 500ms-2s ❌│
│ Model load time        │ < 3s         │ <1ms ✅      │ 2-10s ⚠️   │
│ First paint            │ < 1s         │ ~200ms ✅    │ ~200ms ✅  │
│ Offline support        │ Required     │ ✅ always    │ ✅ cached  │
│ Memory usage           │ < 200MB      │ ~20MB ✅     │ ~120MB ✅  │
│ UI jank (FPS drop)     │ None         │ ✅ none      │ ✅ none*   │
└────────────────────────┴──────────────┴──────────────┴────────────┘

* Tier 2 inference runs on main thread but doesn't block UI
  because Transformers.js yields to event loop during decode.
```

---

## 11. Offline Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    OFFLINE SUPPORT                                │
│                                                                  │
│  Service Worker (sw.js)                                         │
│  ├── Install: cache index.html + JS bundle                      │
│  ├── Activate: clear old caches                                  │
│  ├── Fetch strategy:                                            │
│  │   ├── /models/* → Cache-first (download once, use forever)   │
│  │   └── Everything else → Cache-first, fallback to network     │
│  │                                                              │
│  localStorage                                                   │
│  ├── Transcript: last 100 entries persisted                     │
│  ├── Auto-loads on page refresh                                 │
│  └── Auto-prunes when exceeds limit                             │
│                                                                  │
│  Browser Cache (for Transformers.js)                            │
│  ├── @huggingface/transformers uses IndexedDB internally        │
│  ├── Model files cached after first download                    │
│  └── Subsequent loads: <100ms from cache                        │
│                                                                  │
│  What works offline:                                            │
│  ├── ✅ TextRank summarization (always)                         │
│  ├── ✅ Filler generation (always)                              │
│  ├── ✅ TTS playback (browser voices)                           │
│  ├── ✅ Tier 2 summarization (after first download)             │
│  ├── ⚠️ Speech recognition (needs Chrome online*)               │
│  └── ❌ Tier 2 first download (needs internet)                  │
│                                                                  │
│  * Chrome's SpeechRecognition sends audio to Google servers.    │
│    Some browsers (Edge) can do on-device recognition.           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. Event System Map

```
┌──────────────────────────────────────────────────────────────────┐
│                     EVENT FLOW MAP                                │
│                                                                  │
│  SpeechRecognition ──┬── "final"    ──▶ Session.handleFinal()   │
│                      ├── "interim"  ──▶ Session → UI interim bar│
│                      ├── "silence"  ──▶ Session.tryInsertFiller()│
│                      ├── "volume"   ──▶ Session → UI volume bar │
│                      ├── "error"    ──▶ Session → console.warn  │
│                      └── "end"      ──▶ Session.flushBuffer()   │
│                                                                  │
│  PauseDetector ──────── "pause"     ──▶ Session.tryInsertFiller()│
│                                                                  │
│  TranscriptStore ────── "change"    ──▶ Session → UI transcript │
│                                     ──▶ Session.scheduleSummary()│
│                                                                  │
│  Session ────────────┬── "phaseChange"      ──▶ UI phase badge  │
│                      ├── "summaryUpdate"    ──▶ UI summary panel│
│                      ├── "fillerPlayed"     ──▶ UI filler log   │
│                      ├── "fillerSkipped"    ──▶ console.log     │
│                      ├── "metricsUpdate"    ──▶ UI dashboard    │
│                      ├── "transcriptUpdate" ──▶ UI transcript   │
│                      ├── "interimTranscript"──▶ UI mic bar      │
│                      ├── "volumeChange"     ──▶ UI volume meter │
│                      ├── "recognitionEvent" ──▶ UI mic status   │
│                      └── "neuralLoadProgress"─▶ UI neural btn   │
│                                                                  │
│  TTSController ──────┬── "start"    ──▶ PauseDetector.reset()   │
│                      ├── "boundary" ──▶ PauseDetector.check()   │
│                      ├── "end"      ──▶ PauseDetector.clear()   │
│                      └── "error"    ──▶ console.error           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 13. Browser Compatibility

```
┌───────────────┬────────────────┬──────────────────────────────────┐
│ Feature       │ API Used       │ Browser Support                  │
├───────────────┼────────────────┼──────────────────────────────────┤
│ Speech-to-Text│ SpeechRecog.   │ Chrome 33+, Edge 79+             │
│               │                │ ❌ Firefox, ❌ Safari             │
├───────────────┼────────────────┼──────────────────────────────────┤
│ Text-to-Speech│ SpeechSynth.   │ Chrome 33+, Edge 14+,            │
│               │                │ Firefox 49+, Safari 7+           │
├───────────────┼────────────────┼──────────────────────────────────┤
│ Volume Meter  │ Web Audio API  │ All modern browsers              │
├───────────────┼────────────────┼──────────────────────────────────┤
│ WASM (T.js)   │ WebAssembly    │ All modern browsers              │
├───────────────┼────────────────┼──────────────────────────────────┤
│ Offline       │ Service Worker │ All modern browsers              │
├───────────────┼────────────────┼──────────────────────────────────┤
│ Storage       │ localStorage   │ All browsers                     │
└───────────────┴────────────────┴──────────────────────────────────┘

Recommended: Chrome 90+ or Edge 90+ for full feature support.
```






