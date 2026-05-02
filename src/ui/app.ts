import type {
  TranscriptEntry,
  SummaryResult,
  FillerPhrase,
  InterviewPhase,
} from "../types";
import type { RecognitionEvent } from "../audio/speech-recognition";
import { InterviewSessionManager } from "../interview/session";
import { PerformanceMonitor } from "../metrics/perf-monitor";
import { MetricsDashboard } from "./dashboard";
import { injectStyles } from "./styles";

export class App {
  private session: InterviewSessionManager;
  private perfMonitor: PerformanceMonitor;
  private dashboard!: MetricsDashboard;
  private root: HTMLElement;

  // DOM refs
  private transcriptEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private fillerLogEl!: HTMLElement;
  private phaseEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private micBtn!: HTMLButtonElement;
  private neuralBtn!: HTMLButtonElement;
  private volumeBar!: HTMLElement;
  private interimEl!: HTMLElement;
  private micStatusEl!: HTMLElement;

  private readonly demoQuestions = [
    "Tell me about yourself and your professional background.",
    "What are your greatest strengths when working in a team?",
    "Describe a challenging project you've worked on recently.",
    "Where do you see yourself in five years?",
    "Why are you interested in this position?",
    "Tell me about a time you had to learn a new technology quickly.",
    "How do you handle disagreements with colleagues?",
    "What accomplishment are you most proud of?",
  ];

  private readonly demoResponses = [
    "I have over five years of experience in full-stack development, working with React, Node.js, and cloud infrastructure. I've led teams of three to eight developers on enterprise projects.",
    "My greatest strength is communication. I believe in clear, proactive updates and enjoy mentoring junior developers. I also thrive under pressure and enjoy debugging complex systems.",
    "Recently, I migrated a monolithic application to microservices. It was challenging because we had to maintain zero downtime while splitting the database. The project improved response times by 60%.",
    "In five years, I see myself leading engineering teams and contributing to architectural decisions. I'm passionate about building scalable systems and mentoring others.",
    "I'm excited about this role because it combines technical challenges with leadership opportunities. Your team's focus on AI-driven products aligns perfectly with my interests.",
    "When our team adopted Kubernetes, I spent evenings learning it and created an internal training guide. Within a month, I was helping others troubleshoot deployments.",
    "I approach disagreements by first understanding the other perspective. I find that most conflicts stem from miscommunication. I focus on data-driven decisions whenever possible.",
    "I'm most proud of building an accessibility framework that our entire product line adopted. It improved our WCAG compliance from 40% to 98% and positively impacted millions of users.",
  ];

  private demoIndex = 0;

  constructor(rootSelector: string) {
    const el = document.querySelector(rootSelector);
    if (!el) throw new Error(`Root element not found: ${rootSelector}`);
    this.root = el as HTMLElement;
    this.session = new InterviewSessionManager();
    this.perfMonitor = new PerformanceMonitor();
  }

  // ═══════════════════════════════════════════════════════
  // BOOTSTRAP
  // ═══════════════════════════════════════════════════════

  async start(): Promise<void> {
    injectStyles();
    this.buildDOM();
    this.bindEvents();

    const { durationMs: loadTime } = await this.perfMonitor.measure(
      "model-load",
      () => this.session.initialize()
    );

    console.log(`[App] Initialized in ${loadTime.toFixed(0)}ms`);
    this.updateMetrics();
    this.perfMonitor.startFPSMonitor(() => this.updateMetrics());
    this.registerServiceWorker();
  }

  // ═══════════════════════════════════════════════════════
  // DOM
  // ═══════════════════════════════════════════════════════

  private buildDOM(): void {
    this.root.innerHTML = `
      <header class="vai-header">
        <h1>🎙️ Voice Interview AI</h1>
        <p class="vai-subtitle">
          Ultra-lightweight client-side AI &bull; Runs 100% offline
          <span class="vai-status vai-status-online" id="vai-phase">● Idle</span>
        </p>
      </header>

      <div class="vai-controls">
        <button class="vai-btn vai-btn-mic" id="vai-btn-mic" title="Toggle Microphone">
          🎤 Start Mic
        </button>
        <button class="vai-btn vai-btn-primary" id="vai-btn-question">
          💬 Ask Question
        </button>
        <button class="vai-btn" id="vai-btn-respond">
          🗣️ Simulate Response
        </button>
        <button class="vai-btn" id="vai-btn-summarize">
          📝 Summarize
        </button>
        <button class="vai-btn" id="vai-btn-filler">
          ⏸️ Insert Filler
        </button>
        <button class="vai-btn" id="vai-btn-demo">
          🎬 Full Demo
        </button>
        <button class="vai-btn" id="vai-btn-neural" title="Download ~60MB AI model for better summaries">
          🧠 Enable AI Summary
        </button>
        <button class="vai-btn" id="vai-btn-reset">
          🔄 Reset
        </button>
      </div>

      <div class="vai-mic-bar" id="vai-mic-bar" style="display:none;">
        <div class="vai-mic-status">
          <span class="vai-mic-indicator" id="vai-mic-indicator">●</span>
          <span id="vai-mic-status-text">Listening…</span>
        </div>
        <div class="vai-volume-container">
          <span class="vai-volume-label">Vol</span>
          <div class="vai-volume-track">
            <div class="vai-volume-fill" id="vai-volume-fill"></div>
          </div>
        </div>
        <div class="vai-interim" id="vai-interim"></div>
      </div>

      <div class="vai-input-row">
        <input class="vai-input" id="vai-input" type="text"
          placeholder="Type a question (ends with ?) or response…" />
        <button class="vai-btn vai-btn-primary" id="vai-btn-send">Send</button>
      </div>

      <div class="vai-grid">
        <div class="vai-card">
          <h2><span class="vai-dot"></span> Live Transcript</h2>
          <div class="vai-transcript" id="vai-transcript">
            <div class="vai-empty">Conversation will appear here…</div>
          </div>
        </div>
        <div class="vai-card">
          <h2>
            <span class="vai-dot"></span> AI Summary
            <span class="vai-tier-badge" id="vai-tier-badge">Tier 1: TextRank</span>
          </h2>
          <div class="vai-summary" id="vai-summary">
            <div class="vai-empty">Summary will be generated as conversation progresses…</div>
          </div>
        </div>
      </div>

      <div class="vai-grid">
        <div class="vai-card">
          <h2><span class="vai-dot"></span> Context-Aware Fillers</h2>
          <div class="vai-filler-log" id="vai-filler-log">
            <div class="vai-empty">Smart fillers triggered on natural pauses…</div>
          </div>
        </div>
        <div id="vai-dashboard"></div>
      </div>
    `;

    this.transcriptEl = document.getElementById("vai-transcript")!;
    this.summaryEl = document.getElementById("vai-summary")!;
    this.fillerLogEl = document.getElementById("vai-filler-log")!;
    this.phaseEl = document.getElementById("vai-phase")!;
    this.inputEl = document.getElementById("vai-input") as HTMLInputElement;
    this.micBtn = document.getElementById("vai-btn-mic") as HTMLButtonElement;
    this.neuralBtn = document.getElementById("vai-btn-neural") as HTMLButtonElement;
    this.volumeBar = document.getElementById("vai-volume-fill")!;
    this.interimEl = document.getElementById("vai-interim")!;
    this.micStatusEl = document.getElementById("vai-mic-bar")!;

    if (!this.session.isSpeechRecognitionSupported) {
      this.micBtn.disabled = true;
      this.micBtn.title = "Speech recognition not supported (try Chrome)";
      this.micBtn.textContent = "🎤 Not Supported";
    }

    this.dashboard = new MetricsDashboard(document.getElementById("vai-dashboard")!);
  }

  // ═══════════════════════════════════════════════════════
  // EVENT BINDING
  // ═══════════════════════════════════════════════════════

  private bindEvents(): void {
    this.onClick("vai-btn-mic", () => this.toggleMicrophone());
    this.onClick("vai-btn-question", () => this.askNextQuestion());
    this.onClick("vai-btn-respond", () => this.simulateResponse());
    this.onClick("vai-btn-summarize", () => this.triggerSummary());
    this.onClick("vai-btn-filler", () => this.forceInsertFiller());
    this.onClick("vai-btn-demo", () => this.runFullDemo());
    this.onClick("vai-btn-neural", () => this.enableNeuralModel());
    this.onClick("vai-btn-reset", () => this.resetSession());
    this.onClick("vai-btn-send", () => this.sendManualInput());

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.sendManualInput();
    });

    // Session events
    this.session.on("transcriptUpdate", (entries) => this.renderTranscript(entries));
    this.session.on("summaryUpdate", (summary) => this.renderSummary(summary));
    this.session.on("fillerPlayed", (filler) => this.renderFiller(filler));
    this.session.on("fillerSkipped", (reason) => console.log(`[UI] Filler skipped: ${reason}`));
    this.session.on("phaseChange", (phase) => this.renderPhase(phase));
    this.session.on("metricsUpdate", () => this.updateMetrics());
    this.session.on("interimTranscript", (text) => this.renderInterim(text));
    this.session.on("volumeChange", (volume) => this.renderVolume(volume));
    this.session.on("recognitionEvent", (event) => this.handleRecognitionEvent(event));
  }

  // ═══════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════

  private async toggleMicrophone(): Promise<void> {
    try {
      this.micBtn.disabled = true;
      const isNowListening = await this.session.toggleListening();
      if (isNowListening) {
        this.micBtn.textContent = "🔴 Stop Mic";
        this.micBtn.classList.add("vai-btn-recording");
        this.micStatusEl.style.display = "flex";
      } else {
        this.micBtn.textContent = "🎤 Start Mic";
        this.micBtn.classList.remove("vai-btn-recording");
        this.micStatusEl.style.display = "none";
        this.interimEl.textContent = "";
      }
    } catch (err) {
      console.error("Mic error:", err);
      this.showMicError(err instanceof Error ? err.message : "Microphone error");
    } finally {
      this.micBtn.disabled = false;
    }
  }

  private async enableNeuralModel(): Promise<void> {
    if (this.session.isNeuralReady) {
      this.neuralBtn.textContent = "🧠 AI Active ✓";
      return;
    }
    this.neuralBtn.disabled = true;
    this.neuralBtn.textContent = "⏳ Downloading…";
    try {
      await this.session.enableNeuralSummarizer((progress) => {
        if (progress.total > 0) {
          const pct = ((progress.loaded / progress.total) * 100).toFixed(0);
          this.neuralBtn.textContent = `⏳ ${pct}% (~60MB)`;
        } else {
          this.neuralBtn.textContent = `⏳ ${progress.status}`;
        }
      });
      this.neuralBtn.textContent = "🧠 AI Active ✓";
      this.neuralBtn.classList.add("vai-btn-primary");
      this.neuralBtn.disabled = false;
      const badge = document.getElementById("vai-tier-badge");
      if (badge) {
        badge.textContent = "Tier 2: flan-t5-small";
        badge.classList.add("vai-tier-2");
      }
      this.updateMetrics();
    } catch (err) {
      this.neuralBtn.textContent = "🧠 Failed — Retry";
      this.neuralBtn.disabled = false;
      console.error("Neural model failed:", err);
    }
  }

  private async askNextQuestion(): Promise<void> {
    const question = this.demoQuestions[this.demoIndex % this.demoQuestions.length];
    this.demoIndex++;
    console.log(`[UI] Asking: "${question.slice(0, 40)}..."`);
    await this.session.askQuestion(question);
  }

  private simulateResponse(): void {
    const response = this.demoResponses[Math.floor(Math.random() * this.demoResponses.length)];
    console.log(`[UI] Simulating response: "${response.slice(0, 40)}..."`);
    this.session.addResponse(response);
  }

  private async triggerSummary(): Promise<void> {
    console.log("[UI] Manual summary trigger");
    const stop = this.perfMonitor.startTimer("summarize");
    await this.session.summarizeNow();
    const entry = stop();
    console.log(`[UI] Summary done in ${entry.durationMs.toFixed(1)}ms`);
    this.updateMetrics();
  }

  private async forceInsertFiller(): Promise<void> {
    console.log("[UI] Manual filler trigger");
    await this.session.forceInsertFiller();
  }

  /**
   * Full demo: asks questions, simulates responses, triggers fillers + summary.
   * KEY FIX: Longer delays + explicit triggers instead of relying on debounce.
   */
  private async runFullDemo(): Promise<void> {
    const btn = document.getElementById("vai-btn-demo") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "⏳ Running Demo…";

    console.log("[UI] ═══ FULL DEMO START ═══");

    try {
      for (let i = 0; i < 4; i++) {
        console.log(`[UI] --- Demo round ${i + 1}/4 ---`);

        // 1. Ask question
        await this.askNextQuestion();
        await this.delay(1000);

        // 2. Simulate candidate response
        this.simulateResponse();
        await this.delay(500);

        // 3. Insert filler (force — guaranteed to show)
        await this.session.forceInsertFiller();
        await this.delay(500);

        // 4. Generate summary explicitly
        await this.triggerSummary();
        await this.delay(500);
      }

      console.log("[UI] ═══ FULL DEMO COMPLETE ═══");
    } finally {
      btn.disabled = false;
      btn.textContent = "🎬 Full Demo";
    }
  }

  private sendManualInput(): void {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = "";
    if (text.endsWith("?")) {
      this.session.askQuestion(text);
    } else {
      this.session.addResponse(text);
    }
  }

  private resetSession(): void {
    if (this.session.speechRecognition.isListening) {
      this.session.stopListening();
    }
    this.micBtn.textContent = "🎤 Start Mic";
    this.micBtn.classList.remove("vai-btn-recording");
    this.micStatusEl.style.display = "none";
    this.session.reset();
    this.demoIndex = 0;
    this.transcriptEl.innerHTML = '<div class="vai-empty">Conversation will appear here…</div>';
    this.summaryEl.innerHTML = '<div class="vai-empty">Summary will be generated as conversation progresses…</div>';
    this.fillerLogEl.innerHTML = '<div class="vai-empty">Smart fillers triggered on natural pauses…</div>';
    this.interimEl.textContent = "";
    this.perfMonitor.reset();
    this.updateMetrics();
  }

  // ═══════════════════════════════════════════════════════
  // RENDERERS: MIC
  // ═══════════════════════════════════════════════════════

  private renderInterim(text: string): void {
    if (text) {
      this.interimEl.textContent = text;
      this.interimEl.classList.add("vai-interim-active");
    } else {
      this.interimEl.textContent = "";
      this.interimEl.classList.remove("vai-interim-active");
    }
  }

  private renderVolume(volume: number): void {
    const pct = Math.round(volume * 100);
    this.volumeBar.style.width = `${pct}%`;
    if (volume > 0.6) {
      this.volumeBar.style.background = "var(--error)";
    } else if (volume > 0.15) {
      this.volumeBar.style.background = "var(--success)";
    } else {
      this.volumeBar.style.background = "var(--text-dim)";
    }
  }

  private handleRecognitionEvent(event: RecognitionEvent): void {
    const indicator = document.getElementById("vai-mic-indicator");
    const statusText = document.getElementById("vai-mic-status-text");
    if (!indicator || !statusText) return;

    switch (event.type) {
      case "start":
        indicator.style.color = "var(--success)";
        statusText.textContent = "Listening…";
        break;
      case "final":
        indicator.style.color = "var(--accent)";
        statusText.textContent = `✓ Captured (${((event.confidence ?? 0) * 100).toFixed(0)}%)`;
        setTimeout(() => {
          statusText.textContent = "Listening…";
          indicator.style.color = "var(--success)";
        }, 1500);
        break;
      case "silence":
        indicator.style.color = "var(--warning)";
        statusText.textContent = "Silence detected…";
        break;
      case "error":
        indicator.style.color = "var(--error)";
        statusText.textContent = event.transcript ?? "Error";
        break;
      case "end":
        indicator.style.color = "var(--text-dim)";
        statusText.textContent = "Stopped";
        break;
    }
  }

  private showMicError(message: string): void {
    this.micStatusEl.style.display = "flex";
    const statusText = document.getElementById("vai-mic-status-text");
    const indicator = document.getElementById("vai-mic-indicator");
    if (statusText) statusText.textContent = message;
    if (indicator) indicator.style.color = "var(--error)";
    setTimeout(() => {
      if (!this.session.speechRecognition.isListening) {
        this.micStatusEl.style.display = "none";
      }
    }, 5000);
  }

  // ═══════════════════════════════════════════════════════
  // RENDERERS: TRANSCRIPT
  // ═══════════════════════════════════════════════════════

  private renderTranscript(entries: readonly TranscriptEntry[]): void {
    if (entries.length === 0) {
      this.transcriptEl.innerHTML = '<div class="vai-empty">Conversation will appear here…</div>';
      return;
    }

    this.transcriptEl.innerHTML = entries
      .slice(-20)
      .map((e) => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        return `
          <div class="vai-entry vai-entry-${e.speaker}">
            <span class="vai-timestamp">${time}</span>
            <div class="vai-speaker">${e.speaker}</div>
            <div>${this.escapeHtml(e.text)}</div>
          </div>`;
      })
      .join("");

    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
  }

  // ═══════════════════════════════════════════════════════
  // RENDERERS: SUMMARY
  // ═══════════════════════════════════════════════════════

  private renderSummary(summary: SummaryResult): void {
    console.log(`[UI] Rendering summary: "${summary.text.slice(0, 60)}..."`);

    const confidenceClass =
      summary.confidence > 0.7 ? "high" : summary.confidence > 0.4 ? "medium" : "low";

    const tierLabel =
      summary.method === "abstractive"
        ? "Tier 2 · Abstractive"
        : "Tier 1 · Extractive";

    const keyPointsHtml = summary.keyPoints
      .map(
        (kp) => `
        <div class="vai-keypoint">
          <span class="vai-bullet">▸</span>
          <span>${this.escapeHtml(kp)}</span>
        </div>`
      )
      .join("");

    this.summaryEl.innerHTML = `
      ${keyPointsHtml}
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <span class="vai-confidence vai-confidence-${confidenceClass}">
          Confidence: ${(summary.confidence * 100).toFixed(0)}%
        </span>
        <span class="vai-confidence vai-confidence-high">
          ${tierLabel} • ${summary.latencyMs.toFixed(1)}ms
        </span>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════
  // RENDERERS: FILLERS
  // ═══════════════════════════════════════════════════════

  private renderFiller(filler: FillerPhrase): void {
    console.log(`[UI] Rendering filler: "${filler.text}" [${filler.contextTag}]`);

    const empty = this.fillerLogEl.querySelector(".vai-empty");
    if (empty) empty.remove();

    const entryEl = document.createElement("div");
    entryEl.className = "vai-filler-entry";
    const time = new Date().toLocaleTimeString();

    entryEl.innerHTML = `
      <div class="vai-filler-content">
        <span class="vai-filler-text">"${this.escapeHtml(filler.text)}"</span>
        <span class="vai-filler-time">${time}</span>
      </div>
      <div class="vai-filler-meta">
        <span class="vai-filler-intent">${filler.contextTag.replace(/_/g, " ")}</span>
        <span class="vai-filler-category">${filler.category}</span>
      </div>`;

    this.fillerLogEl.prepend(entryEl);

    while (this.fillerLogEl.children.length > 15) {
      this.fillerLogEl.removeChild(this.fillerLogEl.lastChild!);
    }
  }

  // ═══════════════════════════════════════════════════════
  // RENDERERS: PHASE + METRICS
  // ═══════════════════════════════════════════════════════

  private renderPhase(phase: InterviewPhase): void {
    const labels: Record<InterviewPhase, string> = {
      idle: "● Idle",
      greeting: "● Greeting",
      questioning: "● Asking Question",
      listening: "● Listening",
      summarizing: "● Summarizing",
      closing: "● Closing",
    };
    this.phaseEl.textContent = labels[phase] ?? `● ${phase}`;
    this.phaseEl.className = `vai-status ${
      phase === "idle" ? "vai-status-offline" : "vai-status-online"
    }`;
  }

  private updateMetrics(): void {
        const snapshot = this.perfMonitor.getSnapshot(this.session.modelManager.metrics);
    this.dashboard.update(snapshot);
  }

  // ═══════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════

  private onClick(id: string, handler: () => void): void {
    document.getElementById(id)?.addEventListener("click", handler);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async registerServiceWorker(): Promise<void> {
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        console.log("[App] Service Worker registered:", reg.scope);
      } catch (err) {
        console.warn("[App] Service Worker registration failed:", err);
      }
    }
  }
}