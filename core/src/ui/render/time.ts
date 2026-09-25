export function formatTime(ts?: number): string {
  return ts
    ? new Date(ts).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}
