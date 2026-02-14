// src/settings.ts
import { emit } from "@tauri-apps/api/event";

type AppSettings = {
  bg: string;
  text: string;
  timerMode: "off" | "countdown";
  timerMin: number;
  timerSec: number;
};

type PCCEntry = { label: string; cssVar: string };

const PCC: Record<string, PCCEntry> = {
  turquoise: { label: "PCC Turquoise", cssVar: "--pcc-turquoise" },
  navy: { label: "PCC Navy", cssVar: "--pcc-navy" },
  white: { label: "White", cssVar: "--pcc-white" },
  purple: { label: "Purple", cssVar: "--pcc-purple" },
  "apple-green": { label: "Apple Green", cssVar: "--pcc-apple-green" },
  "seafoam-green": { label: "Seafoam Green", cssVar: "--pcc-seafoam-green" },
  "dark-tan": { label: "Dark Tan", cssVar: "--pcc-tan" },
  "light-tan": { label: "Light Tan", cssVar: "--pcc-light-tan" },
  "salmon-pink": { label: "Salmon Pink", cssVar: "--pcc-salmon-pink" },
  "golden-yellow": { label: "Golden Yellow", cssVar: "--pcc-golden-yellow" },
  "bright-yellow": { label: "Bright Yellow", cssVar: "--pcc-bright-yellow" },
  black: { label: "Black", cssVar: "--pcc-black" },
};

const TEXT_ALLOWED_BY_BG: Record<string, string[]> = {
  "seafoam-green": ["navy", "purple", "black"],
  turquoise: ["navy", "white", "bright-yellow", "purple", "black"],
  navy: ["turquoise","white","salmon-pink","golden-yellow","bright-yellow","seafoam-green","apple-green","dark-tan","light-tan"],
  white: ["turquoise","navy","purple","dark-tan","black"],
  purple: ["turquoise","white","salmon-pink","golden-yellow","bright-yellow","seafoam-green","apple-green","dark-tan","light-tan"],
  "apple-green": ["navy","purple","black"],
  "dark-tan": ["navy","white","bright-yellow","purple","black"],
  "light-tan": ["navy","purple","black"],
  "salmon-pink": ["navy","purple","black"],
  "golden-yellow": ["turquoise","navy","purple","dark-tan","black"],
  "bright-yellow": ["navy","purple","black"],
  black: ["turquoise","white","salmon-pink","golden-yellow","bright-yellow","seafoam-green","apple-green","dark-tan","light-tan"],
};

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function fillSelect(select: HTMLSelectElement, keys: string[]) {
  select.innerHTML = "";
  for (const key of keys) {
    const entry = PCC[key];
    if (!entry) continue;
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = entry.label;
    select.appendChild(opt);
  }
}

function getAllowedTextKeys(bgKey: string): string[] {
  return TEXT_ALLOWED_BY_BG[bgKey] ?? Object.keys(PCC);
}

function readStoredSettings(): AppSettings {
  return {
    bg: localStorage.getItem("bg") ?? "turquoise",
    text: localStorage.getItem("text") ?? "navy",
    timerMode: (localStorage.getItem("timerMode") as AppSettings["timerMode"]) ?? "off",
    timerMin: Number(localStorage.getItem("timerMin") ?? "5"),
    timerSec: Number(localStorage.getItem("timerSec") ?? "0"),
  };
}

function writeStoredSettings(s: AppSettings) {
  localStorage.setItem("bg", s.bg);
  localStorage.setItem("text", s.text);
  localStorage.setItem("timerMode", s.timerMode);
  localStorage.setItem("timerMin", String(s.timerMin));
  localStorage.setItem("timerSec", String(s.timerSec));
}

window.addEventListener("DOMContentLoaded", () => {
  //const win = getCurrentWindow();

//   // Escape closes settings (nice safety net)
//   window.addEventListener("keydown", (e) => {
//     if (e.key === "Escape") {
//       void win.close();
//     }
//   });


  const bgSelect = must<HTMLSelectElement>("bgSelect");
  const textSelect = must<HTMLSelectElement>("textSelect");
  const swapBtn = must<HTMLButtonElement>("swapBtn");

  const timerMode = must<HTMLSelectElement>("timerMode");
  const timerInputs = must<HTMLDivElement>("timerInputs");
  const timerMin = must<HTMLInputElement>("timerMin");
  const timerSec = must<HTMLInputElement>("timerSec");

  const timerStart = must<HTMLButtonElement>("timerStart");
  const timerPause = must<HTMLButtonElement>("timerPause");
  const timerReset = must<HTMLButtonElement>("timerReset");

  // Populate BG list
  fillSelect(bgSelect, Object.keys(PCC));

  // Load stored settings
  const stored = readStoredSettings();
  bgSelect.value = stored.bg;

  const rebuildTextSelect = () => {
    const allowed = getAllowedTextKeys(bgSelect.value);
    const prev = textSelect.value || stored.text;
    fillSelect(textSelect, allowed);
    textSelect.value = allowed.includes(prev) ? prev : (allowed[0] ?? "navy");
  };

  rebuildTextSelect();
  if (getAllowedTextKeys(bgSelect.value).includes(stored.text)) {
    textSelect.value = stored.text;
  }

  timerMode.value = stored.timerMode;
  timerMin.value = String(clampInt(stored.timerMin, 0, 9999));
  timerSec.value = String(clampInt(stored.timerSec, 0, 59));
  timerInputs.toggleAttribute("hidden", timerMode.value !== "countdown");

  // Debounced + coalesced settings push (no await)
  let pendingTimer: number | null = null;
  let lastSent = "";

  function snapshotSettings(): AppSettings {
    const next: AppSettings = {
      bg: bgSelect.value,
      text: textSelect.value,
      timerMode: timerMode.value === "countdown" ? "countdown" : "off",
      timerMin: clampInt(Number(timerMin.value || 0), 0, 9999),
      timerSec: clampInt(Number(timerSec.value || 0), 0, 59),
    };

    // Normalize inputs (but keep it minimal)
    timerMin.value = String(next.timerMin);
    timerSec.value = String(next.timerSec);

    return next;
  }

  function pushNow() {
    const next = snapshotSettings();
    const key = JSON.stringify(next);
    if (key === lastSent) return;
    lastSent = key;

    writeStoredSettings(next);

    // Fire-and-forget emit so UI stays snappy (prevents close needing “second click”)
    emit("settings:changed", next).catch(console.error);
  }

  function queuePush(delayMs = 80) {
    if (pendingTimer !== null) window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null;
      pushNow();
    }, delayMs);
  }

  // Theme handlers
  bgSelect.addEventListener("change", () => {
    rebuildTextSelect();
    queuePush(0);
  });

  textSelect.addEventListener("change", () => queuePush(0));

  swapBtn.addEventListener("click", () => {
    const oldBg = bgSelect.value;
    const oldText = textSelect.value;

    bgSelect.value = oldText;
    rebuildTextSelect();

    const allowed = getAllowedTextKeys(bgSelect.value);
    textSelect.value = allowed.includes(oldBg) ? oldBg : (allowed[0] ?? oldText);

    queuePush(0);
  });

  // Timer handlers
  timerMode.addEventListener("change", () => {
    timerInputs.toggleAttribute("hidden", timerMode.value !== "countdown");
    queuePush(0);
  });

  // Debounced typing (important)
  timerMin.addEventListener("input", () => queuePush(150));
  timerSec.addEventListener("input", () => queuePush(150));

  // Timer controls -> main window
  timerStart.addEventListener("click", () => {
    pushNow();
    emit("timer:start").catch(console.error);
  });

  timerPause.addEventListener("click", () => {
    emit("timer:pause").catch(console.error);
  });

  timerReset.addEventListener("click", () => {
    pushNow();
    emit("timer:reset").catch(console.error);
  });

  // Initial sync
  pushNow();
});
