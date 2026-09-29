import { useRef } from "react";
import type { KeyEvent, CliRenderer } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { Controller } from "../controller/controller";
import { getHelpCatalog } from "./help-catalog";
import { filterModels } from "../fuzzy";

export function useAppKeyboard(c: Controller, renderer: CliRenderer): void {
  const escapeArmed = useRef(false);
  const ctrlCArmed = useRef(false);

  useKeyboard((key: KeyEvent) => {
    const s = c.state;
    const input = key.sequence || (key.name === "space" ? " " : "");
    const overlay =
      s.helpOpen ||
      s.commandPaletteOpen ||
      s.infoPanel ||
      s.lspPanel ||
      s.toolViewerIndex !== null ||
      s.modelPicker ||
      s.sessionList ||
      s.pendingAsk ||
      s.questionRequest;
    if (s.commandPaletteOpen) {
      const items = getHelpCatalog({
        customNames: c.customCommandNames(),
        pluginNames: c.pluginCommandNames(),
        skillNames: c.skillCommandNames(),
        agentNames: c.subagentNames(),
      }).filter((item) =>
        `${item.name} ${item.description}`
          .toLowerCase()
          .includes(s.commandPaletteQuery.toLowerCase()),
      );
      if (key.name === "escape") c.closeCommandPalette();
      else if (key.name === "up") {
        s.commandPaletteIndex = items.length
          ? (s.commandPaletteIndex + items.length - 1) % items.length
          : 0;
        c.bump();
      } else if (key.name === "down") {
        s.commandPaletteIndex = items.length
          ? (s.commandPaletteIndex + 1) % items.length
          : 0;
        c.bump();
      } else if (key.name === "return") {
        const item = items[s.commandPaletteIndex];
        c.closeCommandPalette();
        if (item && item.name.startsWith("/")) void c.submit(item.name);
      } else if (key.name === "backspace") {
        s.commandPaletteQuery = s.commandPaletteQuery.slice(0, -1);
        s.commandPaletteIndex = 0;
        c.bump();
      } else if (input && !key.ctrl && !key.meta) {
        s.commandPaletteQuery += input;
        s.commandPaletteIndex = 0;
        c.bump();
      }
      key.preventDefault();
      return;
    }
    if (s.toolViewerIndex !== null) {
      if (key.ctrl && key.name.toLowerCase() === "o") {
        c.openToolViewer(
          key.shift ? "backward" : "forward",
          s.toolViewerTurnId,
        );
      } else if (key.name === "pageup" || key.name === "pagedown") {
        renderer.emit(
          "cagent:panel-page-scroll",
          key.name === "pageup" ? -1 : 1,
        );
      } else if (key.name === "escape") {
        c.handleKey({ escape: true }, input);
      }
      key.preventDefault();
      return;
    }
    if (s.pendingAsk) {
      if (key.name === "escape") c.handleKey({ escape: true }, input);
      else if (input && !key.ctrl && !key.meta) c.handleKey({}, input);
      key.preventDefault();
      return;
    }
    if (s.sessionList) {
      if (
        key.name === "escape" ||
        key.name === "tab" ||
        key.name === "backspace" ||
        (isPrintable(input) && !key.ctrl && !key.meta)
      ) {
        c.handleKey(
          {
            escape: key.name === "escape",
            tab: key.name === "tab",
            backspace: key.name === "backspace",
          },
          input,
        );
        key.preventDefault();
      }
      return;
    }
    if (s.questionRequest) {
      c.handleKey(
        {
          escape: key.name === "escape",
          upArrow: key.name === "up",
          downArrow: key.name === "down",
          leftArrow: key.name === "left",
          return: key.name === "return",
          backspace: key.name === "backspace",
        },
        input,
      );
      key.preventDefault();
      return;
    }
    if (s.modelPicker) {
      c.handleKey(
        {
          escape: key.name === "escape",
          upArrow: key.name === "up",
          downArrow: key.name === "down",
          return: key.name === "return",
          backspace: key.name === "backspace",
        },
        isPrintable(input) && !key.ctrl && !key.meta ? input : "",
      );
      key.preventDefault();
      return;
    }
    if (s.infoPanel || s.lspPanel || s.helpOpen) {
      if (key.name === "escape") {
        c.handleKey({ escape: true }, input);
      } else if (s.helpOpen && key.ctrl && key.name === "p") {
        s.helpOpen = false;
        c.openCommandPalette();
      } else if (key.name === "pageup" || key.name === "pagedown") {
        renderer.emit(
          "cagent:panel-page-scroll",
          key.name === "pageup" ? -1 : 1,
        );
      } else {
        return;
      }
      key.preventDefault();
      return;
    }
    if (s.historySearch && (key.name === "up" || key.name === "down")) {
      c.handleKey(
        { upArrow: key.name === "up", downArrow: key.name === "down" },
        input,
      );
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "r" && !overlay) {
      s.historySearch = true;
      s.historyIdx = -1;
      s.historyEntries = c.historyEntries(s.input);
      s.inputKey += 1;
      c.bump();
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "p" && !overlay) {
      c.openCommandPalette();
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "o" && !overlay) {
      c.toggleToolExpand();
      key.preventDefault();
      return;
    }
    if (key.name === "escape" && !s.busy && s.input.length > 0) {
      if (!escapeArmed.current) {
        escapeArmed.current = true;
        key.preventDefault();
        return;
      }
      c.setInput("");
      s.inputKey += 1;
      escapeArmed.current = false;
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "c" && !key.shift && !overlay) {
      c.observability?.recordEvent("keyboard.ctrl_c", {
        busy: s.busy,
        cleared_input: s.input.length > 0,
        session_id: s.sessionId,
      });
      if (s.busy) {
        c.interrupt();
      } else if (s.input.length > 0) {
        c.setInput("");
        s.inputKey += 1;
        ctrlCArmed.current = false;
      } else {
        if (!ctrlCArmed.current) {
          ctrlCArmed.current = true;
          c.bump();
          key.preventDefault();
          return;
        }
        renderer.destroy();
        process.exit(130);
      }
      key.preventDefault();
      return;
    }
    if (
      (key.sequence === "\u001b[Z" || (key.name === "tab" && key.shift)) &&
      !overlay
    ) {
      c.cyclePermissionMode();
      key.preventDefault();
      return;
    }
    if (key.sequence === "?" && !key.ctrl && !overlay && !s.busy && !s.input) {
      c.submit("/help");
      s.helpOpen = true;
      s.helpTopic = undefined;
      c.bump();
      key.preventDefault();
      return;
    }
    if (
      !overlay &&
      key.ctrl &&
      key.shift &&
      key.name === "c" &&
      renderer.hasSelection
    ) {
      const selected = renderer.getSelection()?.getSelectedText() ?? "";
      c.observability?.recordEvent("clipboard.copy", {
        "text.length": selected.length,
        success: Boolean(selected),
      });
      if (selected) renderer.copyToClipboardOSC52(selected);
      key.preventDefault();
      return;
    }
    if (key.name === "tab" && !overlay) {
      c.handleKey({ tab: true }, "\t");
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "t" && !overlay) {
      c.state.taskPanelExpanded = !c.state.taskPanelExpanded;
      c.bump();
      key.preventDefault();
      return;
    }
    if (key.name === "escape") {
      c.observability?.recordEvent("keyboard.escape", {
        busy: s.busy,
        overlay: Boolean(overlay),
      });
      c.handleKey({ escape: true }, input);
      key.preventDefault();
      return;
    }
    if ((key.name === "pageup" || key.name === "pagedown") && !overlay) {
      renderer.emit("cagent:page-scroll", key.name === "pageup" ? -1 : 1);
      key.preventDefault();
      return;
    }
    if (key.name === "end" && !overlay && !renderer.currentFocusedEditor) {
      renderer.emit("cagent:follow-transcript");
      key.preventDefault();
      return;
    }
    if (s.historySearch) {
      if (
        key.name === "return" ||
        key.name === "backspace" ||
        (isPrintable(input) && !key.ctrl && !key.meta)
      ) {
        c.handleKey(
          {
            return: key.name === "return",
            backspace: key.name === "backspace",
          },
          input,
        );
        key.preventDefault();
        return;
      }
    }
  });
}

function isPrintable(input: string): boolean {
  return (
    input.length > 0 &&
    !/[\x00-\x1f\x7f]/.test(input) &&
    !input.startsWith("\x1b")
  );
}
