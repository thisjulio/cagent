// Settles the trailing edge of streaming markdown so incomplete constructs
// don't flash raw markers on every chunk.
// The OpenTUI parser renders partial trailing constructs literally
// (`**wor` shows the asterisks) until the closer arrives. Appending the
// missing closers for display only makes the stream converge without flashes:
// concealed markers add no visible text, and once the real closers arrive the
// parse is identical. Worst case is a transient mis-format of a partial line,
// which self-corrects as soon as the block seals.

const FENCE_LINE = /^\s*(```|~~~)/;

// Symmetric inline delimiters closed in LIFO order. Single `*`/`_` are
// deliberately excluded: `* item` bullets and `a * b` prose would misfire.
const INLINE_DELIMITERS = ["**", "__", "`", "~~"];

type Opener = { delimiter: string; index: number };

function fenceCloser(content: string): string | undefined {
  const lines = content.split("\n");
  let fence: string | undefined;
  for (const line of lines) {
    const match = FENCE_LINE.exec(line);
    if (match) fence = fence === match[1] ? undefined : match[1];
  }
  if (!fence) return undefined;
  // ponytail: fence spans lines, so only the fence closer is appended here;
  // inline closers would land inside the code block as literal garbage.
  return `${content.endsWith("\n") ? "" : "\n"}${fence}`;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const found = haystack.indexOf(needle, from);
    if (found < 0) return count;
    count++;
    from = found + needle.length;
  }
}

function unclosedInTail(tail: string): Opener[] {
  // ponytail: fence marker lines hold backticks, so strip them before
  // counting code spans; other delimiters keep the naive count on purpose —
  // a miss only falls back to today's flashing behavior.
  const inlineTail = tail
    .split("\n")
    .filter((line) => !FENCE_LINE.test(line))
    .join("\n");
  const openers: Opener[] = [];
  for (const delimiter of INLINE_DELIMITERS) {
    if (countOccurrences(inlineTail, delimiter) % 2 === 1) {
      openers.push({ delimiter, index: inlineTail.lastIndexOf(delimiter) });
    }
  }
  openers.sort((a, b) => b.index - a.index);
  return openers;
}

export function settleStreamingMarkdown(content: string): string {
  if (!content) return content;
  const fence = fenceCloser(content);
  if (fence !== undefined) return content + fence;
  // ponytail: only the unsealed tail (after the last blank line) is eligible;
  // closers for settled prose would swallow whole paragraphs into formatting.
  const seal = content.lastIndexOf("\n\n");
  const tail = seal < 0 ? content : content.slice(seal + 2);
  const openers = unclosedInTail(tail);
  if (openers.length === 0) return content;
  return content + openers.map((opener) => opener.delimiter).join("");
}
