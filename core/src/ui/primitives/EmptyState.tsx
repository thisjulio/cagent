import { Text } from "./Text";

export function EmptyState({ message }: { message: string }) {
  return <Text tone="muted">{message}</Text>;
}
