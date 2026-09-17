import { readFileSync, statSync } from "node:fs";

const MIME_TYPES: Record<string, string> = {
  "png": "image/png",
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "gif": "image/gif",
  "webp": "image/webp",
};

export interface ImageLimits {
  maxWidth: number;
  maxHeight: number;
  maxBase64Bytes: number;
}

export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
  maxWidth: 2000,
  maxHeight: 2000,
  maxBase64Bytes: 5 * 1024 * 1024,
};

export function detectMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "image/png";
}

export function processImage(path: string, limits: ImageLimits = DEFAULT_IMAGE_LIMITS): { dataUrl: string; mimeType: string } {
  const buffer = readFileSync(path);
  const mimeType = detectMimeType(path);
  const base64 = buffer.toString("base64");

  if (Buffer.byteLength(base64) <= limits.maxBase64Bytes) {
    return { dataUrl: `data:${mimeType};base64,${base64}`, mimeType };
  }

  throw new Error(`Image ${path} exceeds maximum base64 size after encoding (${Buffer.byteLength(base64)} > ${limits.maxBase64Bytes} bytes)`);
}

export function validateImagePath(path: string): void {
  try {
    const stats = statSync(path);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${path}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Path is not a file")) throw e;
    throw new Error(`Cannot read image file: ${path}`);
  }
}
