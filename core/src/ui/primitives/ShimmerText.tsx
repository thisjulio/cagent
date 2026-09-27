import { useEffect, useState } from "react";
import { useTheme } from "./theme-context";

const FRAME_MS = 180;
const BAND_WIDTH = 3;

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
  const animate =
    active && motion !== "reduced" && segments.length > BAND_WIDTH;
  const phase = useShimmerPhase(animate, segments.length);

  return (
    <text fg={color.accent} flexGrow={1} minWidth={0}>
      {animate
        ? segments.map((segment, index) => {
            const distance =
              (index - phase + segments.length) % segments.length;
            return (
              <span
                key={`${index}-${segment}`}
                fg={distance < BAND_WIDTH ? color.text.primary : color.accent}
              >
                {segment}
              </span>
            );
          })
        : children}
    </text>
  );
}

function useShimmerPhase(animate: boolean, segmentCount: number): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(
      () => setPhase((value) => (value + 1) % segmentCount),
      FRAME_MS,
    );
    return () => clearInterval(timer);
  }, [animate, segmentCount]);
  return phase;
}
