import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";

export function Scrollable({ children }: { children: ReactNode }) {
  const scrollbox = useRef<ScrollBoxRenderable>(null);
  const renderer = useRenderer();
  useEffect(() => {
    const onPageScroll = (direction: -1 | 1) =>
      scrollbox.current?.scrollBy(direction, "viewport");
    renderer.on("cagent:panel-page-scroll", onPageScroll);
    return () => {
      renderer.off("cagent:panel-page-scroll", onPageScroll);
    };
  }, [renderer]);

  return (
    <scrollbox
      ref={scrollbox}
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      height="100%"
      scrollY
      verticalScrollbarOptions={{ visible: false }}
    >
      {children}
    </scrollbox>
  );
}
