export function createStreamThrottle(bump: () => void) {
  let lastBump = 0;
  return () => {
    const now = Date.now();
    if (now - lastBump < 33) return;
    lastBump = now;
    bump();
  };
}
