import { TextAttributes } from "@opentui/core";

export const typography = {
  heading: TextAttributes.BOLD,
  body: TextAttributes.NONE,
  secondary: TextAttributes.NONE,
  metadata: TextAttributes.DIM,
  hint: TextAttributes.DIM,
  code: TextAttributes.NONE,
  emphasis: TextAttributes.BOLD,
  annotation: TextAttributes.ITALIC,
} as const;
