import type { ChatItem } from "../../controller/state";
import { ChatItemRow } from "./ChatItemRow";
import type { Controller } from "../../controller/controller";

// Offset 0 shows the end of the history; a positive offset reveals earlier lines.
export function ChatViewport({
  chat,
  busy,
  controller,
}: {
  chat: ChatItem[];
  busy: boolean;
  controller: Controller;
}) {
  return (
    <scrollbox
      flexGrow={1}
      minHeight={0}
      width="100%"
      scrollY
      stickyScroll
      stickyStart="bottom"
      verticalScrollbarOptions={{ visible: false }}
    >
      {chat.map((it, i) => <ChatItemRow key={i} it={it} index={i} controller={controller} streaming={busy && i === chat.length - 1} />)}
    </scrollbox>
  );
}
