import { Box, Text } from "ink";

export function HelpBox() {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
      <Text>
        comandos: <Text bold>/model</Text> · <Text bold>/sessions</Text> · <Text bold>/compact</Text> · <Text bold>/new</Text> · <Text bold>/rename</Text> · <Text bold>/help</Text>
      </Text>
      <Text>
        teclas: <Text bold>Esc</Text> interrompe/fecha · <Text bold>ctrl+o</Text> expande o último tool · <Text bold>y/n/a</Text> permite/nega/sempre
      </Text>
    </Box>
  );
}
