export function ModelPicker({ routes, query, onSelect }: { routes: string[]; query: string; onSelect: (route: string) => void }) {
  return (
    <box flexDirection="column" flexShrink={0}>
      <text fg="#666666">model&gt; {query}  (up/down | enter | esc)</text>
      {routes.length === 0 ? <text fg="#666666">(none)</text> : null}
      <select
        focused
        height={Math.min(8, Math.max(1, routes.length))}
        options={routes.map((route) => ({ name: route, description: "", value: route }))}
        onSelect={(_, option) => { if (option?.value) onSelect(String(option.value)); }}
      />
    </box>
  );
}
