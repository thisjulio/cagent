import hljs from "highlight.js";
import { Text } from "ink";

const HL_COLORS: Record<string, string> = {
  "hljs-comment": "gray",
  "hljs-quote": "gray",
  "hljs-keyword": "blue",
  "hljs-string": "green",
  "hljs-number": "yellow",
  "hljs-function": "cyan",
  "hljs-title": "cyan",
  "hljs-attr": "yellow",
  "hljs-params": "cyan",
  "hljs-built_in": "cyan",
  "hljs-type": "cyan",
  "hljs-literal": "yellow",
  "hljs-meta": "gray",
  "hljs-symbol": "yellow",
  "hljs-regex": "red",
  "hljs-link": "cyan",
  "hljs-section": "cyan",
  "hljs-variable": "magenta",
  "hljs-deletion": "red",
  "hljs-addition": "green",
};

export function decodeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function HighlightedCode({ code, language }: { code: string; language?: string }) {
  if (!code) return <Text>{""}</Text>;
  let html: string;
  try {
    html =
      language && hljs.getLanguage(language)
        ? hljs.highlight(decodeHtml(code), { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(decodeHtml(code), { ignoreIllegals: true }).value;
  } catch {
    return <Text>{code}</Text>;
  }
  // ponytail: parser com pilha para spans aninhados (hljs-function envolve hljs-params); regex antigo vazava markup cru
  const segs: { text: string; color: string | undefined }[] = [];
  const stack: (string | undefined)[] = [];
  const re = /<span class="([^"]+)">|<\/span>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) stack.push(HL_COLORS[m[1].split(" ")[0]]);
    else if (m[0] === "</span>") stack.pop();
    else {
      const text = decodeHtml(m[2]);
      if (!text) continue;
      const color = stack[stack.length - 1];
      const last = segs[segs.length - 1];
      if (last && last.color === color) last.text += text;
      else segs.push({ text, color });
    }
  }
  return <Text>{segs.map((s, i) => <Text key={i} color={s.color}>{s.text}</Text>)}</Text>;
}
