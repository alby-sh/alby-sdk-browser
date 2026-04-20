// End-to-end smoke test: initialize Alby, capture an exception, and verify
// the backend accepts it with a 2xx response.
//
// Run:  npm run smoke
//
// We exercise the built ESM bundle against the live ingest endpoint. jsdom
// provides the minimal DOM the SDK expects; Node's native fetch handles HTTPS.

import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://smoke.local/' })
const assignGlobal = (name, value) => {
  try { globalThis[name] = value } catch {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }
}
assignGlobal('window', dom.window)
assignGlobal('document', dom.window.document)
assignGlobal('navigator', dom.window.navigator)
assignGlobal('location', dom.window.location)
assignGlobal('screen', dom.window.screen)
assignGlobal('history', dom.window.history)
assignGlobal('XMLHttpRequest', dom.window.XMLHttpRequest)

const nativeFetch = globalThis.fetch
if (!nativeFetch) {
  console.error('No global fetch available — need Node 18+')
  process.exit(1)
}

// Spy on fetch to surface the ingest HTTP status to this process.
let seenStatus = 0
let seenError = null
const origFetch = nativeFetch
const spyFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input)
  try {
    const res = await origFetch(input, init)
    if (url.includes('/ingest/v1/events')) {
      seenStatus = res.status
      console.log(`ingest fetch → ${res.status}`)
    }
    return res
  } catch (err) {
    if (url.includes('/ingest/v1/events')) {
      seenError = err
      console.log(`ingest fetch error: ${err && err.message}`)
    }
    throw err
  }
}
assignGlobal('fetch', spyFetch)
// Make sure window.fetch routes through the spy too (auto-breadcrumbs wrap it).
try { dom.window.fetch = spyFetch } catch { /* ignore */ }

const DSN = 'https://5e21bf08520734b6734b95f80af40cba6a7efc6cebddd0df@alby.sh/ingest/v1/a195c5dc-01c3-46b3-9db4-b22334c179c9'

const { Alby } = await import('../dist/alby.esm.js')

Alby.init({
  dsn: DSN,
  release: 'sdk-browser-e2e',
  environment: 'e2e',
  autoRegister: false,
  debug: true,
})

try {
  throw new Error('smoke-test: captured by @alby/browser e2e')
} catch (err) {
  Alby.captureException(err, { level: 'error' })
}

const ok = await Alby.flush(15000)
console.log('flushed:', ok, 'status:', seenStatus, 'err:', seenError && seenError.message)

if (seenError) {
  console.error('FAIL: network error hitting ingest:', seenError.message)
  process.exit(1)
}
if (!ok) {
  console.error('FAIL: flush timed out')
  process.exit(1)
}
if (seenStatus < 200 || seenStatus >= 300) {
  console.error(`FAIL: expected 2xx, got ${seenStatus}`)
  process.exit(1)
}

console.log(`OK: backend responded ${seenStatus}`)
process.exit(0)
