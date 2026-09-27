import { SyntaxStyle } from "@opentui/core";
import type { ThemeTokens } from "../theme/types";

// Capture names queried by MarkdownRenderable/CodeRenderable, read from the
// 0.5.11 bundle: markup.* for document structure, tree-sitter captures for
// fenced code. Unregistered names resolve to nothing, which is why an empty
// SyntaxStyle.create() rendered markdown with zero emphasis.
function stylesFor(color: ThemeTokens["color"]): Record<
  string,
  {
    fg?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    dim?: boolean;
  }
> {
  return {
    default: { fg: color.text.primary },
    "markup.heading": { fg: color.accent, bold: true },
    "markup.heading.1": { fg: color.accent, bold: true, underline: true },
    "markup.heading.2": { fg: color.accent, bold: true },
    "markup.heading.3": { fg: color.text.primary, bold: true },
    "markup.heading.4": { fg: color.text.primary, bold: true },
    "markup.heading.5": { fg: color.text.secondary, bold: true },
    "markup.heading.6": { fg: color.text.secondary, bold: true },
    "markup.strong": { fg: color.text.primary, bold: true },
    "markup.bold": { fg: color.text.primary, bold: true },
    "markup.italic": { fg: color.text.primary, italic: true },
    "markup.emphasis": { fg: color.text.primary, italic: true },
    "markup.strikethrough": { dim: true },
    "markup.raw": { fg: color.status.info },
    "markup.raw.block": { fg: color.status.info },
    "markup.list": { fg: color.accent },
    "markup.quote": { fg: color.text.muted, italic: true },
    "markup.link": { fg: color.status.info, underline: true },
    "markup.link.label": { fg: color.status.info, underline: true },
    "markup.link.url": { fg: color.text.muted, dim: true },
    keyword: { fg: color.status.special },
    string: { fg: color.status.success },
    comment: { fg: color.text.muted, dim: true },
    function: { fg: color.status.warning },
    number: { fg: color.status.warning },
  };
}

// ponytail: SyntaxStyle wraps a native handle, so instances are cached by
// color value (not reference — the theme object is rebuilt every App render).
// Stable identity also keeps the reconciler from re-setting the prop.
const cache = new Map<string, SyntaxStyle>();

export function markdownSyntaxStyle(color: ThemeTokens["color"]): SyntaxStyle {
  const key = [
    color.accent,
    color.text.primary,
    color.text.secondary,
    color.text.muted,
    color.status.info,
    color.status.success,
    color.status.warning,
    color.status.special,
  ].join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  const style = SyntaxStyle.fromStyles(stylesFor(color));
  cache.set(key, style);
  return style;
}
