export interface LineRange {
  start: number; // 1-based, inclusive
  end: number; // 1-based, inclusive
  expected: string; // exact content currently occupying the range
  content: string; // "" removes the lines
}

export type RangeError = { code: "E_RANGE" | "E_EXPECTED"; message: string };

function toLines(content: string): string[] {
  const body = content.replace(/\r\n/g, "\n");
  if (body === "") return [];
  return body.replace(/\n$/, "").split("\n");
}

export function applyRanges(
  lines: string[],
  ranges: LineRange[],
): { lines: string[]; error?: RangeError } {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.start < 1 || r.end < r.start) {
      return {
        lines,
        error: {
          code: "E_RANGE",
          message: `invalid range ${r.start}-${r.end}: start_line must be >= 1 and <= end_line`,
        },
      };
    }
    if (r.end > lines.length) {
      return {
        lines,
        error: {
          code: "E_RANGE",
          message: `range ${r.start}-${r.end} is past the end of the file, which has ${lines.length} lines - call read_file again and use the numbers it returns`,
        },
      };
    }
    const actual = lines.slice(r.start - 1, r.end);
    const expected = toLines(r.expected);
    if (
      actual.length !== expected.length ||
      actual.some((line, index) => line !== expected[index])
    ) {
      return {
        lines,
        error: {
          code: "E_EXPECTED",
          message: `lines ${r.start}-${r.end} do not match old_content - call read_file again and copy the current lines exactly`,
        },
      };
    }
    const prev = sorted[i - 1];
    if (prev && r.start <= prev.end) {
      return {
        lines,
        error: {
          code: "E_RANGE",
          message: `ranges ${prev.start}-${prev.end} and ${r.start}-${r.end} overlap - send one entry per region`,
        },
      };
    }
  }

  // Bottom-up: each index stays valid while the ones above it haven't changed.
  const result = [...lines];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i];
    result.splice(r.start - 1, r.end - r.start + 1, ...toLines(r.content));
  }
  return { lines: result };
}
