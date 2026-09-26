export type ToolRowParts = {
  status: string;
  icon?: string;
  title: string;
  path?: string;
  summary?: string;
  added?: number;
  removed?: number;
  duration?: string;
};

function displayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    width +=
      code >= 0x1100 &&
      (code <= 0x115f ||
        code === 0x2329 ||
        code === 0x232a ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe10 && code <= 0xfe19) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1faff))
        ? 2
        : 1;
  }
  return width;
}

export function layoutToolRow(
  parts: ToolRowParts,
  width: number,
): { left: string; right: string } {
  const prefix = `├─ ${parts.status} ${parts.icon ? `${parts.icon} ` : ""}`;
  let title = parts.title;
  let path = parts.path;
  const stats =
    parts.added !== undefined || parts.removed !== undefined
      ? `${parts.added !== undefined ? `+${parts.added}` : ""}${parts.removed !== undefined ? ` −${parts.removed}` : ""}`.trim()
      : "";
  let duration = parts.duration;
  if (duration && /^0+(?:\.0+)?s$/.test(duration)) duration = undefined;

  const rightText = () =>
    [
      path,
      stats,
      [parts.summary, duration && `· ${duration}`].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join("  ");
  const fits = (gap = 2) => {
    const right = rightText();
    return (
      displayWidth(prefix) +
        displayWidth(title) +
        (right ? displayWidth(right) + gap : 0) <=
      width
    );
  };
  if (!fits()) duration = undefined;
  if (!fits() && path) path = path.split(/[\\/]/).filter(Boolean).at(-1);
  if (!fits() && !fits(1)) path = undefined;
  if (!fits()) {
    const right = rightText();
    const available = Math.max(
      12,
      width - displayWidth(prefix) - (right ? displayWidth(right) + 2 : 0),
    );
    let fitted = "";
    let used = 0;
    for (const char of title) {
      const cells = displayWidth(char);
      if (used + cells > Math.max(1, available - 1)) break;
      fitted += char;
      used += cells;
    }
    title = `${fitted}…`;
  }
  return { left: `${prefix}${title}`, right: rightText() };
}
