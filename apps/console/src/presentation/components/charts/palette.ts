/**
 * Categorical series colours (WEB-9). Each is at least 3:1 against both chart surfaces (graphics, WCAG
 * 1.4.11); the same hues serve light and dark, with a lighter tint in dark mode. Series are also told
 * apart by marker shape and by the data table, never by colour alone.
 */
export const SURFACE = { light: "#ffffff", dark: "#161d26" } as const;

export const SERIES_COLORS = {
  light: ["#0b63c5", "#b4470a", "#0e7a5f", "#8a3fd1", "#b32d6a", "#5f6b7a"],
  dark: ["#5aa5ff", "#f08a4b", "#3fc9a2", "#c39bff", "#ff7fb0", "#a9b4c2"],
} as const;

export const MARKERS = ["circle", "square", "diamond", "triangle", "cross", "ring"] as const;
export type Marker = (typeof MARKERS)[number];
