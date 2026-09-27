import { supportsSplit } from "../theme/breakpoints";

export function diffViewForWidth(width: number): "unified" | "split" {
  return supportsSplit(width) ? "split" : "unified";
}
