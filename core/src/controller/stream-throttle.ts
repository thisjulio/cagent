export function createStreamThrottle(bump: () => void, intervalMs = 100) {
  let lastBump = 0;
  let pending = false;
  return () => {
    const now = Date.now();
    if (now - lastBump < intervalMs) {
      if (!pending) {
        pending = true;
        setTimeout(
          () => {
            pending = false;
            lastBump = Date.now();
            bump();
          },
          intervalMs - (now - lastBump),
        );
      }
      return;
    }
    lastBump = now;
    bump();
  };
}
