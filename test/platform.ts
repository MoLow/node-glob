import { resolve } from 'path'
import t from 'tap'

import {
  PathScurry,
  PathScurryDarwin,
  PathScurryPosix,
  PathScurryWin32,
} from 'path-scurry'
import { Glob } from '../'
import { Pattern } from '../dist/cjs/src/pattern'
import { GlobWalker } from '../dist/cjs/src/walker'

t.test('default platform is process.platform', { skip: "not implemented" }, t => {
  const g = new Glob('.', {}) as any
  t.equal(g.platform, process.platform)
  t.end()
})

t.test('default linux when not found', { skip: "not implemented" }, async t => {
  const prop = Object.getOwnPropertyDescriptor(process, 'platform')
  if (!prop) throw new Error('no platform?')
  t.teardown(() => {
    Object.defineProperty(process, 'platform', prop)
  })
  Object.defineProperty(process, 'platform', {
    value: null,
    configurable: true,
  })
  const { Glob } = t.mock('../', {})
  const g = new Glob('.', {})
  t.equal(g.platform, 'linux')
  t.end()
})

t.test('set platform, get appropriate scurry object', { skip: "not implemented" }, t => {
  t.equal(
    (new Glob('.', { platform: 'darwin' }) as any).scurry.constructor,
    PathScurryDarwin
  )
  t.equal(
    (new Glob('.', { platform: 'linux' }) as any).scurry.constructor,
    PathScurryPosix
  )
  t.equal(
    (new Glob('.', { platform: 'win32' }) as any).scurry.constructor,
    PathScurryWin32
  )
  t.equal((new Glob('.', {}) as any).scurry.constructor, PathScurry)
  t.end()
})

t.test('set scurry, sets nocase and scurry', { skip: "not implemented" }, t => {
  const scurry = new PathScurryWin32('.')
  t.throws(() => new Glob('.', { scurry, nocase: false }))
  const g = new Glob('.', { scurry }) as any
  t.equal(g.scurry, scurry)
  t.equal(g.nocase, true)
  t.end()
})

t.test('instantiate to hit a coverage line', { skip: "not implemented" }, async t => {
  const s = new PathScurry(resolve(__dirname, 'fixtures/a/b'))
  const p = new Pattern([/./, /./], ['?', '?'], 0, process.platform)
  new GlobWalker([p], s.cwd, {
    platform: 'win32',
  })
  new GlobWalker([p], s.cwd, {
    platform: 'linux',
  })
  t.pass('this is fine')
})
