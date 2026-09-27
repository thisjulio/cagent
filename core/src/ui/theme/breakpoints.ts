import type { ResponsiveSize } from "./types";

export const breakpoints = {
  compact: 60,
  wide: 120,
  splitCapable: 140,
} as const;

export function supportsSplit(width: number): boolean {
  return width >= breakpoints.splitCapable;
}

export function responsiveSize(width: number): ResponsiveSize {
  if (width < breakpoints.compact) return "compact";
  if (width < breakpoints.wide) return "standard";
  return "wide";
}
