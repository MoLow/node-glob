import { resolve } from 'path'
import t from 'tap'
import { glob, globSync } from '../'

t.test('stat: true', { skip: "not implemented"}, async t => {
  const cwd = resolve(__dirname, 'fixtures')
  const pattern = '*'
  const asyncRes = await glob(pattern, {
    cwd,
    withFileTypes: true,
    stat: true,
  }) as any;
  const syncRes = globSync(pattern, {
    cwd,
    withFileTypes: true,
    stat: true,
  }) as any;
  t.type(asyncRes[0].mode, 'number')
  t.type(syncRes[0].mode, 'number')

  const noStat = await glob(pattern, { cwd, withFileTypes: true }) as any;
  t.equal(noStat[0].mode, undefined)
})
