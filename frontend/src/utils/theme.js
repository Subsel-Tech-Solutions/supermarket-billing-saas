// src/utils/theme.js — turns shop Settings into CSS variables (theme, accent colour, sidebar, font size)
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

export const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return [191, 156, 90];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const toHex = (r, g, b) => "#" + [r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const luminance = ([r, g, b]) => {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

// The accent paints buttons, links and highlights on a light background. Pick something
// near-white (#ffffff was tried) and all of those become unreadable, so warn before saving.
export const isAccentTooLight = (hex) => luminance(hexToRgb(hex)) > 0.72;

export const resolveMode = (mode) => {
  if (mode === "system") return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return mode === "dark" ? "dark" : "light";
};

export const applyTheme = (s = {}) => {
  const root = document.documentElement;
  const mode = resolveMode(s.themeMode || "light");
  root.setAttribute("data-theme", mode);
  const rgb = hexToRgb(s.accentColor || "#bf9c5a");
  const dark = mode === "dark";
  const bg = dark ? [30, 27, 22] : [255, 253, 248];
  root.style.setProperty("--accent", toHex(...rgb));
  root.style.setProperty("--accent-rgb", rgb.join(", "));
  root.style.setProperty("--accent-dark", toHex(...(dark ? mix(rgb, [255, 255, 255], 0.25) : mix(rgb, [0, 0, 0], 0.22))));
  root.style.setProperty("--accent-light", toHex(...mix(rgb, bg, dark ? 0.78 : 0.82)));
  root.style.setProperty("--accent-contrast", luminance(rgb) > 0.55 ? "#1b1813" : "#ffffff");

  const style = s.sidebarStyle || "dark";
  const set = (k, v) => root.style.setProperty(k, v);
  if (style === "light") {
    set("--sidebar-bg", "var(--bg-card)");
    set("--sidebar-text", "var(--text-primary)");
    set("--sidebar-muted", "var(--text-muted)");
    set("--sidebar-border", "var(--border)");
    set("--sidebar-hover", "var(--bg-sunken)");
  } else if (style === "accent") {
    set("--sidebar-bg", toHex(...mix(rgb, [0, 0, 0], 0.55)));
    set("--sidebar-text", "#fbf7ef");
    set("--sidebar-muted", "rgba(255,255,255,0.55)");
    set("--sidebar-border", "rgba(255,255,255,0.08)");
    set("--sidebar-hover", "rgba(255,255,255,0.07)");
  } else {
    ["--sidebar-bg", "--sidebar-text", "--sidebar-muted", "--sidebar-border", "--sidebar-hover"].forEach((k) => root.style.removeProperty(k));
  }
  root.style.fontSize = `${(15 * clamp(Number(s.fontScale) || 100, 85, 120)) / 100}px`;
  root.classList.toggle("compact", !!s.compactMode);
  try {
    localStorage.setItem(
      "theme",
      JSON.stringify({ themeMode: s.themeMode, accentColor: s.accentColor, sidebarStyle: s.sidebarStyle, fontScale: s.fontScale, compactMode: s.compactMode }),
    );
  } catch {
    /* ignore */
  }
};

// Apply the last used theme instantly (before API responds) to avoid a flash
export const applyCachedTheme = () => {
  try {
    const cached = JSON.parse(localStorage.getItem("theme") || "null");
    if (cached) applyTheme(cached);
  } catch {
    /* ignore */
  }
};
