# @alby/browser

[![npm version](https://img.shields.io/npm/v/@alby/browser.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/@alby/browser)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@alby/browser.svg?label=gzip)](https://bundlephobia.com/package/@alby/browser)
[![CI](https://github.com/alby-sh/alby-sdk-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/alby-sh/alby-sdk-browser/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Official [Alby](https://alby.sh) error-tracking SDK for web browsers. Tiny (< 10 KB gzipped IIFE),
zero runtime dependencies, works with a `<script>` tag or any bundler.

- Conforms to the [Alby Ingest Protocol v1](./PROTOCOL_V1.md).
- Captures uncaught exceptions (`window.onerror`) and unhandled promise
  rejections automatically.
- Auto-breadcrumbs: `click`, `fetch`, `XMLHttpRequest`, `console.error/warn`,
  `history` navigation.
- `sendBeacon` fallback on page unload so last-second errors aren't lost.
- Retry with exponential backoff (1s / 5s / 15s), respects `Retry-After`.
- TypeScript types shipped.

## Install

```sh
npm install @alby/browser
```

Or drop it on the page directly:

```html
<script src="https://unpkg.com/@alby/browser/dist/alby.iife.js"></script>
<script>
  Alby.init({
    dsn: 'https://<PUBLIC_KEY>@alby.sh/ingest/v1/<APP_ID>',
    release: '1.4.2',
    environment: 'production',
  })
</script>
```

## Usage (npm)

```js
import { Alby } from '@alby/browser'

Alby.init({
  dsn: 'https://<PUBLIC_KEY>@alby.sh/ingest/v1/<APP_ID>',
  release: '1.4.2',
  environment: 'production',
})

// Manual capture
try {
  doSomethingRisky()
} catch (err) {
  Alby.captureException(err)
}

// Scoped metadata
Alby.setUser({ id: 'u_412', email: 'ada@example.com' })
Alby.setTag('region', 'eu-west-3')
Alby.setContext('app', { route: '/checkout' })
Alby.addBreadcrumb({ category: 'auth', message: 'user signed in' })

// Before navigating away / in SPAs:
await Alby.flush(2000)
```

## API

| Method | Description |
|---|---|
| `Alby.init(options)` | Initialize the SDK. Required. |
| `Alby.captureException(err, overrides?)` | Send an exception event. Returns the `event_id`. |
| `Alby.captureMessage(msg, level?)` | Send a plain message event. |
| `Alby.setUser({ id, email, name, ip_address })` | Attach a user to every future event. Pass `null` to clear. |
| `Alby.setTag(key, value)` | Attach a low-cardinality string tag. |
| `Alby.setContext(key, obj)` | Attach free-form context. Pass `null` to clear. |
| `Alby.addBreadcrumb({ type, category, message, data })` | Append a breadcrumb (ring buffer, cap 100). |
| `Alby.flush(timeoutMs?)` | Wait for the in-flight queue to drain. |

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `dsn` | string | — | **Required.** `https://<PUBLIC_KEY>@<host>/ingest/v1/<APP_ID>` |
| `release` | string | `''` | Your app version, e.g. `"1.4.2"`. |
| `environment` | string | `"production"` | `production` / `staging` / `dev` / etc. |
| `sampleRate` | number | `1` | 0..1 — fraction of events actually sent. |
| `autoRegister` | boolean | `true` | Install `window.onerror`, `unhandledrejection`, auto-breadcrumbs. |
| `transport` | `Transport` | `FetchTransport` | For tests / custom transport. |
| `debug` | boolean | `false` | Log SDK-internal diagnostics to `console.error`. |

## Wire protocol

See [PROTOCOL_V1.md](./PROTOCOL_V1.md) for the full schema. In short, the SDK
`POST`s JSON events to `https://<host>/api/ingest/v1/events` with an
`X-Alby-Dsn: <public_key>` header, handles 429 `Retry-After`, and retries 5xx
with backoff. Every event carries a client-generated `event_id` (UUIDv4) so
retries are idempotent.

## Links

- Website: [alby.sh](https://alby.sh)
- Report issues: [GitHub Issues](https://github.com/alby-sh/alby-sdk-browser/issues)
- Other SDKs: [alby-sdk-js](https://github.com/alby-sh/alby-sdk-js) · [alby-sdk-php](https://github.com/alby-sh/alby-sdk-php) · [alby-sdk-python](https://github.com/alby-sh/alby-sdk-python)

## License

MIT © 2026 Alby
