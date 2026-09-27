import { symbols } from "../theme/symbols";
import { Text } from "./Text";
import type { StatusLevel as StatusLevelName } from "../theme/types";

const status = {
  success: { symbol: symbols.success, tone: "success" },
  error: { symbol: symbols.error, tone: "danger" },
  warning: { symbol: symbols.warning, tone: "warning" },
  denied: { symbol: symbols.denied, tone: "muted" },
  running: { symbol: symbols.running, tone: "info" },
  pending: { symbol: symbols.pending, tone: "muted" },
} as const;

const statusLevels: Record<
  StatusLevelName,
  { tone: "muted" | "info" | "warning" | "danger"; symbol: string }
> = {
  neutral: { tone: "muted", symbol: symbols.pending },
  informational: { tone: "info", symbol: symbols.running },
  attention: { tone: "warning", symbol: symbols.warning },
  critical: { tone: "danger", symbol: symbols.error },
};

export function StatusMessage({
  level,
  label,
}: {
  level: StatusLevelName;
  label: string;
}) {
  const value = statusLevels[level];
  return (
    <Text tone={value.tone}>
      {value.symbol} {label}
    </Text>
  );
}

export function Status({
  state,
  label,
}: {
  state: keyof typeof status;
  label?: string;
}) {
  const value = status[state];
  return (
    <Text tone={value.tone}>
      {value.symbol}
      {label ? ` ${label}` : ""}
    </Text>
  );
}
