import type { ChatItem } from "../../controller/state";
import { ChatItemRow } from "./ChatItemRow";

// offset 0 mostra o fim do histórico; offset positivo revela linhas anteriores.
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
