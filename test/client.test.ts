import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlbyClient } from '../src/client'
import type { EventPayload, Transport } from '../src/types'

const VALID_DSN = 'https://abcdef0123456789abcdef0123456789abcdef0123456789@alby.sh/ingest/v1/a195c5dc-01c3-46b3-9db4-b22334c179c9'

function makeFakeTransport() {
  const sent: EventPayload[] = []
  const transport: Transport = {
    send: vi.fn(async (payload) => { sent.push(payload) }),
    flush: vi.fn(async () => true),
  }
  return { transport, sent }
}

describe('AlbyClient', () => {
  let fake: ReturnType<typeof makeFakeTransport>
  let client: AlbyClient

  beforeEach(() => {
    fake = makeFakeTransport()
    client = new AlbyClient({ dsn: VALID_DSN, transport: fake.transport, autoRegister: false })
  })

  it('captures an Error with a parsed stack', () => {
    client.captureException(new TypeError('bad thing'))
    expect(fake.sent).toHaveLength(1)
    const ev = fake.sent[0]
    expect(ev.exception?.type).toBe('TypeError')
    expect(ev.exception?.value).toBe('bad thing')
    expect(ev.level).toBe('error')
    expect(ev.platform).toBe('browser')
    expect(ev.event_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('captures a message', () => {
    client.captureMessage('hello', 'warning')
    expect(fake.sent[0].message).toBe('hello')
    expect(fake.sent[0].level).toBe('warning')
    expect(fake.sent[0].exception).toBeUndefined()
  })

  it('attaches user / tags / contexts / breadcrumbs to each event', () => {
    client.setUser({ id: '42', email: 'a@b.c' })
    client.setTag('region', 'eu-west-3')
    client.setContext('app', { version: '1.2.3' })
    client.addBreadcrumb({ type: 'http', message: 'GET /' })

    client.captureMessage('boom')
    const ev = fake.sent[0]
    expect(ev.contexts?.user).toMatchObject({ id: '42', email: 'a@b.c' })
    expect(ev.tags).toMatchObject({ region: 'eu-west-3' })
    expect(ev.contexts).toMatchObject({ app: { version: '1.2.3' } })
    expect(ev.breadcrumbs?.length).toBe(1)
    expect((ev.contexts as { runtime?: { name: string } }).runtime?.name).toBe('browser')
  })

  it('respects sampleRate=0 (drops everything)', () => {
    const drop = new AlbyClient({
      dsn: VALID_DSN,
      transport: fake.transport,
      sampleRate: 0,
      autoRegister: false,
    })
    drop.captureMessage('nope')
    expect(fake.sent).toHaveLength(0)
  })

  it('includes release + environment when provided', () => {
    const c = new AlbyClient({
      dsn: VALID_DSN,
      transport: fake.transport,
      release: '1.2.3',
      environment: 'staging',
      autoRegister: false,
    })
    c.captureMessage('hello')
    expect(fake.sent[0].release).toBe('1.2.3')
    expect(fake.sent[0].environment).toBe('staging')
  })

  it('caps breadcrumbs at 100 (ring buffer)', () => {
    for (let i = 0; i < 150; i++) client.addBreadcrumb({ message: `b${i}` })
    client.captureMessage('later')
    const bs = fake.sent[0].breadcrumbs || []
    expect(bs.length).toBe(100)
    expect(bs[0].message).toBe('b50')
    expect(bs[bs.length - 1].message).toBe('b149')
  })

  it('clearing setUser(null) drops the user context', () => {
    client.setUser({ id: '42' })
    client.setUser(null)
    client.captureMessage('x')
    const contexts = fake.sent[0].contexts as { user?: unknown }
    expect(contexts.user).toBeUndefined()
  })

  it('setContext(key, null) removes an existing context', () => {
    client.setContext('app', { v: 1 })
    client.setContext('app', null)
    client.captureMessage('x')
    const contexts = fake.sent[0].contexts as Record<string, unknown>
    expect(contexts.app).toBeUndefined()
  })

  it('flush delegates to transport', async () => {
    await client.flush(50)
    expect(fake.transport.flush).toHaveBeenCalledWith(50)
  })

  it('throws without a DSN', () => {
    expect(() => new AlbyClient({ dsn: '' })).toThrow()
  })
})
