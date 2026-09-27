import { Text } from "./Text";

export function KeyHint({
  shortcut,
  label,
}: {
  shortcut: string;
  label: string;
}) {
  return (
    <>
      <Text tone="muted" bold>
        {shortcut}
      </Text>
      <Text tone="muted"> {label}</Text>
    </>
  );
}
