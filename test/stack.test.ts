import { describe, expect, it } from 'vitest'
import { exceptionFromError, parseStack } from '../src/stack'

describe('parseStack', () => {
  it('parses V8-style stack frames', () => {
    const stack = [
      'Error: boom',
      '    at foo (https://example.com/app.js:10:20)',
      '    at https://example.com/app.js:30:40',
      '    at Object.<anonymous> (file:///x.js:1:1)',
    ].join('\n')
    const frames = parseStack(stack)
    expect(frames.length).toBe(3)
    expect(frames[0]).toMatchObject({ function: 'foo', filename: 'https://example.com/app.js', lineno: 10, colno: 20 })
    expect(frames[1]).toMatchObject({ function: undefined, filename: 'https://example.com/app.js', lineno: 30, colno: 40 })
    expect(frames[2]).toMatchObject({ function: 'Object.<anonymous>', filename: 'file:///x.js', lineno: 1, colno: 1 })
  })

  it('parses Gecko-style stack frames', () => {
    const stack = [
      'foo@https://example.com/app.js:10:20',
      '@https://example.com/app.js:30:40',
    ].join('\n')
    const frames = parseStack(stack)
    expect(frames.length).toBe(2)
    expect(frames[0]).toMatchObject({ function: 'foo', filename: 'https://example.com/app.js', lineno: 10, colno: 20 })
    expect(frames[1].function).toBeUndefined()
  })

  it('returns an empty array for empty input', () => {
    expect(parseStack('')).toEqual([])
    expect(parseStack(undefined as unknown as string)).toEqual([])
  })
})

describe('exceptionFromError', () => {
  it('builds a payload from a native Error', () => {
    let err: Error
    try {
      throw new TypeError("Cannot read property 'x' of undefined")
    } catch (e) {
      err = e as Error
    }
    const ex = exceptionFromError(err)
    expect(ex.type).toBe('TypeError')
    expect(ex.value).toContain("Cannot read property 'x'")
    expect(ex.frames.length).toBeGreaterThan(0)
  })

  it('degrades gracefully for non-Error values', () => {
    expect(exceptionFromError('a string').value).toBe('a string')
    expect(exceptionFromError({ foo: 1 }).value).toContain('foo')
    expect(exceptionFromError(null).value).toBe('null')
    expect(exceptionFromError(undefined).value).toBe('undefined')
  })
})
