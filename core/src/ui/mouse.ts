// Parser de eventos de mouse (SGR 1000/1006) + hit-test de região.
// Puro, testado sem render. A sequência SGR de mouse chega crua no eventEmitter
// do Ink via useStdinContext(); o emulador decide se envia. Terminais sem suporte
// ignoram o escape de enable e o app degrada graciosamente (wheel rola o scrollback).

export type MouseEvent = {
  x: number; // coluna (1-based)
  y: number; // linha (1-based, do topo da tela)
  button: number; // 0 release, 1..3 cliques, 4 wheel-up, 5 wheel-down, 6/7 wheel-l/r
  wheel: "up" | "down" | null;
};

// SGR (1006): ESC [ < b ; x ; y M
const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)[MXm]/;
// Report de posição (1000, sem SGR): ESC [ M + 3 bytes
const POS_RE = /\x1b\[M([\u0000-\u00ff])([\u0000-\u00ff])([\u0000-\u00ff])/;
// Alguns terminais emitem o formato decimal 1015 em vez de SGR.
const DECIMAL_RE = /\x1b\[(\d+);(\d+);(\d+)[MXm]/;

export function isMouseInput(s: string): boolean {
  // Ink may split a report into chunks. Discard the whole escape chunk even
  // when it is incomplete; otherwise its tail (for example `64;12;8M`) is
  // interpreted as ordinary text by the input editor.
  return (
    SGR_RE.test(s) ||
    POS_RE.test(s) ||
    DECIMAL_RE.test(s) ||
    s.includes("\x1b[<") ||
    s.includes("\x1b[M") ||
    /(?:^|\[|<)\d+;\d+;\d+[MXm]$/.test(s) ||
    /(?:^|\[|<)\d+;\d+;\d+[MXm]/.test(s) ||
    // A split SGR report can arrive without its ESC prefix.
    /^\d+;\d+;\d+[MX]$/.test(s)
  );
}

export function parseMouse(s: string): MouseEvent | null {
  let m = s.match(SGR_RE);
  if (m) {
    const button = Number(m[1]);
    return {
      x: Number(m[2]),
      y: Number(m[3]),
      button,
      // SGR uses bit 6 for wheel events: 64 = up, 65 = down.
      wheel: button === 64 || button === 4 ? "up" : button === 65 || button === 5 ? "down" : null,
    };
  }
  m = s.match(POS_RE);
  if (m) {
    const b = m[1].charCodeAt(0) - 32;
    const x = m[2].charCodeAt(0) - 32;
    const y = m[3].charCodeAt(0) - 32;
    return { x, y, button: b, wheel: b === 64 || b === 4 ? "up" : b === 65 || b === 5 ? "down" : null };
  }
  m = s.match(DECIMAL_RE);
  if (m) {
    const button = Number(m[1]);
    return {
      x: Number(m[2]),
      y: Number(m[3]),
      button,
      wheel: button === 64 || button === 4 ? "up" : button === 65 || button === 5 ? "down" : null,
    };
  }
  return null;
}

// Habilitar/desabilitar mouse tracking (posição + SGR).
export const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1006h";
export const DISABLE_MOUSE = "\x1b[?1006l\x1b[?1000l";

// Alturas fixas das regiões (linhas).
export const H_STATUS = 2; // border + texto do StatusBar
export const H_NOTICE = 1; // linha reservada para notice (vazia quando ausente)
export const H_INPUT_BOX = 4; // border(2) + 2 linhas de conteúdo
// Bloco do input: divider(1) + spinner(1) + box(4) + suggest(1) = 7 linhas.
export const H_INPUT_BLOCK = 7;
// Altura do terminal (fallback 24 em non-TTY, ex.: snapshot/CI).
export function terminalHeight(): number {
  return process.stdout.rows ?? 24;
}

export function chatHeight(): number {
  return terminalHeight() - H_STATUS - H_NOTICE - H_INPUT_BLOCK;
}

export type Region = "chat" | "input" | "status";

// Região sob a linha y (1-based do topo da tela); status = no-op.
export function regionAt(y: number): Region | null {
  const rows = terminalHeight();
  const hChat = chatHeight();
  if (y <= 0 || y > rows) return null;
  if (y <= hChat) return "chat";
  if (y <= hChat + H_INPUT_BLOCK) return "input";
  return "status";
}
