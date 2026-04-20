import type { Breadcrumb } from './types'

export interface BreadcrumbSink {
  addBreadcrumb(b: Breadcrumb): void
}

/**
 * Install auto-breadcrumb collectors: click, fetch, XHR, console, history.
 * Returns a function that tears them all down (mostly useful in tests).
 */
export function installAutoBreadcrumbs(sink: BreadcrumbSink): () => void {
  if (typeof window === 'undefined') return () => {}
  const teardown: Array<() => void> = []

  // ---- Click (capture phase, delegated on document) --------------------------
  try {
    const onClick = (e: Event): void => {
      const t = e.target as Element | null
      if (!t) return
      sink.addBreadcrumb({
        type: 'ui',
        category: 'click',
        message: describeElement(t),
      })
    }
    document.addEventListener('click', onClick, { capture: true, passive: true })
    teardown.push(() => document.removeEventListener('click', onClick, true))
  } catch { /* ignore */ }

  // ---- fetch -----------------------------------------------------------------
  try {
    const origFetch = window.fetch
    if (origFetch) {
      const wrapped: typeof fetch = function (input: RequestInfo | URL, init?: RequestInit) {
        const method = (init?.method || (typeof input !== 'string' && 'method' in (input as Request) ? (input as Request).method : 'GET')).toUpperCase()
        const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input as Request).url)
        const started = now()
        return origFetch.call(window, input as RequestInfo, init).then(
          (res) => {
            sink.addBreadcrumb({
              type: 'http',
              category: 'fetch',
              message: `${method} ${url}`,
              data: { status: res.status, duration_ms: Math.round(now() - started) },
            })
            return res
          },
          (err) => {
            sink.addBreadcrumb({
              type: 'http',
              category: 'fetch',
              message: `${method} ${url}`,
              data: { error: String(err), duration_ms: Math.round(now() - started) },
            })
            throw err
          },
        )
      }
      window.fetch = wrapped
      teardown.push(() => { window.fetch = origFetch })
    }
  } catch { /* ignore */ }

  // ---- XMLHttpRequest --------------------------------------------------------
  try {
    const XHR: typeof XMLHttpRequest | undefined = window.XMLHttpRequest
    if (XHR && XHR.prototype) {
      const origOpen = XHR.prototype.open
      const origSend = XHR.prototype.send
      XHR.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ..._rest: unknown[]) {
        ;(this as unknown as { __alby?: { method: string; url: string; started: number } }).__alby = {
          method: String(method).toUpperCase(),
          url: String(url),
          started: 0,
        }
        return (origOpen as unknown as (...a: unknown[]) => void).apply(this, [method, url, ..._rest] as unknown[])
      } as typeof XMLHttpRequest.prototype.open
      XHR.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
        const meta = (this as unknown as { __alby?: { method: string; url: string; started: number } }).__alby
        if (meta) {
          meta.started = now()
          this.addEventListener('loadend', () => {
            sink.addBreadcrumb({
              type: 'http',
              category: 'xhr',
              message: `${meta.method} ${meta.url}`,
              data: { status: this.status, duration_ms: Math.round(now() - meta.started) },
            })
          })
        }
        return origSend.call(this, body as XMLHttpRequestBodyInit)
      }
      teardown.push(() => {
        XHR.prototype.open = origOpen
        XHR.prototype.send = origSend
      })
    }
  } catch { /* ignore */ }

  // ---- console.error / console.warn ------------------------------------------
  try {
    const levels: Array<'error' | 'warn'> = ['error', 'warn']
    for (const lvl of levels) {
      const orig = (console as unknown as Record<string, (...args: unknown[]) => void>)[lvl]
      if (typeof orig !== 'function') continue
      const wrapped = function (...args: unknown[]) {
        try {
          sink.addBreadcrumb({
            type: 'log',
            category: `console.${lvl}`,
            message: args.map(safeString).join(' '),
          })
        } catch { /* ignore */ }
        return orig.apply(console, args)
      }
      ;(console as unknown as Record<string, unknown>)[lvl] = wrapped
      teardown.push(() => { (console as unknown as Record<string, unknown>)[lvl] = orig })
    }
  } catch { /* ignore */ }

  // ---- history (pushState / popstate) ----------------------------------------
  try {
    const h = window.history
    if (h && typeof h.pushState === 'function') {
      const origPush = h.pushState
      const origReplace = h.replaceState
      h.pushState = function (...args: Parameters<History['pushState']>) {
        sink.addBreadcrumb({ type: 'navigation', category: 'pushState', message: String(args[2] ?? '') })
        return origPush.apply(h, args)
      }
      h.replaceState = function (...args: Parameters<History['replaceState']>) {
        sink.addBreadcrumb({ type: 'navigation', category: 'replaceState', message: String(args[2] ?? '') })
        return origReplace.apply(h, args)
      }
      const onPop = () => sink.addBreadcrumb({ type: 'navigation', category: 'popstate', message: location.href })
      window.addEventListener('popstate', onPop)
      teardown.push(() => {
        h.pushState = origPush
        h.replaceState = origReplace
        window.removeEventListener('popstate', onPop)
      })
    }
  } catch { /* ignore */ }

  return () => { for (const fn of teardown) try { fn() } catch { /* ignore */ } }
}

function describeElement(el: Element): string {
  const tag = el.tagName ? el.tagName.toLowerCase() : 'el'
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : ''
  const cls = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''
  return `${tag}${id}${cls}`
}

function safeString(v: unknown): string {
  if (typeof v === 'string') return v
  if (v instanceof Error) return `${v.name}: ${v.message}`
  try { return JSON.stringify(v) } catch { return String(v) }
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}
