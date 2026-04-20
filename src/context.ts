// Best-effort browser/OS/device detection from user-agent. Kept tiny — we're
// not shipping a full UA parser, just enough context for triage.

export interface BrowserContext { name: string; version?: string }
export interface OsContext { name: string; version?: string }
export interface DeviceContext {
  screen_width?: number
  screen_height?: number
  pixel_ratio?: number
}

export function detectBrowser(): BrowserContext | undefined {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (!ua) return undefined
  // Order matters: check Edge/Opera before Chrome, Chrome before Safari.
  const patterns: Array<[string, RegExp]> = [
    ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ['Opera', /OPR\/([\d.]+)/],
    ['Firefox', /Firefox\/([\d.]+)/],
    ['Chrome', /Chrome\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari\//],
    ['IE', /MSIE ([\d.]+)|Trident.*rv:([\d.]+)/],
  ]
  for (const [name, re] of patterns) {
    const m = re.exec(ua)
    if (m) return { name, version: m[1] || m[2] }
  }
  return { name: 'Unknown' }
}

export function detectOs(): OsContext | undefined {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (!ua) return undefined
  if (/Windows NT ([\d.]+)/.test(ua)) return { name: 'Windows', version: RegExp.$1 }
  if (/Mac OS X ([\d_.]+)/.test(ua)) return { name: 'macOS', version: RegExp.$1.replace(/_/g, '.') }
  if (/Android ([\d.]+)/.test(ua)) return { name: 'Android', version: RegExp.$1 }
  if (/iPhone OS ([\d_]+)|iPad.*OS ([\d_]+)/.test(ua)) {
    return { name: 'iOS', version: (RegExp.$1 || RegExp.$2).replace(/_/g, '.') }
  }
  if (/Linux/.test(ua)) return { name: 'Linux' }
  return { name: 'Unknown' }
}

export function detectDevice(): DeviceContext | undefined {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return undefined
  const out: DeviceContext = {}
  if (typeof screen.width === 'number') out.screen_width = screen.width
  if (typeof screen.height === 'number') out.screen_height = screen.height
  if (typeof window.devicePixelRatio === 'number') out.pixel_ratio = window.devicePixelRatio
  return Object.keys(out).length ? out : undefined
}
