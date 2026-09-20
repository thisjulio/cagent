import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IS_RELEASE, VERSION } from "./version";

const REPO = process.env.CAGENT_REPO ?? "thisjulio/cagent";

function assetName(): string {
  const osName =
    os.platform() === "darwin"
      ? "darwin"
      : os.platform() === "linux"
        ? "linux"
        : "";
  const arch =
    process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : "";
  if (!osName || !arch)
    throw new Error(
      `unsupported platform: ${process.platform}/${process.arch}`,
    );
  const musl =
    osName === "linux" &&
    (() => {
      try {
        return /musl/i.test(
          new TextDecoder().decode(
            new Uint8Array(Bun.spawnSync(["ldd", "--version"]).stdout),
          ),
        );
      } catch {
        return false;
      }
    })();
  return `cagent-${osName}-${arch}${musl ? "-musl" : ""}`;
}

async function responseData(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { Accept: "application/octet-stream" },
  });
  if (!response.ok)
    throw new Error(`download failed (${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function latestVersion(): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "cagent-upgrade",
      },
    },
  );
  if (!response.ok)
    throw new Error(`could not query the latest version (${response.status})`);
  const tag = ((await response.json()) as { tag_name?: unknown }).tag_name;
  if (typeof tag !== "string" || !/^v\d+\.\d+\.\d+$/.test(tag))
    throw new Error("Release has no valid semver tag");
  return tag.slice(1);
}

function expectedChecksum(text: string, asset: string): string {
  const line = text
    .split(/\r?\n/)
    .find((item) => item.trim().split(/\s+/).at(-1) === asset);
  const checksum = line?.trim().split(/\s+/)[0];
  if (!checksum) throw new Error(`checksum missing for ${asset}`);
  return checksum;
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

export async function upgrade(): Promise<void> {
  if (!IS_RELEASE) {
    console.log(
      "upgrade is only available in the installed binary; use a release build to update",
    );
    return;
  }
  const latest = await latestVersion();
  if (compareVersions(VERSION, latest) >= 0) {
    console.log(`cagent v${VERSION} is already up to date`);
    return;
  }

  const asset = assetName();
  const base = `https://github.com/${REPO}/releases/download/v${latest}`;
  const binary = await responseData(`${base}/${asset}`);
  const checksums = new TextDecoder().decode(
    await responseData(`${base}/SHA256SUMS`),
  );
  const actual = crypto.createHash("sha256").update(binary).digest("hex");
  if (actual !== expectedChecksum(checksums, asset))
    throw new Error("new binary checksum does not match");

  const executable = path.resolve(process.execPath);
  const temporary = `${executable}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, binary, { mode: 0o755 });
    fs.chmodSync(temporary, 0o755);
    fs.renameSync(temporary, executable);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw new Error(
      `could not replace ${executable}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  console.log(`cagent updated: v${VERSION} -> v${latest}`);
}
