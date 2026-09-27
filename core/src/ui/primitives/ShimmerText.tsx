import { useEffect, useState } from "react";
import { useTheme } from "./theme-context";

const FRAME_MS = 150;
const WAVE_FREQUENCY = 0.5;
const WAVE_SPEED = 0.8;
const MIN_BRIGHTNESS = 0.4;

export function ShimmerText({
  children,
  active = true,
}: {
  children: string;
  active?: boolean;
}) {
  const { color, motion } = useTheme();
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      children,
    ),
    ({ segment }) => segment,
  );
  const animate = active && motion !== "reduced";
  const frame = useShimmerFrame(animate);

  if (!animate) {
    return (
      <text fg={color.accent} flexGrow={1} minWidth={0}>
        {children}
      </text>
    );
  }

  return (
    <box flexDirection="row" flexGrow={1} minWidth={0}>
      {segments.map((segment, index) => {
        const wave = Math.sin((index - frame * WAVE_SPEED) * WAVE_FREQUENCY);
        const brightness =
          MIN_BRIGHTNESS + (1 - MIN_BRIGHTNESS) * ((wave + 1) / 2);
        return (
          <text
            key={`${index}-${segment}`}
            fg={scaleColor(color.accent, brightness)}
          >
            {segment}
          </text>
        );
      })}
    </box>
  );
}

function useShimmerFrame(animate: boolean): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(() => setFrame((value) => value + 1), FRAME_MS);
    return () => clearInterval(timer);
  }, [animate]);
  return frame;
}

function scaleColor(hex: string, brightness: number): string {
  const channels = hex.match(/[0-9a-f]{2}/gi);
  if (!channels || channels.length < 3) return hex;
  return `#${channels
    .slice(0, 3)
    .map((channel) =>
      Math.round(Number.parseInt(channel, 16) * brightness)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
