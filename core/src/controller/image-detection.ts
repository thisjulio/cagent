const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

export function detectImagePaths(text: string): string[] {
  const regex = /(\.{0,2}\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp))/gi;
  const matches = [...text.matchAll(regex)];
  return [...new Set(matches.map((m) => m[1]))];
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.test(path);
}
