import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";

/* -----------------------------
   Types
------------------------------ */
type AppSettings = {
  bg: string;
  text: string;
  timerMode: "off" | "countdown";
  timerMin: number;
  timerSec: number;
};

/* -----------------------------
   Debug helper (optional)
------------------------------ */
function setDebug(msg: string) {
  const el = document.getElementById("debug");
  if (el) el.textContent = `debug: ${msg}`;
}

function formatTauriError(e: unknown): string {
  try {
    if (typeof e === "string") return e;
    if (e && typeof e === "object") {
      const anyE = e as any;
      return JSON.stringify(anyE, Object.getOwnPropertyNames(anyE));
    }
    return String(e);
  } catch {
    return String(e);
  }
}

/* -----------------------------
   Theme application (MAIN WINDOW)
   Assumes your CSS uses:
   body { background: var(--app-bg); color: var(--app-text); }
------------------------------ */
const root = document.documentElement;

function setThemeSlot(slotVar: string, value: string) {
  // Settings sends token keys (ex: "turquoise") OR hex.
  // If you're sending token keys, you'll convert them here.
  // Quick approach: treat them as CSS vars if you already have them defined.
  //
  // If settings sends "turquoise" and you have CSS variable --pcc-turquoise = #....,
  // then set --app-bg to var(--pcc-turquoise).
  //
  // If settings sends "#008EAA", just set it directly.

  if (value.startsWith("#")) {
    root.style.setProperty(slotVar, value);
  } else {
    // token key -> map to CSS var name
    root.style.setProperty(slotVar, `var(--pcc-${value})`);
  }
}

/* -----------------------------
   Settings: load + apply + listen
------------------------------ */
function readStoredSettings(): AppSettings {
  return {
    bg: localStorage.getItem("bg") ?? "turquoise",
    text: localStorage.getItem("text") ?? "navy",
    timerMode: (localStorage.getItem("timerMode") as AppSettings["timerMode"]) ?? "off",
    timerMin: Number(localStorage.getItem("timerMin") ?? "5"),
    timerSec: Number(localStorage.getItem("timerSec") ?? "0"),
  };
}

// Main window should NOT depend on having timer input elements anymore.
// We store duration in variables for the timer engine.
let configuredTimerMode: "off" | "countdown" = "off";
let configuredDurationMs = 0;

function applySettings(s: AppSettings) {
  setThemeSlot("--app-bg", s.bg);
  setThemeSlot("--app-text", s.text);

  const newMode = s.timerMode;
  const newDurationMs =
    Math.max(0, (s.timerMin * 60 + Math.min(59, Math.max(0, s.timerSec))) * 1000);

  const modeChanged = newMode !== configuredTimerMode;
  const durationChanged = newDurationMs !== configuredDurationMs;

  configuredTimerMode = newMode;
  configuredDurationMs = newDurationMs;

  setTimerMode(configuredTimerMode);

  // Only reset when timer settings changed (not theme)
  if (configuredTimerMode === "countdown" && (modeChanged || durationChanged)) {
    resetCountdown();
  }
}

/* -----------------------------
   Open Settings window
------------------------------ */
let settingsWin: WebviewWindow | null = null;

export async function openSettingsWindow() {
  setDebug("openSettingsWindow called");

  if (settingsWin) {
    try {
      await settingsWin.show();
      await settingsWin.setFocus();
      setDebug("settings window focused");
      return;
    } catch {
      // If it died, recreate
      settingsWin = null;
    }
  }

  const win = new WebviewWindow("settings", {
    url: "/settings.html",
    title: "Settings",
    width: 320,
    height: 340,
    resizable: true,
  });

  settingsWin = win;

  win.once("tauri://created", async () => {
    setDebug("settings window created");
    try {
      await win.show();
      await win.setFocus();
      setDebug("settings window shown + focused");
    } catch (e) {
      setDebug(`settings created but show/focus failed: ${formatTauriError(e)}`);
    }
  });

  win.once("tauri://error", (e) => {
    console.error("settings window error:", e);
    setDebug(`ERROR creating settings window: ${formatTauriError(e)}`);
    settingsWin = null;
  });

}






/* -----------------------------
   Optional Tauri greet example
------------------------------ */
let greetInputEl: HTMLInputElement | null = null;
let greetMsgEl: HTMLElement | null = null;

async function greet() {
  if (!greetMsgEl || !greetInputEl) return;
  greetMsgEl.textContent = await invoke<string>("greet", { name: greetInputEl.value });
}

function initGreetDemo() {
  greetInputEl = document.querySelector<HTMLInputElement>("#greet-input");
  greetMsgEl = document.querySelector<HTMLElement>("#greet-msg");
  const form = document.querySelector<HTMLFormElement>("#greet-form");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    void greet();
  });
}

/* -----------------------------
   Timer engine (MAIN WINDOW)
   Uses configuredDurationMs instead of reading inputs.
------------------------------ */
let timerInterval: number | null = null;
let remainingMs = 0;

// --- URGENT TIMER THRESHOLD (5 minutes) ---
const URGENT_MS = 5 * 60 * 1000;

function setUrgent(isUrgent: boolean) {
  const display = document.getElementById("timerDisplay");
  if (!display) return;
  display.classList.toggle("timer-urgent", isUrgent);
}

function syncUrgentClass() {
  setUrgent(
    configuredTimerMode === "countdown" &&
    remainingMs > 0 &&
    remainingMs <= URGENT_MS
  );
}

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function stopInterval() {
  if (timerInterval !== null) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
}

function setDisplay(text: string, show: boolean) {
  const display = document.getElementById("timerDisplay") as HTMLDivElement | null;
  const wrap = document.querySelector(".wrap");
  if (!display) return;
  display.textContent = text;
  display.toggleAttribute("hidden", !show);
  wrap?.classList.toggle("timer-visible", show);
}

function startCountdown() {
  if (configuredTimerMode !== "countdown") return;

  if (remainingMs <= 0) remainingMs = configuredDurationMs;
  if (remainingMs <= 0) return;

  setDisplay(formatMs(remainingMs), true);

  const lastTick = { t: Date.now() };
  stopInterval();
  timerInterval = window.setInterval(() => {
    const now = Date.now();
    const dt = now - lastTick.t;
    lastTick.t = now;

    remainingMs -= dt;

    if (remainingMs <= 0) {
      remainingMs = 0;
      setDisplay("00:00", true);
      stopInterval();
      setUrgent(false);   // clear urgent when finished
      return;
    }

    setDisplay(formatMs(remainingMs), true);
    syncUrgentClass();    // ⭐ HERE
  }, 100);
}

function pauseCountdown() {
  stopInterval();
  setDisplay(formatMs(remainingMs), remainingMs > 0);
  syncUrgentClass();
}

function resetCountdown() {
  stopInterval();
  remainingMs = configuredDurationMs;

  if (configuredTimerMode === "countdown" && remainingMs > 0) {
    setDisplay(formatMs(remainingMs), true);
  } else {
    setDisplay("00:00", false);
  }

  syncUrgentClass();
}

function setTimerMode(mode: "off" | "countdown") {
  const inputs = document.getElementById("timerInputs");
  if (inputs) inputs.toggleAttribute("hidden", mode !== "countdown");

  if (mode === "off") {
    stopInterval();
    remainingMs = 0;
    setDisplay("00:00", false);
    setUrgent(false);   // ⭐ add this
    return;
  }

  // countdown mode:
  // Do NOT reset here. Just ensure something reasonable is shown if idle.
  if (timerInterval === null) {
    // If we have no remaining time yet, initialize to configured duration.
    if (remainingMs <= 0) remainingMs = configuredDurationMs;

    if (remainingMs > 0) setDisplay(formatMs(remainingMs), true);
    else setDisplay("00:00", false);
  }
}


/* -----------------------------
   Bootstrap
------------------------------ */
window.addEventListener("DOMContentLoaded", async () => {
  setDebug("dom loaded");

  // Button to open settings
  document.getElementById("settingsBtn")?.addEventListener("click", () => {
    void openSettingsWindow();
  });

  // Cmd/Ctrl + , opens settings
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ",") {
      e.preventDefault();
      void openSettingsWindow();
    }
  });

  // Apply stored settings on startup
  applySettings(readStoredSettings());

  await listen("timer:start", () => startCountdown());
  await listen("timer:pause", () => pauseCountdown());
  await listen("timer:reset", () => resetCountdown());

  await listen("menu:open-settings", () => {
    void openSettingsWindow();
  });

  // Listen for live changes from Settings window
  await listen<AppSettings>("settings:changed", (event) => {
    setDebug("Settings Changed");
    applySettings(event.payload);
  });

//   await listen("debug:ping", (e) => {
//   console.log("MAIN: got debug:ping", e.payload);
//   setDebug("Got ping from settings");
// });

  // If you still want the greet demo
  initGreetDemo();

  // Optional: if you kept timer buttons in the main window, wire them:
  document.getElementById("timerStart")?.addEventListener("click", startCountdown);
  document.getElementById("timerPause")?.addEventListener("click", pauseCountdown);
  document.getElementById("timerReset")?.addEventListener("click", resetCountdown);


  // Open Settings on launch (next tick so main window is ready)
  setTimeout(() => {
    void openSettingsWindow();
  }, 0);
});
