import { useEffect, useState } from "react";
import { useTheme } from "./theme-context";

const FRAME_MS = 150;
const WAVE_FREQUENCY = 0.5;
const WAVE_SPEED = 0.8;
const MIN_BRIGHTNESS = 0.4;
// ponytail: cap animated graphemes so a long task title can't create
// hundreds of nodes re-rendered 6x/second; the tail renders plain.
const MAX_ANIMATED_SEGMENTS = 80;

// ponytail: one shared Segmenter — constructing it per render per instance
// was pure overhead.
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function ShimmerText({
  children,
  active = true,
}: {
  children: string;
  active?: boolean;
}) {
  const { color, motion } = useTheme();
  const animate = active && motion !== "reduced";
  const frame = useShimmerFrame(animate);

  if (!animate) {
    return (
      <text fg={color.accent} flexGrow={1} minWidth={0}>
        {children}
      </text>
    );
  }

  const segments = Array.from(
    segmenter.segment(children),
    ({ segment }) => segment,
  );
  const animated = segments.slice(0, MAX_ANIMATED_SEGMENTS);
  const rest =
    segments.length > animated.length
      ? children.slice(animated.join("").length)
      : "";

  return (
    <box flexDirection="row" flexGrow={1} minWidth={0}>
      {animated.map((segment, index) => {
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
      {rest ? <text fg={color.accent}>{rest}</text> : null}
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
