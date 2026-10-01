import fs from "node:fs";

export function repairSessionTail(fd: number): void {
  const size = fs.fstatSync(fd).size;
  if (!size) return;
  const last = Buffer.alloc(1);
  fs.readSync(fd, last, 0, 1, size - 1);
  if (last[0] === 10) return;
  const chunks: Buffer[] = [];
  let position = size;
  while (position > 0) {
    const length = Math.min(4096, position);
    position -= length;
    const chunk = Buffer.alloc(length);
    fs.readSync(fd, chunk, 0, length, position);
    const newline = chunk.lastIndexOf(10);
    chunks.unshift(chunk.subarray(newline + 1));
    if (newline >= 0) {
      position += newline + 1;
      break;
    }
  }
  try {
    JSON.parse(Buffer.concat(chunks).toString("utf8"));
    fs.writeFileSync(fd, "\n");
  } catch {
    fs.ftruncateSync(fd, position);
  }
}
