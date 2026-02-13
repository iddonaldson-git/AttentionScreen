import { invoke } from "@tauri-apps/api/core";

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;

async function greet() {
  if (greetMsgEl && greetInputEl) {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsgEl.textContent = await invoke("greet", {
      name: greetInputEl.value,
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });
});

// src/main.ts

type PCCEntry = { label: string; cssVar: string };

const PCC: Record<string, PCCEntry> = {
  turquose:      { label: "Turquoise",      cssVar: "--pcc-turquose" },
  navy:          { label: "Navy",           cssVar: "--pcc-navy" },
  purple:        { label: "Purple",         cssVar: "--pcc-purple" },
  "apple-green": { label: "Apple Green",    cssVar: "--pcc-apple-green" },
  "seafoam-green": { label: "Seafoam Green", cssVar: "--pcc-seafoam-green" },
  tan:           { label: "Tan",            cssVar: "--pcc-tan" },
  "light-tan":   { label: "Light Tan",      cssVar: "--pcc-light-tan" },
  "salmon-pink": { label: "Salmon Pink",    cssVar: "--pcc-salmon-pink" },
  "golden-yellow": { label: "Golden Yellow", cssVar: "--pcc-golden-yellow" },
  "bright-yellow": { label: "Bright Yellow", cssVar: "--pcc-bright-yellow" },
};

const BG_ALLOWED = Object.keys(PCC);
const TEXT_ALLOWED = Object.keys(PCC);

const toggleBtn = document.getElementById("themeToggle")!;
const panel = document.getElementById("themePanel")!;

toggleBtn.addEventListener("click", () => {
  panel.toggleAttribute("hidden");
});

document.addEventListener("click", (e) => {
  const target = e.target as Node;

  if (!panel.contains(target) && target !== toggleBtn) {
    panel.setAttribute("hidden", "");
  }
});

const root = document.documentElement;

function mustGetEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function fillSelect(select: HTMLSelectElement, allowedKeys: string[]) {
  select.innerHTML = "";
  for (const key of allowedKeys) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = PCC[key].label;
    select.appendChild(opt);
  }
}

function setThemeSlot(slotVar: string, tokenKey: string) {
  const paletteVar = PCC[tokenKey].cssVar;
  root.style.setProperty(slotVar, `var(${paletteVar})`);
}

function getResolvedSlotHex(slotVarName: string): string {
  const raw = getComputedStyle(root).getPropertyValue(slotVarName).trim();
  const varMatch = raw.match(/^var\((--[^)]+)\)$/);
  if (varMatch) {
    const paletteVar = varMatch[1];
    return getComputedStyle(root).getPropertyValue(paletteVar).trim();
  }
  return raw;
}

function updateUi() {
  const bgHex = getResolvedSlotHex("--app-bg");
  const textHex = getResolvedSlotHex("--app-text");
  // If you want, you can display these somewhere later.
  void bgHex;
  void textHex;
}

function initThemeControls() {
  const bgSelect = mustGetEl<HTMLSelectElement>("bgSelect");
  const textSelect = mustGetEl<HTMLSelectElement>("textSelect");
  const swapBtn = mustGetEl<HTMLButtonElement>("swapBtn");

  fillSelect(bgSelect, BG_ALLOWED);
  fillSelect(textSelect, TEXT_ALLOWED);

  bgSelect.value = "turquose";
  textSelect.value = "bright-yellow";

  setThemeSlot("--app-bg", bgSelect.value);
  setThemeSlot("--app-text", textSelect.value);
  updateUi();

  bgSelect.addEventListener("change", () => {
    setThemeSlot("--app-bg", bgSelect.value);
    updateUi();
  });

  textSelect.addEventListener("change", () => {
    setThemeSlot("--app-text", textSelect.value);
    updateUi();
  });

  swapBtn.addEventListener("click", () => {
    const oldBg = bgSelect.value;
    bgSelect.value = textSelect.value;
    textSelect.value = oldBg;
    setThemeSlot("--app-bg", bgSelect.value);
    setThemeSlot("--app-text", textSelect.value);
    updateUi();
  });
}

// Not strictly necessary since module scripts run after HTML parsing,
// but safe if you ever change loading behavior.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initThemeControls);
} else {
  initThemeControls();
}
