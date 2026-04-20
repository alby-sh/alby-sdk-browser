import { parseDsn, type ParsedDsn } from './dsn'
import { exceptionFromError } from './stack'
import { FetchTransport } from './transport'
import { detectBrowser, detectOs, detectDevice } from './context'
import { installAutoBreadcrumbs } from './breadcrumbs'
import type {
  AlbyOptions,
  Breadcrumb,
  EventPayload,
  Level,
  Transport,
  UserContext,
} from './types'

const MAX_BREADCRUMBS = 100

type ResolvedOptions = Required<Omit<AlbyOptions, 'transport'>> & { transport: Transport }

/**
 * The main Alby SDK client. Usually constructed via `Alby.init()` which stores
 * one as the default singleton.
 */
export class AlbyClient {
  private dsn: ParsedDsn
  private options: ResolvedOptions
  private user?: UserContext
  private tags: Record<string, string> = {}
  private contexts: Record<string, unknown> = {}
  private breadcrumbs: Breadcrumb[] = []
  private uninstallAutoBreadcrumbs?: () => void
  private uninstallGlobalHandlers?: () => void

  constructor(opts: AlbyOptions) {
    if (!opts || !opts.dsn) throw new Error('[alby] init: dsn is required')
    this.dsn = parseDsn(opts.dsn)
    const debug = opts.debug ?? false
    this.options = {
      dsn: opts.dsn,
      release: opts.release ?? '',
      environment: opts.environment ?? 'production',
      sampleRate: clamp01(opts.sampleRate ?? 1),
      autoRegister: opts.autoRegister ?? true,
      debug,
      transport: opts.transport ?? new FetchTransport({ debug }),
    }
  }

  captureException(err: unknown, overrides?: Partial<EventPayload>): string | undefined {
    return this.dispatch({
      ...overrides,
      exception: exceptionFromError(err),
      level: overrides?.level ?? 'error',
    })
  }

  captureMessage(message: string, level: Level = 'info'): string | undefined {
    return this.dispatch({ message, level })
  }

  setUser(user: UserContext | null): void {
    this.user = user ?? undefined
  }

  setTag(key: string, value: string): void {
    if (typeof key !== 'string' || typeof value !== 'string') return
    this.tags[key] = value
  }

  setContext(key: string, ctx: unknown): void {
    if (typeof key !== 'string') return
    if (ctx === undefined || ctx === null) delete this.contexts[key]
    else this.contexts[key] = ctx
  }

  addBreadcrumb(b: Breadcrumb): void {
    this.breadcrumbs.push({ timestamp: b.timestamp ?? new Date().toISOString(), ...b })
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) {
      this.breadcrumbs.splice(0, this.breadcrumbs.length - MAX_BREADCRUMBS)
    }
  }

  flush(timeoutMs = 2000): Promise<boolean> {
    return this.options.transport.flush(timeoutMs)
  }

  /** Install window.onerror / unhandledrejection / auto-breadcrumb handlers. */
  installAutoHandlers(): void {
    if (typeof window === 'undefined') return
    if (!this.uninstallAutoBreadcrumbs) {
      this.uninstallAutoBreadcrumbs = installAutoBreadcrumbs(this)
    }
    if (!this.uninstallGlobalHandlers) {
      const onError = (event: ErrorEvent) => {
        const err = event.error ?? new Error(event.message || 'Unknown error')
        this.captureException(err, { level: 'error' })
      }
      const onRejection = (event: PromiseRejectionEvent) => {
        this.captureException(event.reason, { level: 'error' })
      }
      window.addEventListener('error', onError)
      window.addEventListener('unhandledrejection', onRejection)
      this.uninstallGlobalHandlers = () => {
        window.removeEventListener('error', onError)
        window.removeEventListener('unhandledrejection', onRejection)
      }
    }
  }

  /** Teardown — mostly useful in tests. */
  uninstallAutoHandlers(): void {
    this.uninstallAutoBreadcrumbs?.()
    this.uninstallGlobalHandlers?.()
    this.uninstallAutoBreadcrumbs = undefined
    this.uninstallGlobalHandlers = undefined
  }

  private dispatch(partial: Partial<EventPayload>): string | undefined {
    if (Math.random() > this.options.sampleRate) return undefined

    const event_id = uuidv4()
    const payload: EventPayload = {
      event_id,
      timestamp: new Date().toISOString(),
      platform: 'browser',
      level: partial.level ?? 'error',
      release: this.options.release || undefined,
      environment: this.options.environment || undefined,
      message: partial.message,
      exception: partial.exception,
      breadcrumbs: this.breadcrumbs.length ? this.breadcrumbs.slice() : undefined,
      contexts: this.buildContexts(),
      tags: Object.keys(this.tags).length ? { ...this.tags } : undefined,
      extra: partial.extra,
    }

    void this.options.transport.send(payload, this.dsn.publicKey, this.dsn.ingestUrl)
    return event_id
  }

  private buildContexts(): Record<string, unknown> | undefined {
    const out: Record<string, unknown> = { ...this.contexts }
    if (this.user) out.user = { ...this.user }
    out.runtime = { name: 'browser' }
    const b = detectBrowser(); if (b) out.browser = b
    const os = detectOs(); if (os) out.os = os
    const d = detectDevice(); if (d) out.device = d
    return Object.keys(out).length ? out : undefined
  }
}

// ---- Global singleton convenience API ---------------------------------------

let defaultClient: AlbyClient | null = null

export const Alby = {
  init(opts: AlbyOptions): AlbyClient {
    defaultClient = new AlbyClient(opts)
    if (opts.autoRegister !== false) {
      defaultClient.installAutoHandlers()
    }
    return defaultClient
  },
  getClient(): AlbyClient | null {
    return defaultClient
  },
  captureException(err: unknown, overrides?: Partial<EventPayload>): string | undefined {
    return defaultClient?.captureException(err, overrides)
  },
  captureMessage(message: string, level?: Level): string | undefined {
    return defaultClient?.captureMessage(message, level)
  },
  setUser(user: UserContext | null): void {
    defaultClient?.setUser(user)
  },
  setTag(key: string, value: string): void {
    defaultClient?.setTag(key, value)
  },
  setContext(key: string, ctx: unknown): void {
    defaultClient?.setContext(key, ctx)
  },
  addBreadcrumb(b: Breadcrumb): void {
    defaultClient?.addBreadcrumb(b)
  },
  flush(timeoutMs?: number): Promise<boolean> {
    return defaultClient?.flush(timeoutMs) ?? Promise.resolve(true)
  },
}

// ---- Internals --------------------------------------------------------------

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(0, Math.min(1, n))
}

function uuidv4(): string {
  const g = globalThis as { crypto?: { randomUUID?(): string; getRandomValues?(b: Uint8Array): Uint8Array } }
  if (g.crypto?.randomUUID) {
    try { return g.crypto.randomUUID() } catch { /* fall through */ }
  }
  const bytes = new Uint8Array(16)
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex: string[] = []
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}
