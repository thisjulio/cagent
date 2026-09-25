export function ModelPicker({
  routes,
  query,
  selectedIndex,
  onSelect,
}: {
  routes: string[];
  query: string;
  selectedIndex: number;
  onSelect: (route: string) => void;
}) {
  return (
    <box
      flexDirection="column"
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor="#d97757"
      paddingX={1}
    >
      <text fg="#d97757"> Select model </text>
      <text fg="#999999">Search: {query || "(all models)"}</text>
      {routes.length === 0 ? (
        <text fg="#999999">No matching models</text>
      ) : null}
      <select
        focused
        selectedIndex={selectedIndex}
        height={Math.min(8, Math.max(1, routes.length))}
        options={routes.map((route) => ({
          name: route,
          description: "",
          value: route,
        }))}
        onSelect={(_, option) => {
          if (option?.value) onSelect(String(option.value));
        }}
      />
      <text fg="#666666">↑↓ navigate Enter select Esc cancel</text>
    </box>
  );
}
