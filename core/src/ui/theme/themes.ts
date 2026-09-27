import type { ThemeMode, ThemeTokens } from "./types";
import { palette } from "./palette";

export const themes: Record<ThemeMode, ThemeTokens> = {
  dark: {
    motion: "normal",
    palette: {
      background: "transparent",
      foreground: "transparent",
      cursor: palette.orange[500],
      selectionBackground: palette.orange[900],
      selectionForeground: palette.gray[100],
    },
    color: {
      accent: palette.orange[500],
      text: {
        primary: palette.gray[100],
        secondary: palette.gray[200],
        muted: palette.gray[300],
        disabled: palette.gray[400],
      },
      status: {
        success: palette.green[500],
        warning: palette.yellow[500],
        danger: palette.red[500],
        info: palette.blue[500],
        disabled: palette.gray[300],
        special: palette.purple[500],
      },
      border: {
        default: palette.gray[500],
        subtle: palette.gray[600],
        focused: palette.orange[500],
        warning: palette.yellow[500],
        danger: palette.red[500],
      },
      surface: {
        base: "transparent",
        selected: palette.orange[900],
        focused: palette.orange[900],
        warning: palette.yellow[900],
        danger: palette.red[900],
      },
    },
  },
  light: {
    motion: "normal",
    palette: {
      background: "transparent",
      foreground: "transparent",
      cursor: palette.orange[700],
      selectionBackground: palette.orange[100],
      selectionForeground: palette.gray[950],
    },
    color: {
      accent: palette.orange[700],
      text: {
        primary: palette.gray[950],
        secondary: palette.gray[700],
        muted: palette.gray[600],
        disabled: palette.gray[500],
      },
      status: {
        success: palette.green[700],
        warning: palette.yellow[700],
        danger: palette.red[700],
        info: palette.blue[700],
        disabled: palette.gray[600],
        special: palette.purple[700],
      },
      border: {
        default: palette.gray[500],
        subtle: palette.gray[200],
        focused: palette.orange[700],
        warning: palette.yellow[700],
        danger: palette.red[700],
      },
      surface: {
        base: "transparent",
        selected: palette.orange[100],
        focused: palette.orange[100],
        warning: palette.yellow[100],
        danger: palette.red[100],
      },
    },
  },
};

export function themeForTerminal(
  mode: ThemeMode,
  foreground?: string,
): ThemeTokens {
  const theme = themes[mode];
  return foreground
    ? {
        ...theme,
        color: {
          ...theme.color,
          text: { ...theme.color.text, primary: foreground },
        },
      }
    : theme;
}
