import { App } from "./ui/app";

/**
 * Application entry point.
 * Bootstraps the Voice Interview AI with error boundary.
 */
async function main(): Promise<void> {
  const app = new App("#app");

  try {
    await app.start();
    console.log(
      "%c Voice Interview AI Ready ",
      "background: #6c63ff; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold;"
    );
  } catch (error) {
    console.error("Fatal initialization error:", error);
    const root = document.getElementById("app");
    if (root) {
      root.innerHTML = `
        <div style="padding:40px; text-align:center; color:#e74c5d;">
          <h1>⚠️ Initialization Failed</h1>
          <p style="margin-top:12px; color:#8b8fa3;">
            ${error instanceof Error ? error.message : "Unknown error occurred."}
          </p>
          <button onclick="location.reload()" style="
            margin-top:20px; padding:10px 24px; background:#6c63ff; color:white;
            border:none; border-radius:8px; cursor:pointer; font-size:0.9rem;
          ">Reload</button>
        </div>
      `;
    }
  }
}

// Boot when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}