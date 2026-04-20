// Public types for the Alby browser SDK. These mirror the wire protocol — see PROTOCOL_V1.md.

export type Level = 'debug' | 'info' | 'warning' | 'error' | 'fatal'

export interface StackFrame {
  filename?: string
  function?: string
  lineno?: number
  colno?: number
  pre_context?: string[]
  context_line?: string
  post_context?: string[]
}

export interface ExceptionPayload {
  type: string
  value?: string
  frames: StackFrame[]
}

export interface Breadcrumb {
  timestamp?: string
  type?: string
  category?: string
  message?: string
  data?: Record<string, unknown>
}

export interface UserContext {
  id?: string | number
  email?: string
  name?: string
  ip_address?: string
  [key: string]: unknown
}

export interface EventPayload {
  event_id?: string
  timestamp?: string
  platform?: string
  level?: Level
  release?: string
  environment?: string
  server_name?: string
  message?: string
  exception?: ExceptionPayload
  breadcrumbs?: Breadcrumb[]
  contexts?: Record<string, unknown> & { user?: UserContext }
  tags?: Record<string, string>
  extra?: Record<string, unknown>
}

export interface AlbyOptions {
  /** DSN string: https://<public_key>@alby.sh/ingest/v1/<app_id> */
  dsn: string
  release?: string
  environment?: string
  /** 0..1 — fraction of events that get sent. Default 1. */
  sampleRate?: number
  /** Set false to opt-out of auto-registered handlers (window.onerror, etc.). Default true. */
  autoRegister?: boolean
  /** Custom transport — mostly for tests. */
  transport?: Transport
  /** Emit internal diagnostics to console.error. Default false. */
  debug?: boolean
}

export interface Transport {
  send(payload: EventPayload, publicKey: string, ingestUrl: string): Promise<void>
  flush(timeoutMs: number): Promise<boolean>
}

export interface IngestResponse {
  ok?: boolean
  status?: 'new_issue' | 'regression' | 'accepted' | 'duplicate'
  issue_id?: string
  event_id?: string
  error?: string
  message?: string
}
