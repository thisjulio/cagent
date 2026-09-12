export function HelpBox() {
  return (
    <box border borderStyle="single" borderColor="#666666" paddingX={1} flexDirection="column" flexShrink={0}>
      <text>comandos: <strong>/model</strong> <strong>/sessions</strong> <strong>/compact</strong> <strong>/new</strong> <strong>/rename</strong> <strong>/help</strong></text>
      <text>teclas: <strong>Esc</strong> interrompe/fecha <strong>ctrl+o</strong> expande o ultimo tool <strong>y/n/a</strong> permite/nega/sempre</text>
    </box>
  );
}
