import { Glob } from '../'
import t from 'tap'

t.throws(() => {
  new Glob('.', {
    withFileTypes: true,
    absolute: true,
  })
}, {}, { skip: "not implemented" })
