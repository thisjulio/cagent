import { createContext, useContext, type ReactNode } from "react";
import type { ThemeTokens } from "../theme/types";
import { themes } from "../theme/themes";
import type { TerminalPalette } from "../theme/terminal";

interface ThemeContextValue {
  tokens: ThemeTokens;
  terminalPalette: TerminalPalette | null;
}

const ThemeContext = createContext<ThemeContextValue>({
  tokens: themes.dark,
  terminalPalette: null,
});

export function ThemeProvider({
  value,
  terminalPalette = null,
  children,
}: {
  value: ThemeTokens;
  terminalPalette?: TerminalPalette | null;
  children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={{ tokens: value, terminalPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeTokens {
  return useContext(ThemeContext).tokens;
}

export function useTerminalPalette(): TerminalPalette | null {
  return useContext(ThemeContext).terminalPalette;
}

export function useTerminalColors() {
  return useContext(ThemeContext).tokens.palette;
}
