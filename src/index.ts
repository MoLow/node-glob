import { Dirent, Stats, lstat, lstatSync, readdirSync } from 'fs'
import { join, relative, isAbsolute, resolve } from 'path'
import { Minimatch, GLOBSTAR, escape, unescape } from 'minimatch'
import { hasMagic } from './has-magic.js'

const lazyMinimatch = () => ({ Minimatch, GLOBSTAR } as const);
const ArrayPrototypePop = <T>(arr: Array<T>) => arr.pop();
const ArrayPrototypePush = <T>(arr: Array<T>, ...items: T[]) => arr.push(...items);
const ArrayPrototypeMap = <T, U>(arr: Array<T>, cb: (item: T, index: number) => U) => arr.map(cb);
const ArrayPrototypeFlatMap = <T, U>(arr: Array<T>, cb: (item: T) => U[]) => arr.flatMap(cb);
const SafeSet = Set;
const SafeMap = Map;

const kEmptyObject = {};
const validateObject = (...args: any[]) => {};
const validateFunction = (...args: any[]) => {};
const isRegExp = (val: any) => val instanceof RegExp;


type Pattern = string | RegExp | typeof GLOBSTAR;

class Cache {
  #cache = new SafeMap();
  #statsCache = new SafeMap();
  #readdirCache = new SafeMap();

  statSync(path: string) {
    if (this.#statsCache.has(path)) {
      return this.#statsCache.get(path);
    }
    let val;
    try {
      val = lstatSync(path);
    } catch {
      val = null;
    }
    this.#statsCache.set(path, val);
    return val;
  }
  addToStatCache(path: string, val: Dirent) {
    this.#statsCache.set(path, val);
  }
  readdirSync(path: string) {
    if (this.#readdirCache.has(path)) {
      return this.#readdirCache.get(path);
    }
    let val: Dirent[];
    try {
      val = readdirSync(path, { __proto__: null, withFileTypes: true } as { withFileTypes: true });
    } catch {
      val = [];
    }
    this.#readdirCache.set(path, val);
    return val;
  }
  #cacheKey(keys: string[], index: number) {
    let key = '';
    for (let i = index; i < keys.length; i++) {
      key += keys[i];
      if (i !== keys.length - 1) {
        key += '/';
      }
    }
    return key;
  }
  add(path: string, keys: string[], indexes: Set<number>) {
    let cache: Set<string>;
    if (this.#cache.has(path)) {
      cache = this.#cache.get(path);
    } else {
      cache = new SafeSet();
      this.#cache.set(path, cache);
    }
    indexes.forEach(index => cache?.add(this.#cacheKey(keys, index)));
  }
  seen(path: string, keys: string[], index: number) {
    return this.#cache.get(path)?.has(this.#cacheKey(keys, index));
  }

}

function testPattern(pattern: Pattern, path: string) {
  if (pattern === lazyMinimatch().GLOBSTAR) {
    return true;
  }
  if (typeof pattern === 'string') {
    return pattern === path;
  }
  if (typeof pattern.test === 'function') {
    return pattern.test(path);
  }
  return false;
}

function globSyncImpl(patterns: string[], options: any = kEmptyObject) {
  validateObject(options, 'options');
  const root = options.cwd ?? '.';
  const { exclude } = options;
  if (exclude != null) {
    validateFunction(exclude, 'options.exclude');
  }

  const { Minimatch, GLOBSTAR } = lazyMinimatch();
  const results = new SafeSet<string>();
  const matchers = ArrayPrototypeMap(patterns, (pattern) => new Minimatch(pattern));
  const queue = ArrayPrototypeFlatMap(matchers, (matcher) => {
    return ArrayPrototypeMap(matcher.set,
                             (pattern, i) => ({ __proto__: null, pattern, keys: matcher.globParts[i], indexes: new SafeSet([0]), symlinks: new SafeSet<number>([]), path: '.' }));
  });
  const cache = new Cache();
  while (queue.length > 0) {
    const { pattern, indexes, keys, symlinks, path } = ArrayPrototypePop(queue)!;

    
    cache.add(path, keys, indexes);
    const last = pattern.length - 1;
    const fullpath = resolve(root, path);
    const stat = cache.statSync(fullpath);
    const isDirectory = stat?.isDirectory() || (stat?.isSymbolicLink() && Array.from(indexes).some((i) => !symlinks.has(i)));
    const isLast = indexes.has(last) || (pattern[last] === '' && isDirectory && indexes.has(last - 1) && pattern[last - 1] === GLOBSTAR);
    const isFirst = indexes.has(0);

    if (isFirst && pattern[0] === "") {
      // Absolute path, go to root
      ArrayPrototypePush(queue, {  __proto__: null, pattern, indexes: new SafeSet([1]), keys, symlinks , path: '/' });
      continue;
    }
    if (isFirst && pattern[0] === "..") {
      // Start with .., go to parent
      ArrayPrototypePush(queue, {  __proto__: null, pattern, indexes: new SafeSet([1]), keys, symlinks, path: relative(root, resolve(fullpath, "..")) });
      continue;
    }
    if (isFirst && pattern[0] === ".") {
      // Start with ., proceed
      ArrayPrototypePush(queue, {  __proto__: null, pattern, indexes: new SafeSet([1]), keys, symlinks, path });
      continue;
    }

    if (isLast && typeof pattern[last] === 'string') {
      // Add result if it exists
      const path = resolve(fullpath, pattern[last] as string);
      const stat = cache.statSync(path);
      if (stat && (pattern[last] || stat.isDirectory() || stat.isSymbolicLink())) {
        results.add(relative(root, resolve(fullpath, pattern[last] as string)) || ".");
      }
    } else if (isLast && pattern[last] === GLOBSTAR && (path !== "." || pattern[0] === "." || (pattern.length === 1 && stat))) {
      // if pattern ends with **, add to results
      // if path is ".", add it only if pattern starts with "." or pattern is exactly "**"
      results.add(path);
    }

    if (!isDirectory) {
      continue;
    }
    
    const children = cache.readdirSync(fullpath);
    for (let i = 0; i < children.length; i++) {
      const entry = children[i];
      if (entry.name[0] === '.' || (exclude && exclude(entry.name))) {
        continue;
      }
      const entryPath = join(path, entry.name);
      cache.addToStatCache(entryPath, entry);
      
      const subPatterns = new SafeSet<number>();
      const nSymlinks = new SafeSet();
      indexes.forEach(function forEachIndex(index) {
        // for each child, chek potential patterns
        if (cache.seen(entryPath, keys, index) || cache.seen(entryPath, keys, index + 1)) {
          return;
        }
        const current = pattern[index];
        const nextIndex = index + 1;
        const next = pattern[nextIndex];
        const fromSymlink = symlinks.has(index);

        if (current === GLOBSTAR) {
          if (!fromSymlink && entry.isDirectory()) {
            // if directory, add ** to its potential patterns
            subPatterns.add(index); 
          } else if (!fromSymlink && index === last) {
            // if ** is last, add to results
            results.add(entryPath);
          }
          
          // any pattern after ** is also a potential pattern
          // so we can already test it here
          const nextMatches = next != null && testPattern(next, entry.name);
          if (nextMatches && nextIndex === last) {
            // if next pattern is the last one, add to results
            results.add(entryPath);
          } else if (nextMatches) {
            // pattern mached, meaning two patterns forward
            // are also potential patterns
            // e.g **/b/c when entry is a/b - add c to potential patterns
            subPatterns.add(index + 2);
          }
          if ((nextMatches || pattern[0] === ".") && (entry.isDirectory() || entry.isSymbolicLink()) && !fromSymlink) {
            // if pattern after ** matches, or pattern starts with "."
            // and entry is a directory or symlink, add to potential patterns
            subPatterns.add(nextIndex);
          }

          if (entry.isSymbolicLink()) {
            nSymlinks.add(index);
          }

          if (next === "") {
            // this means patten ends with "**/", add to results
            results.add(path); 
          } else if (next === ".." && entry.isDirectory()) {
            // in case pattern is "**/..",
            // both parent and current directory should be added to the queue
            // if this is the last pattern, add to results instead
            const parent = join(path, "..");
            if (nextIndex < last) {
              if (!cache.seen(path, keys, nextIndex + 1)) {
                ArrayPrototypePush(queue, { __proto__: null, pattern, keys, indexes: new SafeSet([nextIndex + 1]), symlinks, path });
              }
              if (!cache.seen(parent, keys, nextIndex + 1)) {
                ArrayPrototypePush(queue, { __proto__: null, pattern, keys, indexes: new SafeSet([nextIndex + 1]), symlinks, path: parent });
              }
            } else {
              results.add(join(path, ".."));
              results.add(path);
            }
          }
        }
        if (typeof current === "string") {
          if (testPattern(current, entry.name)) {
            // if current pattern matches entry name
            // the next pattern is a potential pattern
            if (index === last) {
              results.add(entryPath);
            } else {
              subPatterns.add(nextIndex);
            }
          } else if (current === "." && testPattern(next, entry.name)) {
            // if current pattern is ".", proceed to test next pattern
            if (nextIndex === last) {
              results.add(entryPath);
            } else {
              subPatterns.add(nextIndex + 1);
            }
          }
        }
        if (isRegExp(current) && testPattern(current, entry.name)) {
          // if current pattern is a regex that matches entry name (e.g *.js)
          // add next pattern to potential patterns, or to results if it's the last pattern
          if (index === last) {
            results.add(entryPath);
          } else if (entry.isDirectory()) {
            subPatterns.add(nextIndex);
          }
        }
      });
      if (subPatterns.size > 0) {
        // if there are potential patterns, add to queue
        ArrayPrototypePush(queue, { __proto__: null, pattern, indexes: subPatterns, keys, symlinks: nSymlinks, path: entryPath});
      }
    }
  }

  return {
    __proto__: null,
    results,
    matchers,
  };
}

function globSyncImpl_(patterns: string[], options: any = kEmptyObject) {
  validateObject(options, 'options');
  const root = options.cwd ?? '.';
  const { exclude } = options;
  if (exclude != null) {
    validateFunction(exclude, 'options.exclude');
  }

  const { Minimatch, GLOBSTAR } = lazyMinimatch();
  const results = new SafeSet<string>();
  const matchers = ArrayPrototypeMap(patterns, (pattern) => new Minimatch(pattern));
  const queue = ArrayPrototypeFlatMap(matchers, (matcher) => {
    return ArrayPrototypeMap(matcher.set,
                             (pattern) => ({ __proto__: null, pattern, index: 0, path: '.', followSymlinks: true }));
  });
  const cache = new Cache();

  while (queue.length > 0) {
    const { pattern, index: currentIndex, path, followSymlinks } = ArrayPrototypePop(queue)!;
    // if (cache.seen_(pattern, currentIndex, path)) {
    //   continue;
    // }
    // cache.add_(pattern, currentIndex, path);

    const currentPattern = pattern[currentIndex];
    const index = currentIndex + 1;
    const isLast = pattern.length === index || (pattern.length === index + 1 && pattern[index] === '');

    if (currentPattern === '') {
      // Absolute path
      ArrayPrototypePush(queue, { __proto__: null, pattern, index, path: '/', followSymlinks });
      continue;
    }

    if (typeof currentPattern === 'string') {
      const entryPath = join(path, currentPattern);
      if (isLast && cache.statSync(resolve(root, entryPath))) {
        // last path
        results.add(entryPath);
      } else if (!isLast) {
        // Keep traversing, we only check file existence for the last path
        ArrayPrototypePush(queue, { __proto__: null, pattern, index, path: entryPath, followSymlinks });
      }
      continue;
    }

    const fullpath = resolve(root, path);
    const stat = cache.statSync(fullpath);
    const isDirectory = stat?.isDirectory() || (followSymlinks !== false && stat?.isSymbolicLink());

    if (isDirectory && isRegExp(currentPattern)) {
      const entries = cache.readdirSync(fullpath);
      for (const entry of entries) {
        const entryPath = join(path, entry.name);
        // if (cache.seen_(pattern, index, entryPath)) {
        //   continue;
        // }
        const matches = testPattern(currentPattern, entry.name);
        if (matches && isLast) {
          results.add(entryPath);
        } else if (matches) {
          ArrayPrototypePush(queue, { __proto__: null, pattern, index, path: entryPath, followSymlinks });
        }
      }
    }

    if (isDirectory && currentPattern === GLOBSTAR) {
      const entries = cache.readdirSync(fullpath);
      for (const entry of entries) {
        if (entry.name[0] === '.' || (exclude && exclude(entry.name))) {
          continue;
        }
        const entryPath = join(path, entry.name);
        // if (cache.seen_(pattern, index, entryPath)) {
        //   continue;
        // }
        const isSymbolicLink = entry.isSymbolicLink();
        const isDirectory = entry.isDirectory();
        if (isDirectory) {
          // Push child directory to queue at same pattern index
          ArrayPrototypePush(queue, {
            __proto__: null, pattern, index: currentIndex, path: entryPath, followSymlinks: !isSymbolicLink,
          });
        }

        if (pattern.length === index || (isSymbolicLink && pattern.length === index + 1 && pattern[index] === '')) {
          results.add(entryPath);
        } else if (pattern[index] === '..') {
          continue;
        } else if (!isLast &&
          (isDirectory || (isSymbolicLink && (typeof pattern[index] !== 'string' || pattern[0] !== GLOBSTAR)))) {
          ArrayPrototypePush(queue, { __proto__: null, pattern, index, path: entryPath, followSymlinks });
        }
      }
      if (isLast) {
        results.add(path);
      } else {
        ArrayPrototypePush(queue, { __proto__: null, pattern, index, path, followSymlinks });
      }
    }
  }

  return {
    __proto__: null,
    results,
    matchers,
  };
}

export const glob = (pattern: string, opt?: any) => {
  return Array.from(globSyncImpl([pattern], opt).results);
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
