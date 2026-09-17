# Spec: Image Support

## Overview

Add multimodal image support to cagent: users can reference images by file path in their prompts, the `read_file` tool can read images, and images are sent to vision-capable models as content parts.

## Scope

- Detect image file paths in user prompts (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`)
- `read_file` tool reads images and returns them as content parts
- Automatic image resizing when exceeding limits (like OpenCode)
- Configurable limits (max width, height, base64 size)
- Support all provider plugins (OpenAI, Anthropic, etc.)
- Multiple images per message (limit 5)
- Chip display `[Image: nome.png]` in UI

## Out of Scope (future)

- Drag-and-drop in TUI
- Clipboard paste detection
- Image preview/thumbnails in TUI

## Architecture

### Data Flow

```
User prompt: "analise ./img.png"
       ↓
Controller.submitMessage()
       ↓
ImageDetector: finds paths matching image extensions
       ↓
ImageProcessor: read file → validate → resize if needed → data URL
       ↓
Message.content = [{type:"text",...}, {type:"image_url",...}]
       ↓
Provider plugin: converts to provider-specific format
       ↓
API call
```

### SDK Changes (`sdk/src/index.ts`)

```typescript
// New types
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; mime_type?: string } };

// Modified Message type
export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];  // ← was string only
  tool_calls?: { id: string; name: string; arguments: string }[];
  tool_call_id?: string;
};

// Helper to normalize content
export function toContentParts(content: string | ContentPart[]): ContentPart[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}
```

### Core Changes

#### 1. Image Detection (`core/src/controller/image-detection.ts`)

```typescript
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

export function detectImagePaths(text: string): string[] {
  // Find paths like ./img.png, /home/user/img.jpg, ../screenshot.png
  const regex = /(\.{0,2}\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp))/gi;
  const matches = text.matchAll(regex);
  return [...new Set([...matches].map(m => m[1]))];
}
```

#### 2. Image Processing (`core/src/controller/image-processor.ts`)

Uses `@silvia-odwyer/photon-node` (WASM, no native deps).

```typescript
import { readFileSync, statSync } from "node:fs";
import { PhotonImage } from "@silvia-odwyer/photon-node";

interface ImageLimits {
  maxWidth: number;
  maxHeight: number;
  maxBase64Bytes: number;
}

const DEFAULT_LIMITS: ImageLimits = {
  maxWidth: 2000,
  maxHeight: 2000,
  maxBase64Bytes: 5 * 1024 * 1024,
};

export function processImage(path: string, limits: ImageLimits = DEFAULT_LIMITS): {
  dataUrl: string;
  mimeType: string;
} {
  const buffer = readFileSync(path);
  const image = PhotonImage.new_from_byteslice(buffer);
  
  const width = image.get_width();
  const height = image.get_height();
  
  // Check if resize needed
  if (width <= limits.maxWidth && height <= limits.maxHeight) {
    // Encode as PNG or JPEG based on original
    const mime = detectMimeType(path);
    const base64 = buffer.toString("base64");
    if (Buffer.byteLength(base64) <= limits.maxBase64Bytes) {
      return { dataUrl: `data:${mime};base64,${base64}`, mimeType: mime };
    }
  }
  
  // Resize with Lanczos3, try progressive JPEG qualities
  const scale = Math.min(1, limits.maxWidth / width, limits.maxHeight / height);
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));
  
  const resized = PhotonImage.resize(image, targetW, targetH, 3); // Lanczos3
  
  // Try JPEG qualities: 80, 85, 70, 55, 40
  for (const quality of [80, 85, 70, 55, 40]) {
    const jpegBytes = resized.get_bytes_jpeg(quality);
    const base64 = Buffer.from(jpegBytes).toString("base64");
    if (Buffer.byteLength(base64) <= limits.maxBase64Bytes) {
      return { dataUrl: `data:image/jpeg;base64,${base64}`, mimeType: "image/jpeg" };
    }
  }
  
  throw new Error(`Image ${path} too large after resizing`);
}
```

#### 3. Controller Submission (`core/src/controller/submission.ts`)

```typescript
export async function submitMessage(controller: Controller, text: string): Promise<void> {
  const imagePaths = detectImagePaths(text);
  
  let content: string | ContentPart[] = text;
  if (imagePaths.length > 0) {
    if (imagePaths.length > 5) {
      throw new Error("Maximum 5 images per message");
    }
    
    const parts: ContentPart[] = [{ type: "text", text }];
    for (const path of imagePaths) {
      try {
        const { dataUrl, mimeType } = processImage(path);
        parts.push({ type: "image_url", image_url: { url: dataUrl, mime_type: mimeType } });
      } catch (e) {
        throw new Error(`Error loading image ${path}: ${e}`);
      }
    }
    content = parts;
  }
  
  // Rest of submission...
  controller.messages.push({ role: "user", content });
}
```

### Provider Plugin Changes

#### OpenAI (`plugins/openai/src/stream-api.ts`)

OpenAI format already supports `image_url` content parts. The `toChatMessages` in SDK needs to handle content parts:

```typescript
// In SDK toChatMessages
export function toChatMessages(messages: Message[]): WireMessage[] {
  return messages.map((m) => {
    const out: any = { role: m.role };
    
    if (typeof m.content === "string") {
      out.content = m.content;
    } else {
      // Convert content parts to OpenAI format
      out.content = m.content.map(part => {
        if (part.type === "text") return { type: "text", text: part.text };
        if (part.type === "image_url") {
          return { type: "image_url", image_url: { url: part.image_url.url } };
        }
        return part;
      });
    }
    
    // ... rest unchanged
  });
}
```

#### Anthropic (`plugins/anthropic/` - when implemented)

Anthropic uses different format:
```typescript
{
  type: "image",
  source: {
    type: "base64",
    media_type: "image/png",
    data: "base64data..."
  }
}
```

Each provider plugin handles its own conversion in `stream()` or `prepare_call()`.

### read_file Tool Changes (`plugins/code-tools/src/read.ts`)

```typescript
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function readTool(ctx: PluginContext) {
  return defineTool(
    "read_file",
    "Reads a file. For images, returns the image content for vision models.",
    {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "number" },
        limit: { type: "number" },
      },
      required: ["path"],
    },
    async (args: ToolArgs) => {
      // ... existing path validation ...
      
      const ext = path.extname(abs).toLowerCase();
      const isImage = IMAGE_MIME_TYPES.has(mimeFromExt(ext));
      
      if (isImage) {
        const buffer = fs.readFileSync(abs);
        const base64 = buffer.toString("base64");
        const mime = mimeFromExt(ext);
        return {
          output: `Image loaded: ${abs} (${mime})`,
          // Signal to controller that this is an image attachment
          metadata: { type: "image", dataUrl: `data:${mime};base64,${base64}` },
        };
      }
      
      // ... existing text file reading ...
    },
  );
}
```

### UI Changes

#### Chip Display

When user types a message with image paths, show chips:

```typescript
// In prompt display
function renderPrompt(text: string): React.ReactNode {
  const imagePaths = detectImagePaths(text);
  if (imagePaths.length === 0) return text;
  
  return (
    <>
      {text}
      {imagePaths.map(p => (
        <Text key={p} color="cyan"> [Image: {path.basename(p)}]</Text>
      ))}
    </>
  );
}
```

#### History Display

```typescript
function renderMessageContent(content: string | ContentPart[]): React.ReactNode {
  if (typeof content === "string") return content;
  
  return content.map((part, i) => {
    if (part.type === "text") return <Text key={i}>{part.text}</Text>;
    if (part.type === "image_url") {
      const name = extractNameFromDataUrl(part.image_url.url);
      return <Text key={i} color="cyan"> [image: {name}]</Text>;
    }
    return null;
  });
}
```

### Configuration

Add to `~/.cagent/config.yml` or `cagent.yml`:

```yaml
media:
  image:
    auto_resize: true
    max_width: 2000
    max_height: 2000
    max_base64_bytes: 5242880
```

Core reads config and passes limits to `ImageProcessor`.

### Error Handling

- Image file not found: fatal error, message not sent
- Image not valid image file: fatal error with clear message
- Image too large after resize: fatal error suggesting smaller image
- More than 5 images: fatal error

Error format: `Error: ./img.png is not a valid image file`

### Dependencies

Add to `core/package.json`:
```json
{
  "dependencies": {
    "@silvia-odwyer/photon-node": "^0.3.0"
  }
}
```

### Tests

Create test images in `core/test/fixtures/`:
- `test-image.png` (small, 100x100)
- `test-image.jpg` (small, 100x100)
- `large-image.png` (4000x4000, for resize tests)

Test cases:
1. Detect image paths in text
2. Process small image (no resize)
3. Process large image (resize)
4. Multiple images in one message
5. Invalid image path (error)
6. Non-image file (error)
7. Provider conversion (OpenAI format)
8. read_file tool with image

### Implementation Order

1. SDK: Add `ContentPart` type, modify `Message`, update `toChatMessages`
2. Core: `image-detection.ts`
3. Core: `image-processor.ts` (with photon-node)
4. Core: Modify `submission.ts` to detect and process images
5. Provider: Update `stream-api.ts` to handle content parts
6. Tool: Update `read_file` to handle images
7. UI: Chip display for images
8. Config: Read media.image settings
9. Tests
10. Docs: `docs/features/images.md`
