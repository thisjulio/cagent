import { themes } from "./themes";
import type { ThemeMode, ThemeTokens } from "./types";

export function getTheme(mode: ThemeMode = "dark"): ThemeTokens {
  return themes[mode];
}
