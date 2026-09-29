import { detectImagePaths } from "../controller/image-detection";

export function pasteAsChips(
  value: string,
  chips: Map<string, string>,
  imageIndex: number,
): { text: string; nextImageIndex: number } {
  const normalized = value.replace(/\r\n?/g, "\n");
  let displayed = normalized;
  for (const path of detectImagePaths(normalized)) {
    const label = `[Image ${++imageIndex}]`;
    chips.set(label, path);
    displayed = displayed.replaceAll(path, label);
  }
  const lines = normalized.split("\n").length;
  if (lines > 10) {
    const baseLabel = `[pasted · ${lines} lines]`;
    let label = baseLabel;
    let duplicate = 2;
    while (chips.has(label))
      label = `[pasted · ${lines} lines · ${duplicate++}]`;
    chips.set(label, displayed);
    displayed = label;
  }
  return { text: displayed, nextImageIndex: imageIndex };
}

export function toggleChip(
  text: string,
  cursor: number,
  chips: Map<string, string>,
): { text: string; cursor: number } | undefined {
  for (const [label, content] of chips) {
    const start = text.indexOf(label);
    if (start >= 0 && cursor >= start && cursor <= start + label.length) {
      return {
        text: `${text.slice(0, start)}${content}${text.slice(start + label.length)}`,
        cursor: start + content.length,
      };
    }
    const contentStart = text.indexOf(content);
    if (
      content &&
      contentStart >= 0 &&
      cursor >= contentStart &&
      cursor <= contentStart + content.length
    ) {
      return {
        text: `${text.slice(0, contentStart)}${label}${text.slice(contentStart + content.length)}`,
        cursor: contentStart + label.length,
      };
    }
  }
  return undefined;
}

export function expandChips(text: string, chips: Map<string, string>): string {
  let expanded = text;
  for (const [label, content] of [...chips].reverse())
    expanded = expanded.replaceAll(label, content);
  return expanded;
}
