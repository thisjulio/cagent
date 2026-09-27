import { useEffect, useState } from "react";
import { Text } from "../primitives/Text";
import { useTheme } from "../primitives/theme-context";

const FRAMES = ["◌", "◦", "○", "◦"];

export function ActivitySpinner({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);
  const { motion } = useTheme();

  useEffect(() => {
    if (motion === "reduced") return;
    const timer = setInterval(
      () => setFrame((value) => (value + 1) % FRAMES.length),
      180,
    );
    return () => clearInterval(timer);
  }, [motion]);

  return (
    <Text tone="accent">
      {motion === "reduced" ? "⋯" : FRAMES[frame]} {label}
    </Text>
  );
}
