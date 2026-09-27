export type ThemeMode = "dark" | "light";
export type ResponsiveSize = "compact" | "standard" | "wide";
export type MotionPreference = "normal" | "reduced";
export type StatusLevel =
  | "neutral"
  | "informational"
  | "attention"
  | "critical";

export interface ThemePalette {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  selectionForeground: string;
}

export interface ThemeTokens {
  palette: ThemePalette;
  motion: MotionPreference;
  color: {
    accent: string;
    text: {
      primary: string;
      secondary: string;
      muted: string;
      disabled: string;
    };
    status: {
      success: string;
      warning: string;
      danger: string;
      info: string;
      disabled: string;
      special: string;
    };
    border: {
      default: string;
      subtle: string;
      focused: string;
      warning: string;
      danger: string;
    };
    surface: {
      base: string;
      selected: string;
      focused: string;
      warning: string;
      danger: string;
    };
  };
}
