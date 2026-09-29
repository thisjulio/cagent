export function createAssistantSnapshotWriter(
  persist: (content: string) => void,
  intervalMs = 1000,
  now: () => number = () => performance.now(),
): { update: (content: string) => void; flush: () => void } {
  let latest: string | undefined;
  let persisted: string | undefined;
  let lastWriteAt = Number.NEGATIVE_INFINITY;

  const write = (force: boolean): void => {
    if (latest === undefined || latest === persisted) return;
    const time = now();
    if (!force && time - lastWriteAt < intervalMs) return;
    persist(latest);
    persisted = latest;
    lastWriteAt = time;
  };

  return {
    update: (content) => {
      latest = content;
      write(false);
    },
    flush: () => write(true),
  };
}
