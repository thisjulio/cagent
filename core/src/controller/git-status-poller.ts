import { getGitInfoAsync, type GitInfo } from "../gitinfo";

const POLL_INTERVAL_MS = 3000;

export function createGitStatusPoller(onUpdate: (info: GitInfo) => void): {
  start: () => () => void;
  refresh: () => Promise<void>;
} {
  let interval: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let polling = false;
  let refreshRequested = false;

  const refresh = async (): Promise<void> => {
    if (!running) return;
    if (polling) {
      refreshRequested = true;
      return;
    }
    polling = true;
    try {
      const info = await getGitInfoAsync(process.cwd());
      if (running) onUpdate(info);
    } finally {
      polling = false;
      if (running && refreshRequested) {
        refreshRequested = false;
        void refresh();
      }
    }
  };

  return {
    start: () => {
      running = true;
      void refresh();
      interval ??= setInterval(() => void refresh(), POLL_INTERVAL_MS);
      return () => {
        running = false;
        refreshRequested = false;
        if (interval) clearInterval(interval);
        interval = undefined;
      };
    },
    refresh,
  };
}
