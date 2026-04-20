import type { ExceptionPayload, StackFrame } from './types'

// Match browser stack-trace lines. Covers the common formats:
//   V8 (Chrome/Edge/Node):
//     "    at functionName (https://example.com/app.js:10:20)"
//     "    at https://example.com/app.js:10:20"
//     "    at Object.<anonymous> (file:///x.js:1:1)"
//   Spidermonkey/JSC (Firefox/Safari):
//     "functionName@https://example.com/app.js:10:20"
//     "@https://example.com/app.js:10:20"

const V8_RE = /^\s*at (?:(.+?) \()?((?:(?:file|https?|blob|webpack|chrome-extension):\/\/)?[^\s()]+?):(\d+):(\d+)\)?\s*$/
const GECKO_RE = /^\s*(?:(.*?)@)?((?:(?:file|https?|blob|webpack|chrome-extension):\/\/)?[^\s]+?):(\d+):(\d+)\s*$/

export function parseStack(stack: string): StackFrame[] {
  if (typeof stack !== 'string' || !stack) return []
  const lines = stack.split('\n')
  const frames: StackFrame[] = []
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line) continue
    let m = V8_RE.exec(line)
    let fn: string | undefined
    let file: string | undefined
    let lineno: number | undefined
    let colno: number | undefined
    if (m) {
      fn = m[1] || undefined
      file = m[2]
      lineno = Number(m[3])
      colno = Number(m[4])
    } else {
      m = GECKO_RE.exec(line)
      if (!m) continue
      fn = m[1] || undefined
      file = m[2]
      lineno = Number(m[3])
      colno = Number(m[4])
    }
    if (fn === '<anonymous>' || fn === 'Anonymous function') fn = undefined
    frames.push({
      filename: file,
      function: fn,
      lineno: Number.isFinite(lineno) ? lineno : undefined,
      colno: Number.isFinite(colno) ? colno : undefined,
    })
  }
  return frames
}

/**
 * Convert any thrown value into the Alby wire-protocol exception object.
 */
export function exceptionFromError(err: unknown): ExceptionPayload {
  if (err && typeof err === 'object' && 'stack' in err && typeof (err as Error).stack === 'string') {
    const e = err as Error
    return {
      type: e.name || 'Error',
      value: e.message || '',
      frames: parseStack(e.stack || ''),
    }
  }
  // Non-Error: stringify best-effort.
  let value: string
  if (typeof err === 'string') {
    value = err
  } else if (err === null) {
    value = 'null'
  } else if (err === undefined) {
    value = 'undefined'
  } else {
    try { value = JSON.stringify(err) } catch { value = String(err) }
  }
  return { type: 'Error', value, frames: [] }
}
