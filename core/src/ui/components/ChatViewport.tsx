import type { ChatItem } from "../../controller/state";
import { ChatItemRow } from "./ChatItemRow";

// Offset 0 shows the end of the history; a positive offset reveals earlier lines.
export function ChatViewport({
  chat,
  busy,
}: {
  chat: ChatItem[];
  busy: boolean;
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
      {chat.map((it, i) => <ChatItemRow key={i} it={it} streaming={busy && i === chat.length - 1} />)}
    </scrollbox>
  );
}
