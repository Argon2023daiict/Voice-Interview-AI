import type { PerformanceSnapshot } from "../metrics/perf-monitor";

/**
 * Renders the metrics dashboard panel with live-updating values.
 */
export class MetricsDashboard {
  private container: HTMLElement;
  private metricElements: Map<string, HTMLElement> = new Map();

  constructor(parent: HTMLElement) {
    this.container = document.createElement("div");
    this.container.className = "vai-card";
    this.container.innerHTML = `
      <h2><span class="vai-dot"></span> Performance Metrics</h2>
      <div class="vai-metrics-grid" id="vai-metrics-grid"></div>
    `;
    parent.appendChild(this.container);
    this.buildMetrics();
  }

  /** Update all displayed metrics */
  update(snapshot: PerformanceSnapshot): void {
    this.setMetric("load-time", `${snapshot.modelLoadTimeMs.toFixed(0)}ms`, snapshot.modelLoadTimeMs < 3000);
    this.setMetric("avg-inference", `${snapshot.avgInferenceMs.toFixed(1)}ms`, snapshot.avgInferenceMs < 50);
    this.setMetric("peak-inference", `${snapshot.peakInferenceMs.toFixed(1)}ms`, snapshot.peakInferenceMs < 50);
    this.setMetric("last-inference", `${snapshot.lastInferenceMs.toFixed(1)}ms`, snapshot.lastInferenceMs < 50);
    this.setMetric("p95-inference", `${snapshot.p95InferenceMs.toFixed(1)}ms`, snapshot.p95InferenceMs < 50);
    this.setMetric("total-inferences", `${snapshot.totalInferences}`, true);
    this.setMetric("model-size", `${snapshot.modelSizeMB.toFixed(1)}MB`, snapshot.modelSizeMB <= 30);
    this.setMetric("memory", `${snapshot.memoryUsageMB.toFixed(0)}MB`, snapshot.memoryUsageMB < 200);
    this.setMetric("status", snapshot.isOffline ? "Offline" : "Online", !snapshot.isOffline);
    this.setMetric("mic", snapshot.isMicActive ? "Active" : "Off", snapshot.isMicActive);
    this.setMetric(
      "recognition",
      snapshot.recognitionConfidence > 0
        ? `${(snapshot.recognitionConfidence * 100).toFixed(0)}%`
        : "—",
      snapshot.recognitionConfidence > 0.7
    );
  }

  private buildMetrics(): void {
    const grid = this.container.querySelector("#vai-metrics-grid")!;
    const metrics = [
      { id: "load-time", label: "Model Load" },
      { id: "avg-inference", label: "Avg Inference" },
      { id: "peak-inference", label: "Peak Inference" },
      { id: "last-inference", label: "Last Inference" },
      { id: "p95-inference", label: "P95 Inference" },
      { id: "total-inferences", label: "Total Inferences" },
      { id: "model-size", label: "Model Size" },
      { id: "memory", label: "Heap Memory" },
      { id: "status", label: "Network" },
      { id: "mic", label: "Microphone" },
      { id: "recognition", label: "Recognition" },
    ];

    for (const m of metrics) {
      const el = document.createElement("div");
      el.className = "vai-metric vai-metric-good";
      el.innerHTML = `
        <div class="vai-metric-value" data-metric="${m.id}">—</div>
        <div class="vai-metric-label">${m.label}</div>
      `;
      grid.appendChild(el);
      this.metricElements.set(m.id, el);
    }
  }

  private setMetric(id: string, value: string, isGood: boolean): void {
    const el = this.metricElements.get(id);
    if (!el) return;
    const valueEl = el.querySelector(".vai-metric-value") as HTMLElement;
    if (valueEl) valueEl.textContent = value;
    el.className = `vai-metric ${isGood ? "vai-metric-good" : "vai-metric-warn"}`;
  }
}