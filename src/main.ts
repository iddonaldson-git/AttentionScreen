import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";

/* -----------------------------
   Types
------------------------------ */
type AppSettings = {
  bg: string;
  titleText: string;
  text: string;
  subtitleText: string;
  subtitleColor: string;
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

function setMode(mode: "blank" | "message") {
  document.body.classList.remove("mode-blank", "mode-message", "mode-flash");
  document.body.classList.add(mode === "blank" ? "mode-blank" : "mode-message");
}

function flash() {
  document.body.classList.add("mode-flash");
  setTimeout(() => document.body.classList.remove("mode-flash"), 1800);
}

listen("attention:setMode", (e) => setMode(e.payload as any));
listen("attention:flash", () => flash());

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

function setTextContent(title: string, subtitle: string) {
  // Optional: force uppercase, if you want the "attention screen" vibe
  // title = title.toUpperCase();
  // subtitle = subtitle.toUpperCase();

  const titleEl =
    (document.getElementById("titleDisplay") as HTMLElement | null) ??
    (document.getElementById("mainText") as HTMLElement | null);

  const subtitleEl = document.getElementById("subtitleDisplay") as HTMLElement | null;

  if (titleEl) titleEl.textContent = title;

  if (subtitleEl) {
    subtitleEl.textContent = subtitle;
    subtitleEl.toggleAttribute("hidden", subtitle.trim().length === 0);
  }
}

/* -----------------------------
   Settings: load + apply + listen
------------------------------ */
function readStoredSettings(): AppSettings {
  return {
    bg: localStorage.getItem("bg") ?? "turquoise",
    subtitleColor: localStorage.getItem("subtitleColor") ?? "navy",
    text: localStorage.getItem("text") ?? "navy",
    titleText: localStorage.getItem("titleText") ?? "ATTENTION",
    subtitleText: localStorage.getItem("subtitleText") ?? "CHECK YOUR ZOOM CHAT",
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
  setThemeSlot("--subtitle-color", s.subtitleColor);

  setTextContent(s.titleText, s.subtitleText);

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
    title: "",
    width: 320,
    height: 540,
    resizable: true,
    titleBarStyle: "overlay"
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

  // Optional: if you kept timer buttons in the main window, wire them:
  document.getElementById("timerStart")?.addEventListener("click", startCountdown);
  document.getElementById("timerPause")?.addEventListener("click", pauseCountdown);
  document.getElementById("timerReset")?.addEventListener("click", resetCountdown);


  // Open Settings on launch (next tick so main window is ready)
  setTimeout(() => {
    void openSettingsWindow();
  }, 0);
});
