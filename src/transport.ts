import type { EventPayload, Transport } from './types'

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RETRY_DELAYS_MS = [1_000, 5_000, 15_000]
const QUEUE_HARD_CAP = 100

/**
 * Browser HTTP transport: fetch-based with retry + exponential backoff, bounded
 * in-memory queue, and a sendBeacon fallback on page unload.
 */
export class FetchTransport implements Transport {
  private inFlight = new Set<Promise<unknown>>()
  private debug: boolean
  private retryDelays: number[]
  private unloadHooked = false
  /** Last-known DSN/ingestUrl so `flushPending` (unload) can use sendBeacon. */
  private ingestUrl = ''
  private publicKey = ''
  /** Serialized payloads that never made it past the first attempt — flushed via sendBeacon. */
  private pendingBeacons: string[] = []

  constructor(opts: { debug?: boolean; retryDelays?: number[] } = {}) {
    this.debug = opts.debug ?? false
    this.retryDelays = opts.retryDelays ?? DEFAULT_RETRY_DELAYS_MS
    this.installUnloadHook()
  }

  async send(payload: EventPayload, publicKey: string, ingestUrl: string): Promise<void> {
    if (this.inFlight.size >= QUEUE_HARD_CAP) {
      this.log('queue full, dropping event')
      return
    }
    this.publicKey = publicKey
    this.ingestUrl = ingestUrl
    const body = JSON.stringify(payload)
    this.pendingBeacons.push(body)

    const task = this.doSend(body, publicKey, ingestUrl)
      .finally(() => {
        this.inFlight.delete(task)
        const idx = this.pendingBeacons.indexOf(body)
        if (idx >= 0) this.pendingBeacons.splice(idx, 1)
      })
    this.inFlight.add(task)
    void task.catch(() => {})
  }

  async flush(timeoutMs: number): Promise<boolean> {
    if (this.inFlight.size === 0) return true
    const pending = Array.from(this.inFlight)
    const timeout = new Promise<boolean>(resolve => setTimeout(() => resolve(false), timeoutMs))
    const settled = Promise.allSettled(pending).then(() => true)
    return Promise.race([settled, timeout])
  }

  private async doSend(body: string, publicKey: string, ingestUrl: string): Promise<void> {
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
        const t = controller ? setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS) : undefined

        let response: Response
        try {
          response = await fetch(ingestUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Alby-Dsn': publicKey,
            },
            body,
            keepalive: true,
            signal: controller?.signal,
          })
        } finally {
          if (t) clearTimeout(t)
        }

        if (response.status === 429) {
          const after = Number(response.headers.get('retry-after') ?? '1')
          if (attempt < this.retryDelays.length) {
            await sleep(Math.max(1000, after * 1000))
            continue
          }
          this.log('rate-limited, giving up')
          return
        }
        if (response.ok) {
          this.log('sent')
          return
        }
        if (response.status >= 500) {
          if (attempt < this.retryDelays.length) {
            await sleep(this.retryDelays[attempt])
            continue
          }
        }
        // 4xx (non-429): drop silently.
        this.log(`dropped: HTTP ${response.status}`)
        return
      } catch (err) {
        if (attempt < this.retryDelays.length) {
          await sleep(this.retryDelays[attempt])
          continue
        }
        this.log(`giving up: ${String(err)}`)
        return
      }
    }
  }

  private installUnloadHook(): void {
    if (this.unloadHooked) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const flushPending = () => {
      if (!this.pendingBeacons.length || !this.ingestUrl) return
      const nav = typeof navigator !== 'undefined' ? navigator : undefined
      for (const body of this.pendingBeacons.splice(0)) {
        try {
          if (nav && typeof nav.sendBeacon === 'function') {
            const blob = new Blob([body], { type: 'application/json' })
            // sendBeacon doesn't let us set custom headers, fall back to query-string auth.
            const sep = this.ingestUrl.includes('?') ? '&' : '?'
            nav.sendBeacon(`${this.ingestUrl}${sep}alby_key=${encodeURIComponent(this.publicKey)}`, blob)
          } else {
            // Last resort: fire-and-forget fetch with keepalive.
            void fetch(this.ingestUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Alby-Dsn': this.publicKey },
              body,
              keepalive: true,
            }).catch(() => {})
          }
        } catch {
          // ignore — we're unloading
        }
      }
    }
    try {
      window.addEventListener('beforeunload', flushPending)
      window.addEventListener('pagehide', flushPending)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPending()
      })
      this.unloadHooked = true
    } catch {
      // ignore
    }
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.error('[alby]', ...args)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
