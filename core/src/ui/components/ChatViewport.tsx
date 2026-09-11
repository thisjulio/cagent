import { useRef } from "react";
import { Box, useBoxMetrics, type DOMElement } from "ink";
import type { ChatItem } from "../../controller/state";
import { chatHeight } from "../mouse";
import { ChatItemRow } from "./ChatItemRow";

// offset 0 mostra o fim do histórico; offset positivo revela linhas anteriores.
export function ChatViewport({
  chat,
  offset,
  busy,
}: {
  chat: ChatItem[];
  offset: number;
  busy: boolean;
}) {
  const H_CHAT = chatHeight();
  const contentRef = useRef<DOMElement | null>(null);
  const { height: contentHeight } = useBoxMetrics(contentRef);
  const maxOffset = Math.max(0, contentHeight - H_CHAT);
  const top = -Math.max(0, maxOffset - Math.max(0, offset));
  return (
    <Box height={H_CHAT} flexDirection="column" width="100%" overflow="hidden">
      <Box ref={contentRef} flexDirection="column" width="100%" flexShrink={0} marginTop={top}>
        {chat.map((it, i) => (
          <ChatItemRow key={i} it={it} streaming={busy && i === chat.length - 1} />
        ))}
      </Box>
    </Box>
  );
}
