import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";

export function InputArea(props: {
  input: string;
  busy: boolean;
  running?: string;
  suggest?: string[];
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  return (
    <>
      <Text dimColor>{"─".repeat(Math.max(1, process.stdout.columns - 2))}</Text>
      {props.busy ? (
        <Text dimColor>
          <Spinner type="dots" /> {props.running ? `usando ${props.running}…` : "pensando…"}
        </Text>
      ) : null}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="row">
        <Text color="cyan">❯ </Text>
        <TextInput value={props.input} onChange={props.onChange} onSubmit={props.onSubmit} />
      </Box>
      {props.suggest && props.suggest.length > 0 ? (
        <Text dimColor>{"  tab: " + props.suggest.join("  ")}</Text>
      ) : null}
    </>
  );
}
