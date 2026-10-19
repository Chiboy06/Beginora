// Collects streamed tokens and hands them on in batches. Updating the chat
// store once per token re-rendered the chat screen 10-20 times a second and
// starved the JS thread, so taps (tabs, back, settings) stopped responding.

export interface TokenBatcher {
  push(token: string): void;
  // Drops pending text and cancels the scheduled flush (stream reset or turn end).
  reset(): void;
}

export const STREAM_FLUSH_MS = 80;

export function createTokenBatcher(flush: (text: string) => void, intervalMs = STREAM_FLUSH_MS): TokenBatcher {
  let pending = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    timer = null;
    if (!pending) return;
    const text = pending;
    pending = "";
    flush(text);
  };

  return {
    push(token) {
      pending += token;
      if (timer === null) timer = setTimeout(emit, intervalMs);
    },
    reset() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = "";
    },
  };
}
