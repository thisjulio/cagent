import { useEffect, useRef, useState } from "react";
import { TextAttributes, type KeyEvent } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { Controller } from "../../controller/controller";
import { filterModels } from "../../fuzzy";
import { ChatViewport } from "./ChatViewport";
import { HelpBox } from "./HelpBox";
import { ModelPicker } from "./ModelPicker";
import { PendingAsk } from "./PendingAsk";
import { SessionList } from "./SessionList";
import { StatusBar } from "./StatusBar";
import { InputArea } from "./InputArea";
import { TaskPanel, type TaskPanelHandle } from "./TaskPanel";
import { QuestionPanel } from "./QuestionPanel";
import { ProjectContext } from "./ProjectContext";
import { WelcomePanel } from "./WelcomePanel";
import { SessionInfoPanel } from "./SessionInfoPanel";
import { LspPanel } from "./LspPanel";
import { DiffPanel } from "./DiffPanel";
import { formatHeaderTitle } from "../render/title";
import { getHelpCatalog } from "../help-catalog";
import { CommandPalette } from "./CommandPalette";
export function App({ c }: { c: Controller }) {
  const [, setV] = useState(0);
  const renderer = useRenderer();
  const taskPanelRef = useRef<TaskPanelHandle>(null);

  useEffect(() => {
    c.bump = () => setV((v) => v + 1);
    return () => {
      c.bump = () => {};
    };
  }, [c]);
  useKeyboard((key: KeyEvent) => {
    const s = c.state;
    const input = key.sequence || (key.name === "space" ? " " : "");
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
    if (
      (key.name === "up" || key.name === "down") &&
      s.historySearch &&
      !s.sessionList &&
      !s.modelPicker &&
      !s.questionRequest &&
      !s.pendingAsk
    ) {
      c.handleKey(
        { upArrow: key.name === "up", downArrow: key.name === "down" },
        input,
      );
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "r" && !s.sessionList) {
      s.historySearch = true;
      s.historyIdx = -1;
      s.historyEntries = c.historyEntries(s.input);
      s.inputKey += 1;
      c.bump();
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "p") {
      c.openCommandPalette();
      key.preventDefault();
      return;
    }
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
      } else {
        renderer.destroy();
        process.exit(130);
      }
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "m") {
      if (c.config.permissions !== false) c.cyclePermissionMode();
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
    if (key.ctrl && key.shift && key.name === "c" && renderer.hasSelection) {
      const selected = renderer.getSelection()?.getSelectedText() ?? "";
      c.observability?.recordEvent("clipboard.copy", {
        "text.length": selected.length,
        success: Boolean(selected),
      });
      if (selected) renderer.copyToClipboardOSC52(selected);
      key.preventDefault();
      return;
    }
    if (key.name === "tab") {
      c.handleKey({ tab: true }, "\t");
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "o") {
      if (key.shift) {
        if (s.toolViewerIndex !== null)
          c.openToolViewer("backward", s.toolViewerTurnId);
      } else if (s.toolViewerIndex !== null) {
        c.openToolViewer("forward", s.toolViewerTurnId);
      } else {
        const tools = s.chat.filter(
          (item) =>
            item.kind === "tool" &&
            !item.running &&
            item.changesWorkspace === true &&
            (!s.toolViewerTurnId || item.turnId === s.toolViewerTurnId),
        );
        if (tools.length) c.openToolViewer("forward", s.currentTurnId);
        else c.handleKey({ ctrl: true }, "o");
      }
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "t") {
      c.state.taskPanelExpanded = !c.state.taskPanelExpanded;
      c.bump();
      key.preventDefault();
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
    if (key.name === "escape") {
      c.observability?.recordEvent("keyboard.escape", {
        busy: s.busy,
        overlay: Boolean(overlay),
      });
      c.handleKey({ escape: true }, input);
      key.preventDefault();
      return;
    }
    if (key.name === "pageup" || key.name === "pagedown") {
      key.preventDefault();
      return;
    }
    if (s.pendingAsk) {
      c.handleKey({}, input);
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
    if (s.modelPicker && key.name === "backspace") {
      c.handleKey({ backspace: true }, "");
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
  });
  const s = c.state;
  const helpItems = getHelpCatalog({
    customNames: c.customCommandNames(),
    pluginNames: c.pluginCommandNames(),
    skillNames: c.skillCommandNames(),
    agentNames: c.subagentNames(),
  });
  const lastLog = s.toolLog[s.toolLog.length - 1];
  const running = lastLog?.running ? lastLog.tool : undefined;
  const overlay =
    s.helpOpen ||
    s.infoPanel ||
    s.lspPanel ||
    s.toolViewerIndex !== null ||
    s.modelPicker ||
    s.sessionList ||
    s.pendingAsk ||
    s.questionRequest;
  const status = s.compacting
    ? "compacting"
    : s.pendingAsk
      ? "permission"
      : s.busy
        ? "working"
        : "ready";
  return (
    <box flexDirection="column" width="100%" height="100%">
      <box
        height={1}
        flexShrink={0}
        paddingX={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text fg="#d97757">
          {formatHeaderTitle(
            s.title
              ? `(${s.sessionId.slice(0, 6)}) | ${s.title}`
              : `(${s.sessionId.slice(0, 6)})`,
            terminalWidth(),
          )}
        </text>
        <text fg="#777777">{status}</text>
      </box>
      {s.chat.length === 0 ? (
        <WelcomePanel
          project={process.cwd()}
          model={s.model}
          permissionMode={s.permissionMode}
          skillCount={c.skillCommandNames().length}
          agentCount={c.subagentNames().length}
          mcpCount={c.registry.providers().size}
        />
      ) : (
        <ChatViewport chat={s.chat} busy={s.busy} controller={c} />
      )}
      <TaskPanel
        ref={taskPanelRef}
        tasks={s.tasks}
        expanded={s.taskPanelExpanded}
      />
      {s.helpOpen ? (
        <HelpBox topic={s.helpTopic} items={helpItems} />
      ) : s.commandPaletteOpen ? (
        <CommandPalette controller={c} items={helpItems} />
      ) : s.infoPanel ? (
        <SessionInfoPanel
          kind={s.infoPanel}
          chat={s.chat}
          tokens={s.tokens}
          inputTokens={s.inputTokens}
          outputTokens={s.outputTokens}
          cacheReadTokens={s.cacheReadTokens}
          cacheCreationTokens={s.cacheCreationTokens}
          providerUsage={s.providerUsage}
          model={s.model}
          sessionId={s.sessionId}
          telemetryEnabled={Boolean(c.observability)}
          telemetrySummary={s.telemetrySummary}
          contextWindow={s.contextWindow}
          timeToFirstTokenMs={s.lastTurnTimeToFirstTokenMs}
          tokensPerSecond={s.lastTurnTokensPerSecond}
          promptTokensCached={s.lastTurnPromptTokensCached}
        />
      ) : s.lspPanel ? (
        <LspPanel servers={s.lspServers} />
      ) : s.toolViewerIndex !== null ? (
        <DiffPanel
          tools={s.chat.filter(
            (item) =>
              item.kind === "tool" &&
              !item.running &&
              item.changesWorkspace === true &&
              (!s.toolViewerTurnId || item.turnId === s.toolViewerTurnId),
          )}
          index={s.toolViewerIndex}
        />
      ) : s.sessionList ? (
        <SessionList
          list={s.sessionList}
          scope={s.sessionScope}
          query={s.sessionQuery}
          onSelect={(id) => c.resumeSession(id)}
        />
      ) : s.modelPicker ? (
        <ModelPicker
          routes={filterModels(s.modelPicker.entries, s.modelPicker.query)}
          query={s.modelPicker.query}
          selectedIndex={Math.min(
            s.modelPicker.selectedIndex ?? 0,
            Math.max(
              0,
              filterModels(s.modelPicker.entries, s.modelPicker.query).length -
                1,
            ),
          )}
          onSelect={(route) => void c.pickModel(route)}
        />
      ) : s.questionRequest ? (
        <QuestionPanel
          request={s.questionRequest}
          selectedOption={s.questionSelectedOption}
          textAnswer={s.questionTextAnswer}
          otherMode={s.questionOtherMode}
          questionIndex={s.questionIndex}
          selectedOptions={s.questionSelectedOptions}
        />
      ) : s.pendingAsk ? (
        <PendingAsk ask={s.pendingAsk} />
      ) : (
        <InputArea
          input={s.input}
          inputKey={s.inputKey}
          busy={s.busy}
          running={running}
          suggest={s.suggest}
          active={!overlay}
          onChange={(v) => c.setInput(v)}
          onSubmit={(v) => c.submit(v)}
          onClipboard={(_, length, success) =>
            c.observability?.recordEvent("clipboard.paste", {
              "text.length": length,
              success,
            })
          }
          onUpArrow={() => {
            c.handleKey({ upArrow: true }, "");
            return c.state.input || undefined;
          }}
        />
      )}
      <ProjectContext cwd={process.cwd()} />
      <StatusBar
        model={s.model}
        variant={s.variant}
        tokens={s.tokens}
        tokensPerSecond={s.lastTurnTokensPerSecond}
        inputTokens={s.inputTokens}
        outputTokens={s.outputTokens}
        contextWindow={s.contextWindow ?? s.threshold}
        threshold={s.threshold}
        permissionMode={s.permissionMode}
        permissionsEnabled={c.config.permissions !== false}
        missingLspLanguages={s.lspServers
          .filter((server) => server.status === "missing")
          .map((server) => server.language)}
        onOpenLsp={() => void c.openLspDoctor()}
      />
    </box>
  );
}

function terminalWidth(): number {
  return Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
}

function isPrintable(input: string): boolean {
  return (
    input.length > 0 &&
    !/[\x00-\x1f\x7f]/.test(input) &&
    !input.startsWith("\x1b")
  );
}
