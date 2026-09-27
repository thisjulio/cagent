import { useEffect, useMemo, useRef, useState } from "react";
import { useRenderer } from "@opentui/react";
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
import { WelcomePanel } from "./WelcomePanel";
import { SessionInfoPanel } from "./SessionInfoPanel";
import { LspPanel } from "./LspPanel";
import { DiffPanel } from "./DiffPanel";
import { formatHeaderTitle } from "../render/title";
import { getHelpCatalog } from "../help-catalog";
import { CommandPalette } from "./CommandPalette";
import { ThemeProvider } from "../primitives/theme-context";
import { themeForTerminal, themes } from "../theme/themes";
import type { ThemeMode } from "../theme/types";
import { subscribeThemeMode } from "../theme/terminal";
import { useAppKeyboard } from "../app-keyboard";
import { createStreamThrottle } from "../../controller/stream-throttle";
export function App({
  c,
  mcpServerCount = 0,
}: {
  c: Controller;
  mcpServerCount?: number;
}) {
  const [, setV] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [terminalForeground, setTerminalForeground] = useState<string>();
  const renderer = useRenderer();
  const taskPanelRef = useRef<TaskPanelHandle>(null);

  useEffect(() => {
    c.bump = () => setV((v) => v + 1);
    c.setStreamBump(createStreamThrottle(() => c.bump()));
    return () => {
      c.bump = () => {};
      c.setStreamBump(() => {});
    };
  }, [c]);
  useEffect(
    () =>
      subscribeThemeMode(
        renderer,
        (mode) => {
          setThemeMode(mode);
        },
        (palette) =>
          setTerminalForeground(palette.defaultForeground ?? undefined),
      ),
    [renderer],
  );
  useAppKeyboard(c, renderer);
  const s = c.state;
  // ponytail: the catalog is rebuilt from scratch on every bump (each
  // keystroke); only build it when an overlay actually needs it.
  const helpOverlay = s.helpOpen || s.commandPaletteOpen;
  const helpItems = useMemo(
    () =>
      helpOverlay
        ? getHelpCatalog({
            customNames: c.customCommandNames(),
            pluginNames: c.pluginCommandNames(),
            skillNames: c.skillCommandNames(),
            agentNames: c.subagentNames(),
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [helpOverlay],
  );
  const pickerEntries = s.modelPicker?.entries;
  const pickerQuery = s.modelPicker?.query ?? "";
  // ponytail: single filter pass per query change instead of two per render.
  const modelRoutes = useMemo(
    () => (pickerEntries ? filterModels(pickerEntries, pickerQuery) : []),
    [pickerEntries, pickerQuery],
  );
  const toolViewerIndex = s.toolViewerIndex;
  const toolViewerTurnId = s.toolViewerTurnId;
  // ponytail: the chat scan only matters while the diff viewer is open.
  const diffTools = useMemo(
    () =>
      toolViewerIndex === null
        ? []
        : s.chat.filter(
            (item) =>
              item.kind === "tool" &&
              !item.running &&
              item.changesWorkspace === true &&
              (!toolViewerTurnId || item.turnId === toolViewerTurnId),
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolViewerIndex, toolViewerTurnId, s.chatVersion],
  );
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
    <ThemeProvider value={themeForTerminal(themeMode, terminalForeground)}>
      <box flexDirection="column" width="100%" height="100%">
        <box
          height={1}
          flexShrink={0}
          paddingX={1}
          flexDirection="row"
          justifyContent="space-between"
        >
          <text fg={themes[themeMode].color.accent}>
            {formatHeaderTitle(
              s.title
                ? `(${s.sessionId.slice(0, 6)}) | ${s.title}`
                : `(${s.sessionId.slice(0, 6)})`,
              terminalWidth(),
            )}
          </text>
          <text fg={themes[themeMode].color.text.muted}>
            {status === "permission" ? "waiting for approval" : status}
          </text>
        </box>
        {s.chat.length === 0 ? (
          <WelcomePanel
            project={process.cwd()}
            model={s.model}
            permissionMode={s.permissionMode}
            skillCount={c.skillCommandNames().length}
            agentCount={c.subagentNames().length}
            mcpCount={mcpServerCount}
          />
        ) : (
          <ChatViewport
            chat={s.chat}
            busy={s.busy}
            controller={c}
            version={s.chatVersion}
          />
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
            providerUsage={s.providerUsage}
            usageTotals={s.usageTotals}
            model={s.model}
            provider={s.model.split("/")[0] ?? ""}
            modelPrices={c.config.model_prices}
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
          <DiffPanel tools={diffTools} index={s.toolViewerIndex} />
        ) : s.sessionList ? (
          <SessionList
            list={s.sessionList}
            scope={s.sessionScope}
            query={s.sessionQuery}
            onSelect={(id) => c.resumeSession(id)}
          />
        ) : s.modelPicker ? (
          <ModelPicker
            routes={modelRoutes}
            query={s.modelPicker.query}
            selectedIndex={Math.min(
              s.modelPicker.selectedIndex ?? 0,
              Math.max(0, modelRoutes.length - 1),
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
        <StatusBar
          cwd={process.cwd()}
          model={s.model}
          variant={s.variant}
          tokens={s.tokens}
          contextWindow={s.contextWindow ?? s.threshold}
          permissionMode={s.permissionMode}
          permissionsEnabled={c.config.permissions !== false}
          missingLspLanguages={s.lspServers
            .filter((server) => server.status === "missing")
            .map((server) => server.language)}
        />
      </box>
    </ThemeProvider>
  );
}

function terminalWidth(): number {
  return Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
}
