export function diffViewForWidth(width: number): "unified" | "split" {
  return width >= 140 ? "split" : "unified";
}
