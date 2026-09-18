import { detectImagePaths } from "./image-detection";
import { filterExistingImagePaths, processImage } from "./image-processor";
import type { ContentPart } from "@cagent/sdk";

export function buildImageContent(
  text: string,
): { content: string | ContentPart[]; imagePaths: string[] } | null {
  const imagePaths = detectImagePaths(text);
  const validImagePaths = filterExistingImagePaths(imagePaths);

  if (validImagePaths.length === 0) {
    return { content: text, imagePaths: [] };
  }

  if (validImagePaths.length > 5) {
    return null;
  }

  const parts: ContentPart[] = [{ type: "text", text }];
  for (const path of validImagePaths) {
    const { dataUrl, mimeType } = processImage(path);
    parts.push({
      type: "image_url",
      image_url: { url: dataUrl, mime_type: mimeType },
    });
  }

  return { content: parts, imagePaths: validImagePaths };
}
