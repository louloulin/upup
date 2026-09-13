export interface PlatformSleepInput {
  readonly seconds: number;
  readonly reason?: string;
}

export const PLATFORM_SLEEP_DESCRIPTION = 'Pause execution for a bounded duration, optionally recording the reason.';

export async function platformSleep(input: PlatformSleepInput, signal?: AbortSignal): Promise<{ seconds: number; reason?: string; message: string }> {
  if (!Number.isFinite(input.seconds) || input.seconds < 0 || input.seconds > 3_600) {
    throw new Error('seconds must be between 0 and 3600');
  }
  if (input.seconds === 0) return { seconds: 0, ...(input.reason ? { reason: input.reason } : {}), message: 'No sleep requested (0 seconds).' };
  if (signal?.aborted) throw new Error('sleep aborted');
  const started = Date.now();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      signal?.removeEventListener('abort', abort);
      resolve();
    }, input.seconds * 1_000);
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new Error('sleep aborted'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
  const actualSeconds = Math.round((Date.now() - started) / 1_000);
  return {
    seconds: actualSeconds,
    ...(input.reason ? { reason: input.reason } : {}),
    message: `${actualSeconds === 0 ? input.seconds : actualSeconds} second(s) elapsed${input.reason ? `\nReason: ${input.reason}` : ''}.`,
  };
}
