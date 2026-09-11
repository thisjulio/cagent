import stringWidth from "string-width";

// Quebra um texto em linhas de no máximo maxCols colunas (visíveis).
// Respeita ANSI (largura 0), quebra de palavras e \n (quebra forçada).
// Devolve, por linha, o texto e o [start, end) na string original — usado para
// posicionar o cursor no input multi-linha. Puro, testado sem render.

export type WrappedLine = { text: string; start: number; end: number };

type Atom = { s: string; w: number; start: number; end: number };

function readEscape(text: string, i: number): { s: string; next: number } {
  const c = text[i + 1];
  if (c === "[") {
    let j = i + 2;
    while (j < text.length && /[0-9;]/.test(text[j])) j++;
    if (j < text.length) j++; // byte final (ex.: 'm')
    return { s: text.slice(i, j), next: j };
  }
  if (c === "]") {
    let j = i + 2;
    while (j < text.length && text[j] !== "\x07" && text[j] !== "\x1b") j++;
    if (j < text.length) j++; // BEL
    return { s: text.slice(i, j), next: j };
  }
  return { s: text.slice(i, i + 2), next: i + 2 };
}

function readAtoms(text: string): Atom[] {
  const out: Atom[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\x1b") {
      const e = readEscape(text, i);
      out.push({ s: e.s, w: 0, start: i, end: e.next });
      i = e.next;
    } else {
      out.push({ s: text[i], w: stringWidth(text[i]), start: i, end: i + 1 });
      i++;
    }
  }
  return out;
}

function join(a: Atom[]): string {
  return a.map((x) => x.s).join("");
}
function sumW(a: Atom[]): number {
  return a.reduce((n, x) => n + x.w, 0);
}
const range = (a: Atom[]) => ({ start: a[0].start, end: a[a.length - 1].end });

function hardBreak(word: Atom[], maxCols: number, lines: WrappedLine[]) {
  let piece: Atom[] = [];
  let pw = 0;
  for (const a of word) {
    if (pw + a.w > maxCols && pw > 0) {
      lines.push({ text: join(piece), ...range(piece) });
      piece = [a];
      pw = a.w;
    } else {
      piece.push(a);
      pw += a.w;
    }
  }
  if (piece.length) lines.push({ text: join(piece), ...range(piece) });
}

export function wrap(text: string, maxCols: number): WrappedLine[] {
  const atoms = readAtoms(text);
  const lines: WrappedLine[] = [];
  let curLine: Atom[] = [];
  let curLineW = 0;
  let curWord: Atom[] = [];

  const flushWord = () => {
    if (!curWord.length) return;
    const w = sumW(curWord);
    const s = join(curWord);
    if (w === 0) {
      // ANSI isolado: anexe à linha atual
      curLine.push(...curWord);
      curWord = [];
      return;
    }
    if (w > maxCols) {
      if (curLine.length) {
        lines.push({ text: join(curLine), ...range(curLine) });
        curLine = [];
        curLineW = 0;
      }
      hardBreak(curWord, maxCols, lines);
      curWord = [];
      return;
    }
    const sep = curLine.length ? " " : "";
    if (curLineW + w + (sep ? 1 : 0) > maxCols && curLine.length) {
      lines.push({ text: join(curLine), ...range(curLine) });
      curLine = curWord;
      curLineW = w;
    } else {
      if (sep) {
        const sepIdx = curLine.length ? curLine[curLine.length - 1].end : curWord[0].start;
        curLine.push({ s: " ", w: 1, start: sepIdx, end: sepIdx + 1 }, ...curWord);
      } else {
        curLine = curWord;
      }
      curLineW += w + (sep ? 1 : 0);
    }
    curWord = [];
  };

  const flushLine = () => {
    flushWord();
    if (curLine.length) {
      lines.push({ text: join(curLine), ...range(curLine) });
      curLine = [];
      curLineW = 0;
    }
  };

  for (const a of atoms) {
    if (a.s === " ") flushWord();
    else if (a.s === "\n") flushLine();
    else curWord.push(a);
  }
  flushLine();
  return lines;
}
