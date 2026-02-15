// src/settings.ts
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

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

type PCCEntry = { label: string; cssVar: string };

const PCC: Record<string, PCCEntry> = {
  turquoise: { label: "PCC Turquoise", cssVar: "--pcc-turquoise" },
  navy: { label: "PCC Navy", cssVar: "--pcc-navy" },
  white: { label: "White", cssVar: "--pcc-white" },
  purple: { label: "Purple", cssVar: "--pcc-purple" },
  "apple-green": { label: "Apple Green", cssVar: "--pcc-apple-green" },
  "seafoam-green": { label: "Seafoam Green", cssVar: "--pcc-seafoam-green" },
  "dark-tan": { label: "Dark Tan", cssVar: "--pcc-dark-tan" },
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

  // 👇 tell the custom select to rebuild its menu + label
  select.dispatchEvent(new Event("options:changed", { bubbles: false }));
}

function getAllowedTextKeys(bgKey: string): string[] {
  return TEXT_ALLOWED_BY_BG[bgKey] ?? Object.keys(PCC);
}

function readStoredSettings(): AppSettings {
  return {
    bg: localStorage.getItem("bg") ?? "turquoise",
    titleText: localStorage.getItem("titleText") ?? "ATTENTION",
    text: localStorage.getItem("text") ?? "navy",
    subtitleText: localStorage.getItem("subtitleText") ?? "CHECK YOUR ZOOM CHAT",
    subtitleColor: localStorage.getItem("subtitleColor") ?? "white",
    timerMode: (localStorage.getItem("timerMode") as AppSettings["timerMode"]) ?? "off",
    timerMin: Number(localStorage.getItem("timerMin") ?? "5"),
    timerSec: Number(localStorage.getItem("timerSec") ?? "0"),
  };
}

function writeStoredSettings(s: AppSettings) {
  localStorage.setItem("bg", s.bg);
  localStorage.setItem("text", s.text);
  localStorage.setItem("titleText", s.titleText);
  localStorage.setItem("subtitleText", s.subtitleText);
  localStorage.setItem("subtitleColor", s.subtitleColor);
  localStorage.setItem("timerMode", s.timerMode);
  localStorage.setItem("timerMin", String(s.timerMin));
  localStorage.setItem("timerSec", String(s.timerSec));
}



const wrap = document.querySelector(".settings-wrap");

if (wrap) {
  const observer = new ResizeObserver(() => autoResizeWindow());
  observer.observe(wrap);
}

async function autoResizeWindow() {
  const wrap = document.querySelector(".settings-wrap") as HTMLElement | null;
  if (!wrap) return;

  // Force layout flush
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  wrap.offsetHeight;

  // Actual rendered content height in CSS px
  const contentHeight = Math.ceil(wrap.getBoundingClientRect().height - 30);

  // Dynamically estimate chrome/titlebar overhead (CSS px)
  const chrome = Math.max(0, window.outerHeight - window.innerHeight);

  const CUSHION = 14;     // Small cushion for shadows + rounding
  const BOTTOM_PAD = 20;  // 👈 breathing room at bottom

  const MIN_H = 320;
  const MAX_H = 990;

  // Desired total window height in logical (CSS) px
  const desiredHeight = contentHeight + chrome + CUSHION + BOTTOM_PAD;
  const targetHeight = Math.max(MIN_H, Math.min(MAX_H, desiredHeight));

  try {
    const win = getCurrentWindow();
    const physical = await win.innerSize();
    const scale = await win.scaleFactor();

    const logicalWidth = physical.width / scale;
    const currentLogicalHeight = physical.height / scale;

    // Avoid resize jitter
    if (Math.abs(currentLogicalHeight - targetHeight) < 2) return;

    await win.setSize(new LogicalSize(logicalWidth, targetHeight));
  } catch (e) {
    console.error("Resize failed:", e);
  }
}

window.addEventListener("DOMContentLoaded", () => {
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

  const titleInput = must<HTMLInputElement>("titleInput");
  const subtitleInput = must<HTMLInputElement>("subtitleInput");
  const subtitleColor = must<HTMLSelectElement>("subtitleColor");

  const subtitleSelect = document.getElementById("subtitleSelect") as HTMLSelectElement | null;
  const clearSubtitle = document.getElementById("clearSubtitle") as HTMLButtonElement | null;

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

  const rebuildSubtitleSelect = () => {
    const allowed = getAllowedTextKeys(bgSelect.value);
    fillSelect(subtitleColor, allowed);
  };
  rebuildSubtitleSelect();
  if (getAllowedTextKeys(bgSelect.value).includes(stored.text)) {
    textSelect.value = stored.text;
  }
  

  timerMode.value = stored.timerMode;
  timerMin.value = String(clampInt(stored.timerMin, 0, 9999));
  timerSec.value = String(clampInt(stored.timerSec, 0, 59));
  timerInputs.toggleAttribute("hidden", timerMode.value !== "countdown");

  titleInput.value = stored.titleText;
  subtitleInput.value = stored.subtitleText;
  subtitleColor.value = stored.subtitleColor;

  enhanceAllThemeSelects();

  syncQuickButtons(subtitleInput.value);

  // Debounced + coalesced settings push
  let pendingTimer: number | null = null;
  let lastSent = "";

  function snapshotSettings(): AppSettings {
    const next: AppSettings = {
      bg: bgSelect.value,
      titleText: titleInput.value,
      text: textSelect.value,
      subtitleText: subtitleInput.value,
      subtitleColor: subtitleColor.value,
      timerMode: timerMode.value === "countdown" ? "countdown" : "off",
      timerMin: clampInt(Number(timerMin.value || 0), 0, 9999),
      timerSec: clampInt(Number(timerSec.value || 0), 0, 59),
    };

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
    const prevText = textSelect.value;
    const prevSubColor = subtitleColor.value;
  
    rebuildTextSelect();
    rebuildSubtitleSelect();
  
    // If rebuild forced a new value, notify listeners + custom selects
    if (textSelect.value !== prevText) {
      textSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (subtitleColor.value !== prevSubColor) {
      subtitleColor.dispatchEvent(new Event("change", { bubbles: true }));
    }
  
    queuePush(0);
    void autoResizeWindow();
  });

  textSelect.addEventListener("change", () => {
    queuePush(0);
    void autoResizeWindow();
  });

  subtitleColor.addEventListener("change", () => {
    queuePush(0)
    void autoResizeWindow();
  });

  swapBtn.addEventListener("click", () => {
    const oldBg = bgSelect.value;
    const oldText = textSelect.value;
    const oldSubtitleColor = subtitleColor.value;

    bgSelect.value = oldText;
    rebuildTextSelect();
    rebuildSubtitleSelect();

    const allowed = getAllowedTextKeys(bgSelect.value);
    textSelect.value = allowed.includes(oldBg) ? oldBg : (allowed[0] ?? oldText);
    subtitleColor.value = allowed.includes(oldBg) ? oldBg : (allowed[0] ?? oldSubtitleColor);

    bgSelect.dispatchEvent(new Event("change", { bubbles: true }));
    textSelect.dispatchEvent(new Event("change", { bubbles: true }));
    subtitleColor.dispatchEvent(new Event("change", { bubbles: true }));

    queuePush(0);
    void autoResizeWindow();
  });

  // Timer handlers
  timerMode.addEventListener("change", () => {
    timerInputs.toggleAttribute("hidden", timerMode.value !== "countdown");
    queuePush(0);
    void autoResizeWindow();
  });

  timerMin.addEventListener("input", () => {
    queuePush(150);
    void autoResizeWindow();
  });

  timerSec.addEventListener("input", () => {
    queuePush(150);
    void autoResizeWindow();
  });

  // Title/Sub handlers
  titleInput.addEventListener("input", () => {
    queuePush(150);
    void autoResizeWindow();
  });

  subtitleInput.addEventListener("input", () => {
    queuePush(150);
    void autoResizeWindow();
  });

 
  function syncQuickButtons(current: string) {
    document.querySelectorAll<HTMLButtonElement>(".quick-btn").forEach((b) => {
      const val = b.dataset.sub ?? "";
      b.classList.toggle("active", val === current && current.length > 0);
    });
  }
  
  document.querySelectorAll<HTMLButtonElement>(".quick-btn").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      // Prevent focus flicker on macOS WebKit (the “glitch”)
      e.preventDefault();
    });
  
    btn.addEventListener("click", () => {
      const val = btn.dataset.sub ?? "";
  
      // toggle behavior
      subtitleInput.value = (subtitleInput.value === val) ? "" : val;
  
      // update UI immediately (no debounce delay)
      syncQuickButtons(subtitleInput.value);
  
      // push immediately so main window updates instantly
      queuePush(0);
    });
  });

  if (subtitleSelect) {
    subtitleSelect.addEventListener("change", () => {
      if (!subtitleSelect.value) return;
      subtitleInput.value = subtitleSelect.value;
      subtitleInput.focus();
      subtitleSelect.value = "";
      queuePush(0);
      void autoResizeWindow();
    });
  }

  if (clearSubtitle) {
    clearSubtitle.addEventListener("click", () => {
      subtitleInput.value = "";
      subtitleInput.focus();
      queuePush(0);
      void autoResizeWindow();
    });
  }

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

  initCollapsibles();


   // After initial UI is fully built and values set
   void autoResizeWindow();
   setTimeout(() => void autoResizeWindow(), 50);
   setTimeout(() => void autoResizeWindow(), 250);
 
   // Resize on layout changes
   const wrap = document.querySelector(".settings-wrap");
   if (wrap) {
     const ro = new ResizeObserver(() => void autoResizeWindow());
     ro.observe(wrap);
   }


  const btnShow = document.getElementById("btnShow") as HTMLSelectElement;
  const btnBlank = document.getElementById("btnBlank") as HTMLButtonElement;
  const btnFlash = document.getElementById("btnFlash") as HTMLButtonElement;

  const pill = document.querySelector(".ops-pill");
const status = document.getElementById("opsStatus");

function setOpsState(state: "live" | "blank" | "flash") {
  pill?.classList.remove("is-live", "is-blank", "is-flash");
  pill?.classList.add(state === "live" ? "is-live" : state === "blank" ? "is-blank" : "is-flash");
  if (status) status.textContent = state === "live" ? "Live" : state === "blank" ? "Blank" : "Flash";
}

  btnShow.onclick = () => {
    emit("attention:setMode", "message");
    setOpsState("live")
  };

  btnBlank.onclick = () => {
    emit("attention:setMode", "blank");
    setOpsState("blank")
  };

  btnFlash.onclick = () => {
    emit("attention:flash");
    setOpsState("flash");
    btnFlash.disabled = true;
    window.setTimeout(() => {
      setOpsState("live") 
      btnFlash.disabled = false;
    }, 1500);
  };
  //  btnShow.onclick = () => {
  //   emit("attention:setMode", "message");
  // };
  
  // btnHide.onclick = () => {
  //   emit("attention:setMode", "blank");
  // };
  
  // btnFlash.onclick = () => {
  //   emit("attention:flash");
  // };
});


function initCollapsibles() {
  document.querySelectorAll<HTMLElement>(".collapsible-card").forEach((card) => {
    const key = card.dataset.section || "section";
    const header = card.querySelector<HTMLButtonElement>(".card-header");
    const body = card.querySelector<HTMLElement>(".card-body");
    if (!header || !body) return;

    // restore saved state
    const saved = localStorage.getItem(`ui:collapsed:${key}`);
    const startCollapsed = saved === "1";
    if (startCollapsed) {
      card.classList.add("is-collapsed");
      header.setAttribute("aria-expanded", "false");
      body.style.height = "0px";
    } else {
      header.setAttribute("aria-expanded", "true");
      body.style.height = "auto";
    }

    const setCollapsed = (collapsed: boolean) => {
      localStorage.setItem(`ui:collapsed:${key}`, collapsed ? "1" : "0");
      card.classList.toggle("is-collapsed", collapsed);
      header.setAttribute("aria-expanded", collapsed ? "false" : "true");

      // animate height
      const startH = body.getBoundingClientRect().height;

      if (collapsed) {
        // from current height -> 0
        body.style.height = `${startH}px`;
        requestAnimationFrame(() => {
          body.style.height = "0px";
          // let autoResizeWindow catch up after animation
          setTimeout(() => void autoResizeWindow(), 200);
        });
      } else {
        // from 0 -> scrollHeight
        body.style.height = `${startH}px`;
        const endH = body.scrollHeight;

        requestAnimationFrame(() => {
          body.style.height = `${endH}px`;
        });

        // after animation, return to auto so internal changes (like timerInputs) work
        setTimeout(() => {
          body.style.height = "auto";
          void autoResizeWindow();
        }, 200);
      }
    };

    header.addEventListener("click", () => {
      const collapsed = card.classList.contains("is-collapsed");
      setCollapsed(!collapsed);
    });
  });
}



function enhanceSelect(select: HTMLSelectElement) {
  if ((select as any)._enhanced) return;
  (select as any)._enhanced = true;

  const root = document.createElement("div");
  root.className = "cselect";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cselect-btn";

  // PORTAL menu (in body)
  const portal = document.createElement("div");
  portal.className = "cselect-portal";
  portal.style.display = "none";
  portal.setAttribute("role", "listbox");

  function renderLabel() {
    const opt = select.selectedOptions[0];
    btn.textContent = opt ? (opt.textContent ?? "") : "";
  }

  function rebuildOptions() {
    portal.innerHTML = "";
    Array.from(select.options).forEach((o) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "cselect-option";
      item.setAttribute("role", "option");
      item.textContent = o.textContent ?? "";
      item.dataset.value = o.value;
      item.setAttribute("aria-selected", select.value === o.value ? "true" : "false");

      item.addEventListener("click", () => {
        select.value = o.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        rebuildOptions();
        renderLabel();
        close();
        btn.focus();
      });

      portal.appendChild(item);
    });
  }

  function positionPortal() {
    const r = btn.getBoundingClientRect();
    const gap = 6;

    // Default below button
    let top = r.bottom + gap;
    let left = r.left;
    let width = r.width;

    portal.style.left = `${left}px`;
    portal.style.width = `${width}px`;

    // Measure height after display
    portal.style.display = "block";
    const ph = portal.getBoundingClientRect().height;

    // If it would overflow bottom, flip above
    if (top + ph > window.innerHeight - 8) {
      top = Math.max(8, r.top - gap - ph);
    }

    portal.style.top = `${top}px`;
  }

  function open() {
    rebuildOptions();
    positionPortal();

    // Scroll selected into view
    const selected = portal.querySelector('[aria-selected="true"]') as HTMLElement | null;
    selected?.scrollIntoView({ block: "nearest" });
  }

  function close() {
    portal.style.display = "none";
  }

  // Toggle
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (portal.style.display === "block") close();
    else open();
  });

  // Close on outside click
  document.addEventListener("click", () => close());

  // Close on scroll/resize (important in your scroll container)
  window.addEventListener("resize", () => close(), { passive: true });
  window.addEventListener("scroll", () => close(), { passive: true });

  // ALSO close when your inner scroller scrolls
  const scroller = document.querySelector(".settings-scroll");
  scroller?.addEventListener("scroll", () => close(), { passive: true });

  function syncAll() {
    rebuildOptions();
    renderLabel();
  }

  // Keep synced (user or programmatic value changes)
  select.addEventListener("change", syncAll);

  // When fillSelect() rebuilds the <option>s
  select.addEventListener("options:changed", syncAll);

  // Insert UI
  const parent = select.parentElement!;
  parent.insertBefore(root, select);
  root.appendChild(btn);
  root.appendChild(select); // keep original select hidden via CSS

  // Append portal once
  document.body.appendChild(portal);

  renderLabel();
  rebuildOptions();
}
function enhanceAllThemeSelects() {
  const selects = document.querySelectorAll("select.theme-select");
  selects.forEach((s) => enhanceSelect(s as HTMLSelectElement));
}



