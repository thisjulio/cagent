const localTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const systemTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function formatTime(ts?: number): string {
  return ts ? localTimeFormatter.format(ts) : "";
}

export function formatSystemTime(ts?: number): string {
  return ts ? systemTimeFormatter.format(ts) : "";
}
