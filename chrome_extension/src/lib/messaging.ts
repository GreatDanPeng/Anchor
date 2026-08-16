// chrome.runtime.sendMessage rejects with "Could not establish connection.
// Receiving end does not exist." whenever the background service worker
// hasn't woken up yet to register its onMessage listener — MV3 workers are
// killed after ~30s idle and only relaunch on the next event, and the very
// message meant to wake one up can itself race that startup and be dropped.
// Every call site sending a message TO the background worker must go
// through this helper: firing chrome.runtime.sendMessage without awaiting/
// catching it means a rejection is invisible to the caller (it can't be
// caught by a surrounding try/catch since it isn't awaited), silently
// dropping the action the message was supposed to trigger while the caller
// goes on to report success.
const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 300

function isReceivingEndMissing(err: unknown): boolean {
  return err instanceof Error && err.message.includes('Receiving end does not exist')
}

export async function sendMessageWithRetry<T = unknown>(message: unknown): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return (await chrome.runtime.sendMessage(message)) as T
    } catch (err) {
      lastErr = err
      if (!isReceivingEndMissing(err) || attempt === RETRY_ATTEMPTS - 1) throw err
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    }
  }
  // Unreachable — the loop above always returns or throws.
  throw lastErr instanceof Error ? lastErr : new Error('Failed to reach the background service worker.')
}
