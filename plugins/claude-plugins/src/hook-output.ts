const MAX_HOOK_OUTPUT_CHARS = 128 * 1024;

export async function readHookOutput(
  stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (output.length >= MAX_HOOK_OUTPUT_CHARS) continue;
      output += decoder.decode(value, { stream: true });
      if (output.length > MAX_HOOK_OUTPUT_CHARS)
        output = output.slice(0, MAX_HOOK_OUTPUT_CHARS);
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
