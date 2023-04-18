import * as fs from 'fs'
import { resolve } from 'path'
import t from 'tap'
import { glob, globStream, globStreamSync, globSync } from '../'

const mocks = (ac: AbortController) => {
  const fsMock = {
    ...fs,
    readdirSync: (path: string, options: any) => {
      ac.abort(yeet)
      return fs.readdirSync(path, options)
    },
  }
  return {
    fs: fsMock,
    'path-scurry': t.mock('path-scurry', { fs: fsMock }),
  }
}

const cwd = resolve(__dirname, 'fixtures/a')

const yeet = new Error('yeet')

t.test('pre abort walk', { skip: "not implemented" }, async t => {
  const ac = new AbortController()
  ac.abort(yeet)
  await t.rejects(Promise.resolve(glob('./**', { cwd, signal: ac.signal })), yeet)
})

t.test('mid-abort walk', { skip: "not implemented" }, async t => {
  const ac = new AbortController()
  const res = Promise.resolve(glob('./**', { cwd, signal: ac.signal }));
  ac.abort(yeet)
  await t.rejects(res, yeet)
})

t.test('pre abort sync walk', { skip: "not implemented" }, t => {
  const ac = new AbortController()
  ac.abort(yeet)
  t.throws(() => globSync('./**', { cwd, signal: ac.signal }))
  t.end()
})

t.test('mid-abort sync walk', { skip: "not implemented" }, t => {
  const ac = new AbortController()
  const { globSync } = t.mock('../', mocks(ac))
  t.throws(() => globSync('./**', { cwd, signal: ac.signal }))
  t.end()
})

t.test('pre abort stream', { skip: "not implemented" }, t => {
  const ac = new AbortController()
  ac.abort(yeet)
  const s = globStream('./**', { cwd, signal: ac.signal })
  s.on('error', er => {
    t.equal(er, yeet)
    t.end()
  })
})

t.test('mid-abort stream', { skip: "not implemented" }, t => {
  const ac = new AbortController()
  const s = globStream('./**', { cwd, signal: ac.signal })
  s.on('error', er => {
    t.equal(er, yeet)
    t.end()
  })
  s.on('data', () => ac.abort(yeet))
})

t.test('pre abort sync stream', { skip: "not implemented" }, t => {
  const ac = new AbortController()
  ac.abort(yeet)
  const s = globStreamSync('./**', { cwd, signal: ac.signal })
  s.on('error', er => {
    t.equal(er, yeet)
    t.end()
  })
})

t.test('mid-abort sync stream', { skip: "not implemented" }, t => {
  const ac = new AbortController()
  const s = globStreamSync('./**', { cwd, signal: ac.signal })
  s.on('error', er => {
    t.equal(er, yeet)
    t.end()
  })
  s.on('data', () => ac.abort(yeet))
})
