import { describe, test, expect } from "bun:test";
import {
  detectImagePaths,
  isImagePath,
} from "../src/controller/image-detection";
import {
  filterExistingImagePaths,
  processImage,
  detectMimeType,
  validateImagePath,
} from "../src/controller/image-processor";
import { buildImageContent } from "../src/controller/submit-image";
import { writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventBus } from "../src/events";
import { Registry } from "../src/registry";
import { Controller, type ControllerDeps } from "../src/controller/controller";

function controllerDeps(sessionDir: string): ControllerDeps {
  return {
    config: {
      plugins: [],
      allowlist: [],
      model: "openai/m1",
      permissions: false,
    },
    registry: new Registry(),
    bus: new EventBus(),
    adapter: {
      list_models: async () => ["model-a"],
      prepare_call: async (request) => request,
      stream: async function* () {
        yield { type: "text", text: "unused" };
      },
    },
    model: "openai/m1",
    systemPrompt: "sys",
    sessionDir,
  };
}

describe("image-detection", () => {
  test("detects relative image path", () => {
    const paths = detectImagePaths("analise esta imagem ./screenshot.png");
    expect(paths).toContain("./screenshot.png");
  });

  test("detects absolute image path", () => {
    const paths = detectImagePaths("veja /home/user/img.jpg");
    expect(paths).toContain("/home/user/img.jpg");
  });

  test("detects multiple image paths", () => {
    const paths = detectImagePaths("compare ./a.png com ./b.jpg e ../c.webp");
    expect(paths).toHaveLength(3);
    expect(paths).toContain("./a.png");
    expect(paths).toContain("./b.jpg");
    expect(paths).toContain("../c.webp");
  });

  test("deduplicates paths", () => {
    const paths = detectImagePaths("./img.png e ./img.png novamente");
    expect(paths).toHaveLength(1);
  });

  test("returns empty for no images", () => {
    const paths = detectImagePaths("just some text without images");
    expect(paths).toHaveLength(0);
  });

  test("isImagePath returns true for images", () => {
    expect(isImagePath("./test.png")).toBe(true);
    expect(isImagePath("/path/to/img.jpg")).toBe(true);
    expect(isImagePath("photo.jpeg")).toBe(true);
    expect(isImagePath("pic.webp")).toBe(true);
    expect(isImagePath("anim.gif")).toBe(true);
  });

  test("isImagePath returns false for non-images", () => {
    expect(isImagePath("./test.txt")).toBe(false);
    expect(isImagePath("/path/to/file.pdf")).toBe(false);
  });
});

describe("image-processor", () => {
  test("detectMimeType returns correct types", () => {
    expect(detectMimeType("./test.png")).toBe("image/png");
    expect(detectMimeType("./test.jpg")).toBe("image/jpeg");
    expect(detectMimeType("./test.jpeg")).toBe("image/jpeg");
    expect(detectMimeType("./test.gif")).toBe("image/gif");
    expect(detectMimeType("./test.webp")).toBe("image/webp");
  });

  test("processImage reads and encodes small PNG", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cagent-test-"));
    const imagePath = join(tmpDir, "test.png");
    // Minimal 1x1 PNG
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60E6KwAAAABJRU5ErkJggg==",
      "base64",
    );
    writeFileSync(imagePath, pngBytes);

    const result = processImage(imagePath);
    expect(result.mimeType).toBe("image/png");
    expect(result.dataUrl).toContain("data:image/png;base64,");

    rmSync(tmpDir, { recursive: true });
  });

  test("filterExistingImagePaths excludes missing files", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cagent-test-"));
    const existingPath = join(tmpDir, "existing.png");
    writeFileSync(existingPath, "image");

    expect(
      filterExistingImagePaths([existingPath, join(tmpDir, "missing.png")]),
    ).toEqual([existingPath]);

    rmSync(tmpDir, { recursive: true });
  });

  test("validateImagePath throws for non-existent file", () => {
    expect(() => validateImagePath("/nonexistent/file.png")).toThrow();
  });

  test("validateImagePath passes for existing file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cagent-test-"));
    const filePath = join(tmpDir, "test.txt");
    writeFileSync(filePath, "test");
    expect(() => validateImagePath(filePath)).not.toThrow();
    rmSync(tmpDir, { recursive: true });
  });

  test("missing image path remains prompt text and starts a turn", async () => {
    const sessionDir = mkdtempSync(join(tmpdir(), "cagent-test-"));
    const controller = new Controller(controllerDeps(sessionDir));

    await expect(
      controller.submit("analise ./missing-image.png"),
    ).resolves.toBeUndefined();

    expect(controller.state.notice).toBe("");
    expect(controller.state.busy).toBe(false);
    expect(
      controller.messages.some(
        (message) => message.content === "analise ./missing-image.png",
      ),
    ).toBe(true);
    expect(controller.state.chat).toHaveLength(2);

    rmSync(sessionDir, { recursive: true });
  });
});

describe("buildImageContent", () => {
  test("returns plain text when no image paths are present", () => {
    const result = buildImageContent("just text here");
    expect(result).not.toBeNull();
    expect(result!.content).toBe("just text here");
    expect(result!.imagePaths).toEqual([]);
  });

  test("returns null when more than 5 valid images", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cagent-test-"));
    const paths: string[] = [];
    for (let i = 0; i < 6; i++) {
      const p = join(tmpDir, `img${i}.png`);
      writeFileSync(p, "image");
      paths.push(p);
    }
    const text = paths.join(" ");
    const result = buildImageContent(text);
    expect(result).toBeNull();
    rmSync(tmpDir, { recursive: true });
  });

  test("handles mixed existing and missing image paths", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cagent-test-"));
    const existing = join(tmpDir, "exists.png");
    writeFileSync(existing, "image");
    const missing = join(tmpDir, "missing.png");
    const text = `see ${existing} and ${missing}`;
    const result = buildImageContent(text);
    expect(result).not.toBeNull();
    expect(result!.imagePaths).toEqual([existing]);
    rmSync(tmpDir, { recursive: true });
  });

  test("builds content parts with images", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cagent-test-"));
    const imgPath = join(tmpDir, "test.png");
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60E6KwAAAABJRU5ErkJggg==",
      "base64",
    );
    writeFileSync(imgPath, pngBytes);
    const result = buildImageContent(`look at ${imgPath}`);
    expect(result).not.toBeNull();
    expect(Array.isArray(result!.content)).toBe(true);
    const parts = result!.content as Array<{ type: string }>;
    expect(parts.length).toBe(2);
    expect(parts[0].type).toBe("text");
    expect(parts[1].type).toBe("image_url");
    rmSync(tmpDir, { recursive: true });
  });
});
