import { lstatSync, readdirSync } from 'fs'
import { join, basename, relative, isAbsolute } from 'path'
import { Minimatch, GLOBSTAR, escape, unescape } from 'minimatch'
import { hasMagic } from './has-magic'

const lazyMinimatch = () => ({ Minimatch, GLOBSTAR });
const ArrayPrototypeShift = (arr: Array<any>) => arr.shift();
const ArrayPrototypePush = (arr: Array<any>, ...items: any[]) => arr.push(...items);
const SafeSet = Set;



function stats(path: string, silent = true) {
  try {
    return lstatSync(path);
  } catch (err: any) {
    // if (silent) {
      return null;
    // }
    // if (err?.code === 'ENOENT') {
    //   console.error(`Could not find '${path}'`);
    //   process.exit(1);
    // }
    throw err;
  }
}

function readdir(path: string) {
  try {
    return readdirSync(path);
  } catch (err: any) {
   return [];
  }
}

type Pattern = string | RegExp | typeof GLOBSTAR;

function testPattern(pattern: Pattern, path: string) {
  if (pattern === GLOBSTAR) {
    return true;
  }
  if (typeof pattern === 'string') {
    return true;
  }
  if (typeof pattern.test === 'function') {
    return pattern.test(path);
  }
}

function shouldAddResult(pattern: Pattern[], index: number, path: string) {
  const isLast = pattern.length === index || (pattern.length === index + 1 && pattern[index] === '');
  const matches = testPattern(pattern[index - 1], basename(path));
  return isLast && matches;
}

export function walkTree(root: string, patterns: string[]) {
  const results = new SafeSet<string>();
  const { Minimatch, GLOBSTAR } = lazyMinimatch();
  const queue = patterns.flatMap((pattern) => new Minimatch(pattern).set.map((pattern) => ({ pattern, index: 0, path: root })));
  // TODO: Deduplicate patterns

  while (queue.length > 0) {
    const { pattern, index: currentIndex, path, followSymlinks } = ArrayPrototypeShift(queue);
    const currentPattern = pattern[currentIndex];
    const index = currentIndex + 1;
    // console.log({ pattern, currentPattern, path })

    if (currentPattern === '') {
      // Absolute path
      ArrayPrototypePush(queue, { pattern, index, path: '/', followSymlinks });
      continue;
    }

    if (typeof currentPattern === 'string') {
      const entryPath = join(path, currentPattern);
      if (shouldAddResult(pattern, index, entryPath) && stats(entryPath)) {
        results.add(entryPath);
      } else {
        ArrayPrototypePush(queue, { pattern, index, path: entryPath, followSymlinks });
      }
    }

    const stat = stats(path);
    const isDirectory = stat?.isDirectory() || (stat?.isSymbolicLink() && followSymlinks !== false);
    if (currentPattern instanceof RegExp && isDirectory) {
      const entries = readdir(path);
      for (const entry of entries) {
        const entryPath = join(path, entry);
        const matches = testPattern(currentPattern, entry);
        if (matches && pattern.length === index) {
          results.add(entryPath);
        } else if (matches) {
          ArrayPrototypePush(queue, { pattern, index, path: entryPath, followSymlinks });
        }
      }
    }

    if (currentPattern === GLOBSTAR && isDirectory) {
      const entries = readdir(path);
      for (const entry of entries) {
        if (entry === 'node_modules' || entry.startsWith(".")) {
          continue;
        }
        const entryPath = join(path, entry);
        const isSymbolicLink = stats(entryPath)?.isSymbolicLink();
        // push child directory to queue at same pattern index
        ArrayPrototypePush(queue, { pattern, index: currentIndex, path: entryPath, followSymlinks: !isSymbolicLink });

        if (pattern.length === index || (isSymbolicLink && pattern.length === index + 1 && pattern[index] === '')) {
          results.add(entryPath);
        }  else if (pattern[index] === '..') {
          continue;
        } else if (!isSymbolicLink || (typeof pattern[index] !== "string") || pattern[0] !== GLOBSTAR) {
          ArrayPrototypePush(queue, { pattern, index, path: entryPath, followSymlinks });
        } 
      }
      if (shouldAddResult(pattern, index, path)) {
        results.add(path);
      } else {
        ArrayPrototypePush(queue, { pattern, index, path, followSymlinks });
      }
    }
  }

  return results;
}

export const glob = (pattern: string, opt?: any) => {
  const cwd = opt?.cwd ?? './';
  const isCwdAbsolute = isAbsolute(cwd);
  return Array.from(walkTree(cwd, [pattern])).map((path) => (isAbsolute(path) && !isCwdAbsolute ? path : relative(cwd, path)) || ".");
}

// just stuff to makes tests pass
export class Glob {
  constructor(public ptrn: string, private options: any = {}) {
  }
  get patterns() {
    return this.pattern;
  }
  get pattern() {
    if (this.options.allowWindowsEscape === false || this.options.windowsPathsNoEscape) {
      return [unescape(this.ptrn.replace(/\\/g, '/'))]
    }
    return [this.ptrn];
  }
  get cwd() {
    return this.options.cwd;
  }
  walk() {
    return glob(this.ptrn, this.options);
  }
  walkSync() {
    return glob(this.ptrn, this.options);
  }
  stream() {
    const items = glob(this.ptrn, this.options);
    return {
      on(e: "data" | "end", cb: (item?: string) => void) {
        if (e === 'data') {
          for (const item of items) {
            cb(item);
          }
        }
        if (e === 'end') {
          cb();
        }
      },
      collect() {
        return items;
      }
    } as {
      on(e: "data", cb: (item: string) => void): void;
      on(e: "error", cb: (error: Error) => void): void;
      on(e: "end", cb: () => void): void;
      collect(): string[];
    }
  }
  streamSync() {
    return this.stream();
  }
  iterate() {
    return glob(this.ptrn, this.options);
  }
  iterateSync() {
    return glob(this.ptrn, this.options);
  }
  async *[Symbol.asyncIterator]() {
    const items = glob(this.ptrn, this.options);
    for (const item of items) {
      yield item;
    }
  }
  *[Symbol.iterator]() {
    const items = glob(this.ptrn, this.options);
    for (const item of items) {
      yield item;
    }
  }
}
glob.globSync = glob;
glob.hasMagic = hasMagic;
export const globSync = glob;
export const globIterate = (pattern: string, options: any) => new Glob(pattern, options).iterate();
export const globIterateSync = (pattern: string, options: any) => new Glob(pattern, options).iterateSync();
export const globStream = (pattern: string, options: any) => new Glob(pattern, options).stream();
export const globStreamSync = (pattern: string, options: any) => new Glob(pattern, options).streamSync();
export { escape, unescape, hasMagic };
export type IgnoreLike = any;
export type GlobOptions = any;
