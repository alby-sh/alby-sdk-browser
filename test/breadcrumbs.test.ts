import { describe, expect, it } from 'vitest'
import { installAutoBreadcrumbs } from '../src/breadcrumbs'
import type { Breadcrumb } from '../src/types'

describe('installAutoBreadcrumbs', () => {
  it('captures click events on document (capture phase)', () => {
    const crumbs: Breadcrumb[] = []
    const uninstall = installAutoBreadcrumbs({ addBreadcrumb: b => crumbs.push(b) })

    const btn = document.createElement('button')
    btn.id = 'save'
    btn.className = 'btn primary'
    document.body.appendChild(btn)
    btn.click()

    const clickCrumb = crumbs.find(c => c.category === 'click')
    expect(clickCrumb).toBeDefined()
    expect(clickCrumb?.message).toBe('button#save.btn.primary')

    uninstall()
    document.body.removeChild(btn)
  })

  it('captures console.warn / console.error calls', () => {
    const crumbs: Breadcrumb[] = []
    const uninstall = installAutoBreadcrumbs({ addBreadcrumb: b => crumbs.push(b) })

    console.warn('hello', { n: 1 })
    console.error('boom')

    const warn = crumbs.find(c => c.category === 'console.warn')
    const err = crumbs.find(c => c.category === 'console.error')
    expect(warn?.message).toContain('hello')
    expect(err?.message).toBe('boom')

    uninstall()
  })

  it('restores console on teardown', () => {
    const orig = console.warn
    const uninstall = installAutoBreadcrumbs({ addBreadcrumb: () => {} })
    expect(console.warn).not.toBe(orig)
    uninstall()
    expect(console.warn).toBe(orig)
  })
})
