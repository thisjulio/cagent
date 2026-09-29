import { getGitInfoAsync, type GitInfo } from "../gitinfo";

const POLL_INTERVAL_MS = 3000;

export function createGitStatusPoller(onUpdate: (info: GitInfo) => void): {
  start: () => () => void;
  refresh: () => Promise<void>;
} {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let polling = false;
  let refreshRequested = false;
  let lastInfo: GitInfo | undefined;

  const schedule = (durationMs: number): void => {
    timeout = setTimeout(
      () => {
        timeout = undefined;
        void refresh();
      },
      Math.max(POLL_INTERVAL_MS, durationMs),
    );
  };

  const refresh = async (): Promise<void> => {
    if (!running) return;
    if (polling) {
      refreshRequested = true;
      return;
    }
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
    polling = true;
    const startedAt = performance.now();
    try {
      const info = await getGitInfoAsync(process.cwd());
      if (running && !sameGitInfo(info, lastInfo)) {
        lastInfo = info;
        onUpdate(info);
      }
    } finally {
      polling = false;
      if (running && refreshRequested) {
        refreshRequested = false;
        void refresh();
      } else if (running) {
        schedule(performance.now() - startedAt);
      }
    }
  };

  return {
    start: () => {
      running = true;
      void refresh();
      return () => {
        running = false;
        refreshRequested = false;
        if (timeout) clearTimeout(timeout);
        timeout = undefined;
      };
    },
    refresh,
  };
}

function sameGitInfo(a: GitInfo, b: GitInfo | undefined): boolean {
  return (
    a === b ||
    (!!b &&
      a.branch === b.branch &&
      a.ahead === b.ahead &&
      a.behind === b.behind &&
      a.dirty === b.dirty &&
      a.isRepo === b.isRepo)
  );
}
