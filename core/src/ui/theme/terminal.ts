import type { CliRenderer, ThemeMode } from "@opentui/core";

export type TerminalPalette = Awaited<ReturnType<CliRenderer["getPalette"]>>;

export function subscribeThemeMode(
  renderer: CliRenderer,
  onChange: (mode: ThemeMode) => void,
  onPaletteChange?: (palette: TerminalPalette) => void,
): () => void {
  const update = (mode: ThemeMode) => onChange(mode);
  const updatePalette = (palette: TerminalPalette) =>
    onPaletteChange?.(palette);
  renderer.on("theme_mode", update);
  renderer.on("palette", updatePalette);
  if (renderer.themeMode) update(renderer.themeMode);
  void renderer
    .getPalette()
    .then(updatePalette)
    .catch(() => {});
  return () => {
    renderer.off("theme_mode", update);
    renderer.off("palette", updatePalette);
  };
}
