export function formatTime(ts?: number): string {
  return ts ? new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) : "";
}
