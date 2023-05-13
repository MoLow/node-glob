import { Dirent, lstatSync, readdirSync } from 'fs'
import { join, relative, resolve } from 'path'
import { Minimatch, GLOBSTAR, escape, unescape } from 'minimatch'
import { hasMagic } from './has-magic.js'

const lazyMinimatch = () => ({ Minimatch, GLOBSTAR } as const);
const ArrayFrom = <T>(arr: Iterable<T> | ArrayLike<T>) => Array.from(arr);
const ArrayPrototypePop = <T>(arr: Array<T>) => arr.pop();
const ArrayPrototypePush = <T>(arr: Array<T>, ...items: T[]) => arr.push(...items);
const ArrayPrototypeMap = <T, U>(arr: Array<T>, cb: (item: T, index: number) => U) => arr.map(cb);
const ArrayPrototypeFlatMap = <T, U>(arr: Array<T>, cb: (item: T) => U[]) => arr.flatMap(cb);
const ArrayPrototypeSome = <T>(arr: Array<T>, cb: (item: T) => boolean) => arr.some(cb);
const SafeSet = Set;
const SafeMap = Map;

const kEmptyObject = {};
const validateObject = (...args: any[]) => {};
const validateFunction = (...args: any[]) => {};
const isRegExp = (val: any) => val instanceof RegExp;


type GlobPattern = string | RegExp | typeof GLOBSTAR;

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
  add(path: string, pattern: Pattern) {
    let cache: Set<string>;
    if (this.#cache.has(path)) {
      cache = this.#cache.get(path);
    } else {
      cache = new SafeSet();
      this.#cache.set(path, cache);
    }
    pattern.indexes.forEach(index => cache?.add(pattern.cacheKey(index)));
  }
  seen(path: string, pattern: Pattern, index: number) {
    return this.#cache.get(path)?.has(pattern.cacheKey(index));
  }
}

class Pattern {
  #pattern: GlobPattern[];
  #globStrings: string[];
  indexes: Set<number>;
  symlinks: Set<number>;
  last: number;

  constructor(pattern: GlobPattern[], globStrings: string[], indexes: Set<number>, symlinks: Set<number>) {
    this.#pattern = pattern;
    this.#globStrings = globStrings;
    this.indexes = indexes;
    this.symlinks = symlinks;
    this.last = pattern.length - 1;
  }

  isLast(isDirectory: boolean) {
    return this.indexes.has(this.last) ||
      (this.#pattern[this.last] === '' && isDirectory && this.indexes.has(this.last - 1) && this.#pattern[this.last - 1] === lazyMinimatch().GLOBSTAR);
  }
  isFirst() {
    return this.indexes.has(0);
  }
  get hasSeenSymlinks() {
    return ArrayPrototypeSome(ArrayFrom(this.indexes), (i) => !this.symlinks.has(i));
  }
  at(index: number) {
    return this.#pattern[index];
  }
  child(indexes: Set<number>, symlinks: Set<number> = new SafeSet()) {
    return new Pattern(this.#pattern, this.#globStrings, indexes, symlinks);
  }
  test(index: number, path: string) {
    if (index > this.#pattern.length) {
      return false;
    }
    const pattern = this.#pattern[index];
    if (pattern === lazyMinimatch().GLOBSTAR) {
      return true;
    }
    if (typeof pattern === 'string') {
      return pattern === path;
    }
    if (typeof pattern?.test === 'function') {
      return pattern.test(path);
    }
    return false;
  }

  cacheKey(index: number) {
    let key = '';
    for (let i = index; i < this.#globStrings.length; i++) {
      key += this.#globStrings[i];
      if (i !== this.#globStrings.length - 1) {
        key += '/';
      }
    }
    return key;
  }
}

class GlobImpl {
  #root: string;
  #exclude?: (path: string) => boolean;
  #cache = new Cache();
  #results = new SafeSet<string>();
  #queue: { __proto__: null, path: string, patterns: Pattern[] }[] = [];
  matchers: Minimatch[];
  constructor(patterns: string[], options: any = kEmptyObject) {
    validateObject(options, 'options');
    const { exclude, cwd } = options;
    if (exclude != null) {
      validateFunction(exclude, 'options.exclude');
    }
    this.#root = cwd ?? '.';
    this.#exclude = exclude;
    this.matchers = ArrayPrototypeMap(patterns, (pattern) => new Minimatch(pattern));
  }

  globSync() {
    ArrayPrototypePush(this.#queue, {
      __proto__: null,
      path: '.',
      patterns: ArrayPrototypeFlatMap(this.matchers, (matcher) => ArrayPrototypeMap(matcher.set, (pattern, i) => new Pattern(
        pattern, matcher.globParts[i], new SafeSet([0]), new SafeSet<number>()
      ))),
    });

    while (this.#queue.length > 0) {
      const item = ArrayPrototypePop(this.#queue)!;
      for (let i = 0; i < item.patterns.length; i++) {
        this.#addSubpatterns(item.path, item.patterns[i]);
      }
      this.#subpatterns.forEach((patterns, path) => ArrayPrototypePush(this.#queue, { __proto__: null, path, patterns }));
      this.#subpatterns.clear();
    }
    return this.#results;
  }
  #subpatterns = new SafeMap<string, Pattern[]>();
  #addSubpattern(path: string, pattern: Pattern) {
    if (!this.#subpatterns.has(path)) {
      this.#subpatterns.set(path, [pattern]);
    } else {
      ArrayPrototypePush(this.#subpatterns.get(path)!, pattern);
    }
  }
  #addSubpatterns(path: string, pattern: Pattern) {
    this.#cache.add(path, pattern);
    const fullpath = resolve(this.#root, path);
    const stat = this.#cache.statSync(path);
    const last = pattern.last;
    const isDirectory = stat?.isDirectory() || (stat?.isSymbolicLink() && pattern.hasSeenSymlinks);
    const isLast = pattern.isLast(isDirectory);
    const isFirst = pattern.isFirst();
  
    if (isFirst && pattern.at(0) === "") {
      // Absolute path, go to root
      this.#addSubpattern('/', pattern.child(new SafeSet([1])));
      return;
    }
    if (isFirst && pattern.at(0) === "..") {
      // Start with .., go to parent
      this.#addSubpattern('../', pattern.child(new SafeSet([1])));
      return;
    }
    if (isFirst && pattern.at(0) === ".") {
      // Start with ., proceed
      this.#addSubpattern('.', pattern.child(new SafeSet([1])));
      return;
    }
  
    if (isLast && typeof pattern.at(last) === 'string') {
      // Add result if it exists
      const path = resolve(fullpath, pattern.at(last) as string);
      const stat = this.#cache.statSync(path);
      if (stat && (pattern.at(last) || isDirectory)) {
        this.#results.add(relative(this.#root, path) || ".");
      }
    } else if (isLast && pattern.at(last) === GLOBSTAR && (path !== "." || pattern.at(0) === "." || (last === 0 && stat))) {
      // if pattern ends with **, add to results
      // if path is ".", add it only if pattern starts with "." or pattern is exactly "**"
      this.#results.add(path);
    }
  
    if (!isDirectory) {
      return;
    }
    
    const children = this.#cache.readdirSync(fullpath);
    for (let i = 0; i < children.length; i++) {
      const entry = children[i];
      const entryPath = join(path, entry.name);
      this.#cache.addToStatCache(entryPath, entry);
      
      const subPatterns = new SafeSet<number>();
      const nSymlinks = new SafeSet<number>();
      for (const index of pattern.indexes) {
        // for each child, chek potential patterns
        if (this.#cache.seen(entryPath, pattern, index) || this.#cache.seen(entryPath, pattern, index + 1)) {
          return;
        }
        const current = pattern.at(index);
        const nextIndex = index + 1;
        const next = pattern.at(nextIndex);
        const fromSymlink = pattern.symlinks.has(index);
  
        if (current === GLOBSTAR) {
          if (entry.name[0] === '.' || (this.#exclude && this.#exclude(entry.name))) {
            continue;
          }
          if (!fromSymlink && entry.isDirectory()) {
            // if directory, add ** to its potential patterns
            subPatterns.add(index); 
          } else if (!fromSymlink && index === last) {
            // if ** is last, add to results
            this.#results.add(entryPath);
          }
          
          // any pattern after ** is also a potential pattern
          // so we can already test it here
          const nextMatches = pattern.test(nextIndex, entry.name);
          if (nextMatches && nextIndex === last) {
            // if next pattern is the last one, add to results
            this.#results.add(entryPath);
          } else if (nextMatches && entry.isDirectory()) {
            // pattern mached, meaning two patterns forward
            // are also potential patterns
            // e.g **/b/c when entry is a/b - add c to potential patterns
            subPatterns.add(index + 2);
          }
          if ((nextMatches || pattern.at(0) === ".") && (entry.isDirectory() || entry.isSymbolicLink()) && !fromSymlink) {
            // if pattern after ** matches, or pattern starts with "."
            // and entry is a directory or symlink, add to potential patterns
            subPatterns.add(nextIndex);
          }
  
          if (entry.isSymbolicLink()) {
            nSymlinks.add(index);
          }
  
          if (next === "") {
            // this means patten ends with "**/", add to results
            this.#results.add(path); 
          } else if (next === ".." && entry.isDirectory()) {
            // in case pattern is "**/..",
            // both parent and current directory should be added to the queue
            // if this is the last pattern, add to results instead
            const parent = join(path, "..");
            if (nextIndex < last) {
              if (!this.#cache.seen(path, pattern, nextIndex + 1)) {
                this.#subpatterns.set(path, [pattern.child(new SafeSet([nextIndex + 1]))]);
              }
              if (!this.#cache.seen(parent, pattern, nextIndex + 1)) {
                this.#subpatterns.set(parent, [pattern.child(new SafeSet([nextIndex + 1]))]);
              }
            } else {
              this.#results.add(parent);
              this.#results.add(path);
            }
          }
        }
        if (typeof current === "string") {
          if (pattern.test(index, entry.name)) {
            // if current pattern matches entry name
            // the next pattern is a potential pattern
            if (index === last) {
              this.#results.add(entryPath);
            } else {
              subPatterns.add(nextIndex);
            }
          } else if (current === "." && pattern.test(nextIndex, entry.name)) {
            // if current pattern is ".", proceed to test next pattern
            if (nextIndex === last) {
              this.#results.add(entryPath);
            } else {
              subPatterns.add(nextIndex + 1);
            }
          }
        }
        if (isRegExp(current) && pattern.test(index, entry.name)) {
          // if current pattern is a regex that matches entry name (e.g *.js)
          // add next pattern to potential patterns, or to results if it's the last pattern
          if (index === last) {
            this.#results.add(entryPath);
          } else if (entry.isDirectory()) {
            subPatterns.add(nextIndex);
          }
        }
      };
      if (subPatterns.size > 0) {
        // if there are potential patterns, add to queue
        this.#addSubpattern(entryPath, pattern.child(subPatterns, nSymlinks));
      }
    }
  }
}

export const glob = (pattern: string, opts?: any) => {
  return ArrayFrom(new GlobImpl([pattern], opts).globSync());
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
