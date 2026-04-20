import { describe, expect, it } from 'vitest'
import { DsnError, parseDsn } from '../src/dsn'

describe('parseDsn', () => {
  it('parses a standard DSN', () => {
    const d = parseDsn('https://abcdef0123456789abcdef0123456789abcdef0123456789@alby.sh/ingest/v1/a195c5dc-01c3-46b3-9db4-b22334c179c9')
    expect(d.publicKey).toBe('abcdef0123456789abcdef0123456789abcdef0123456789')
    expect(d.appId).toBe('a195c5dc-01c3-46b3-9db4-b22334c179c9')
    expect(d.host).toBe('alby.sh')
    expect(d.ingestUrl).toBe('https://alby.sh/api/ingest/v1/events')
    expect(d.envelopeUrl).toBe('https://alby.sh/api/ingest/v1/envelope')
  })

  it('accepts http:// for dev', () => {
    const d = parseDsn('http://abcdef0123456789abcdef0123456789abcdef0123456789@localhost:8000/ingest/v1/a195c5dc-01c3-46b3-9db4-b22334c179c9')
    expect(d.ingestUrl).toBe('http://localhost:8000/api/ingest/v1/events')
  })

  it('rejects empty input', () => {
    expect(() => parseDsn('')).toThrow(DsnError)
  })

  it('rejects malformed input', () => {
    expect(() => parseDsn('not a url')).toThrow(DsnError)
    expect(() => parseDsn('https://alby.sh/ingest/v1/abc')).toThrow(DsnError)
  })
})
