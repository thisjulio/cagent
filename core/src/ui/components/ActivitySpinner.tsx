import { useEffect, useState } from "react";

const FRAMES = ["◌", "◦", "○", "◦"];

export function ActivitySpinner({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setFrame((value) => (value + 1) % FRAMES.length),
      180,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <text fg="#d97757">
      {FRAMES[frame]} {label}
    </text>
  );
}
