
import { glob } from '../dist/cjs/src/index.js'
import { globSync as original } from '../dist/cjs/src/_index.js'

// console.time('original');
// console.log(original('./**/0/**/0/**/*.txt', { cwd: 'bench-working-dir' }));
// console.timeEnd('original');

// console.time('glob');
// console.log(glob('./**/0/**/0/**/*.txt', { cwd: 'bench-working-dir' }));
// console.timeEnd('glob');

