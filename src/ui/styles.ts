/**
 * Scoped CSS styles injected at runtime.
 * Avoids external CSS files for full self-contained deployment.
 */
export function injectStyles(): void {
  if (document.getElementById("voice-ai-styles")) return;

  const style = document.createElement("style");
  style.id = "voice-ai-styles";
  style.textContent = `
    /* ─── Layout ─────────────────────────────────────────── */
    .vai-header {
      text-align: center;
      padding: 24px 0 16px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .vai-header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent), var(--success));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .vai-header .vai-subtitle {
      color: var(--text-dim);
      font-size: 0.875rem;
      margin-top: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .vai-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    @media (max-width: 768px) {
      .vai-grid { grid-template-columns: 1fr; }
    }

    /* ─── Cards ─────────────────────────────────────────── */
    .vai-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      transition: border-color 0.2s;
    }
    .vai-card:hover {
      border-color: var(--accent);
    }
    .vai-card h2 {
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .vai-card h2 .vai-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      display: inline-block;
      animation: vai-pulse 2s infinite;
    }

    /* ─── Transcript ────────────────────────────────────── */
    .vai-transcript {
      max-height: 300px;
      overflow-y: auto;
      font-size: 0.875rem;
      line-height: 1.7;
    }
    .vai-transcript::-webkit-scrollbar {
      width: 6px;
    }
    .vai-transcript::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 3px;
    }
    .vai-entry {
      padding: 8px 12px;
      border-radius: 8px;
      margin-bottom: 8px;
      animation: vai-fadeIn 0.3s ease;
    }
    .vai-entry-interviewer {
      background: var(--accent-glow);
      border-left: 3px solid var(--accent);
    }
    .vai-entry-candidate {
      background: rgba(45, 212, 168, 0.08);
      border-left: 3px solid var(--success);
    }
    .vai-speaker {
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 2px;
    }
    .vai-entry-interviewer .vai-speaker { color: var(--accent); }
    .vai-entry-candidate .vai-speaker { color: var(--success); }
    .vai-timestamp {
      font-size: 0.7rem;
      color: var(--text-dim);
      float: right;
    }

    /* ─── Summary ───────────────────────────────────────── */
    .vai-summary {
      font-size: 0.9rem;
      line-height: 1.8;
      color: var(--text);
    }
    .vai-summary .vai-keypoint {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
    }
    .vai-summary .vai-keypoint:last-child {
      border-bottom: none;
    }
    .vai-summary .vai-bullet {
      color: var(--accent);
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .vai-confidence {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.7rem;
      font-weight: 600;
      margin-top: 8px;
    }
    .vai-confidence-high { background: rgba(45,212,168,0.15); color: var(--success); }
    .vai-confidence-medium { background: rgba(245,166,35,0.15); color: var(--warning); }
    .vai-confidence-low { background: rgba(231,76,93,0.15); color: var(--error); }

    /* ─── Metrics Dashboard ─────────────────────────────── */
    .vai-metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }
    .vai-metric {
      background: var(--surface2);
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }
    .vai-metric-value {
      font-size: 1.5rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .vai-metric-label {
      font-size: 0.7rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 4px;
    }
    .vai-metric-good .vai-metric-value { color: var(--success); }
    .vai-metric-warn .vai-metric-value { color: var(--warning); }
    .vai-metric-bad .vai-metric-value { color: var(--error); }

    /* ─── Filler Log ────────────────────────────────────── */
    .vai-filler-log {
      max-height: 250px;
      overflow-y: auto;
      font-size: 0.8rem;
    }
    .vai-filler-log::-webkit-scrollbar {
      width: 6px;
    }
    .vai-filler-log::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 3px;
    }
    .vai-filler-entry {
      padding: 8px 10px;
      background: var(--surface2);
      border-radius: 6px;
      margin-bottom: 6px;
      animation: vai-fadeIn 0.3s ease;
      border-left: 3px solid var(--accent);
    }
    .vai-filler-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      width: 100%;
      margin-bottom: 4px;
    }
    .vai-filler-text {
      font-style: italic;
      color: var(--text);
      flex: 1;
      font-size: 0.85rem;
    }
    .vai-filler-time {
      font-size: 0.6rem;
      color: var(--text-dim);
      white-space: nowrap;
    }
    .vai-filler-meta {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
    .vai-filler-intent {
      font-size: 0.6rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(45, 212, 168, 0.12);
      color: var(--success);
      letter-spacing: 0.03em;
    }
    .vai-filler-category {
      font-size: 0.6rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--accent-glow);
      color: var(--accent);
      letter-spacing: 0.03em;
    }

    /* ─── Controls ──────────────────────────────────────── */
    .vai-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 20px;
    }
    .vai-btn {
      padding: 10px 20px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      color: var(--text);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .vai-btn:hover {
      background: var(--surface2);
      border-color: var(--accent);
    }
    .vai-btn:active {
      transform: scale(0.97);
    }
    .vai-btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .vai-btn-primary:hover {
      background: #5b54e6;
    }
    .vai-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ─── Input ─────────────────────────────────────────── */
    .vai-input-row {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .vai-input {
      flex: 1;
      padding: 10px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 0.9rem;
      font-family: var(--font);
      outline: none;
      transition: border-color 0.15s;
    }
    .vai-input:focus {
      border-color: var(--accent);
    }
    .vai-input::placeholder {
      color: var(--text-dim);
    }

    /* ─── Status Badge ──────────────────────────────────── */
    .vai-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .vai-status-online {
      background: rgba(45,212,168,0.12);
      color: var(--success);
    }
    .vai-status-offline {
      background: rgba(245,166,35,0.12);
      color: var(--warning);
    }

    /* ─── Empty States ──────────────────────────────────── */
    .vai-empty {
      color: var(--text-dim);
      font-size: 0.85rem;
      text-align: center;
      padding: 24px;
      font-style: italic;
    }

    /* ─── Mic Bar ───────────────────────────────────────── */
    .vai-mic-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 16px;
      flex-wrap: wrap;
      animation: vai-fadeIn 0.3s ease;
    }
    .vai-mic-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      font-weight: 500;
      min-width: 180px;
    }
    .vai-mic-indicator {
      font-size: 1.2rem;
      color: var(--success);
      animation: vai-pulse 1s infinite;
    }

    /* ─── Volume Meter ──────────────────────────────────── */
    .vai-volume-container {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 140px;
    }
    .vai-volume-label {
      font-size: 0.7rem;
      color: var(--text-dim);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .vai-volume-track {
      flex: 1;
      height: 6px;
      background: var(--surface2);
      border-radius: 3px;
      overflow: hidden;
      min-width: 80px;
    }
    .vai-volume-fill {
      height: 100%;
      width: 0%;
      background: var(--success);
      border-radius: 3px;
      transition: width 0.1s ease, background 0.2s ease;
    }

    /* ─── Interim Transcript ────────────────────────────── */
    .vai-interim {
      flex: 1;
      min-width: 200px;
      font-size: 0.85rem;
      color: var(--text-dim);
      font-style: italic;
      padding: 4px 8px;
      border-left: 2px solid transparent;
      transition: border-color 0.2s, color 0.2s;
      min-height: 24px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .vai-interim-active {
      border-left-color: var(--accent);
      color: var(--text);
    }

    /* ─── Recording Button State ────────────────────────── */
    .vai-btn-mic {
      position: relative;
    }
    .vai-btn-recording {
      background: rgba(231, 76, 93, 0.15) !important;
      border-color: var(--error) !important;
      color: var(--error) !important;
      animation: vai-recording-pulse 1.5s infinite;
    }
    @keyframes vai-recording-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(231,76,93,0.3); }
      50% { box-shadow: 0 0 0 8px rgba(231,76,93,0); }
    }

    /* ─── Mic Permission Banner ─────────────────────────── */
    .vai-mic-permission {
      background: rgba(245,166,35,0.1);
      border: 1px solid var(--warning);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin-bottom: 16px;
      font-size: 0.85rem;
      color: var(--warning);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* ─── Tier Badge ────────────────────────────────────── */
    .vai-tier-badge {
      font-size: 0.6rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 10px;
      background: rgba(108, 99, 255, 0.12);
      color: var(--accent);
      margin-left: auto;
      letter-spacing: 0.04em;
    }
    .vai-tier-2 {
      background: rgba(45, 212, 168, 0.12);
      color: var(--success);
    }

    /* ─── Animations ────────────────────────────────────── */
    @keyframes vai-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    @keyframes vai-fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}