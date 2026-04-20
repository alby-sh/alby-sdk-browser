// Parse a DSN string into its two interesting components.
// Format: https://<public_key>@<host>/ingest/v1/<app_id>

export interface ParsedDsn {
  publicKey: string
  appId: string
  host: string
  /** Full ingest URL: https://<host>/api/ingest/v1/events */
  ingestUrl: string
  /** Envelope URL for batches. */
  envelopeUrl: string
}

export class DsnError extends Error {
  constructor(message: string) {
    super(`[alby] invalid DSN: ${message}`)
    this.name = 'DsnError'
  }
}

const DSN_RE = /^https?:\/\/([A-Za-z0-9]{16,})@([^/]+)\/ingest\/v1\/([0-9a-f-]{8,})\/?$/i

export function parseDsn(dsn: string): ParsedDsn {
  if (typeof dsn !== 'string' || dsn.length === 0) {
    throw new DsnError('empty')
  }
  const m = DSN_RE.exec(dsn.trim())
  if (!m) {
    throw new DsnError('unrecognised format. Expected https://<key>@<host>/ingest/v1/<app-id>')
  }
  const [, publicKey, host, appId] = m
  const protocol = dsn.toLowerCase().startsWith('http://') ? 'http' : 'https'
  return {
    publicKey,
    appId,
    host,
    ingestUrl: `${protocol}://${host}/api/ingest/v1/events`,
    envelopeUrl: `${protocol}://${host}/api/ingest/v1/envelope`,
  }
}
