export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Media preparation was cancelled', 'AbortError');
}

/** Bound native media operations and detach the cancellation listener on every path. */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal, timeoutMs = 30_000): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => finish(() => reject(new DOMException('Media preparation was cancelled', 'AbortError')));
    const timer = setTimeout(() => finish(() => reject(new Error('Media preparation timed out'))), timeoutMs);
    let settled = false;
    function finish(action: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      action();
    }
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}

