export function HelpBox() {
  return (
    <box
      border
      borderStyle="single"
      borderColor="#666666"
      paddingX={1}
      flexDirection="column"
      flexShrink={0}
    >
      <text>
        commands: <strong>/model</strong> <strong>/sessions</strong>{" "}
        <strong>/compact</strong> <strong>/new</strong> <strong>/rename</strong>{" "}
        <strong>/skill</strong> <strong>/reload-skills</strong>{" "}
        <strong>/help</strong>
      </text>
      <text>
        keys: <strong>Esc</strong> interrupts/closes <strong>ctrl+o</strong>{" "}
        expands the last tool <strong>y/n/a</strong> allow/deny/always
      </text>
    </box>
  );
}
