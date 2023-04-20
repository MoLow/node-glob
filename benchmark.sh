#!/bin/bash
export CDPATH=
set -e

. patterns.sh

bash make-benchmark-fixture.sh
wd=$PWD

mkdir -p "$wd/bench-working-dir/fixture"
cd "$wd/bench-working-dir"
cat > "$wd/bench-working-dir/package.json" <<PJ
{
  "dependencies": {
    "glob8": "npm:glob@8",
    "glob10": "npm:glob@10"
  }
}
PJ

if ! [ -d "$wd/bench-working-dir/node_modules/glob8" ] || \
    ! [ -d "$wd/bench-working-dir/node_modules/glob10" ]; then
  (cd "$wd/bench-working-dir" &>/dev/null; npm i --silent)
fi

tt () {
  time "$@"
}

t () {
  rm -f stderr stdout
  tt "$@" 2>stderr >stdout || (cat stderr >&2 ; exit 1 )
  echo $(cat stderr | grep real | awk -F $'\t' '{ print $2 }' || true)' '\
    $(cat stdout)
  # rm -f stderr stdout
}

# warm up the fs cache so we don't get a spurious slow first result
bash -c 'for i in **; do :; done'


for p in "${patterns[@]}"; do
  echo
  echo "--- pattern: '$p' ---"

  # if [[ "`bash --version`" =~ version\ 4 ]] || [[ "`bash --version`" =~ version\ 5 ]]; then
  #   echo -n $'bash                        \t'
  #   t bash -c 'shopt -s globstar; echo '"$p"' | wc -w'
  # fi

  # if type zsh &>/dev/null; then
  #   echo -n $'zsh                         \t'
  #   t zsh -c 'echo '"$p"' | wc -w'
  # fi

  echo '~~ sync ~~'

#  echo -n $'node current globSync cjs    \t'
#  cat > "$wd/bench-working-dir/sync.cjs" <<CJS
#  const {globSync} = require("$wd/dist/cjs/index-cjs.js")
#  console.log(globSync(process.argv[2]).length)
#CJS
#  t node "$wd/bench-working-dir/sync.cjs" "$p"
#
#  echo -n $'node current glob async cjs   \t'
#  cat > "$wd/bench-working-dir/async.cjs" <<CJS
#  const glob = require("$wd/dist/cjs/index-cjs.js")
#  glob(process.argv[2]).then(files => console.log(files.length))
#CJS
#  t node "$wd/bench-working-dir/async.cjs" "$p"

  echo -n $'node glob v8 sync             \t'
  cat > "$wd/bench-working-dir/glob-8-sync.cjs" <<CJS
    var glob=require('glob8')
    console.log(glob.sync(process.argv[2]).length)
CJS
  t node "$wd/bench-working-dir/glob-8-sync.cjs" "$p"

  echo -n $'node glob v10 sync             \t'
  cat > "$wd/bench-working-dir/glob-10-sync.cjs" <<CJS
    var glob=require('glob10')
    console.log(glob.sync(process.argv[2]).length)
CJS
  t node "$wd/bench-working-dir/glob-10-sync.cjs" "$p"

  echo -n $'node current globSync mjs    \t'
  cat > "$wd/bench-working-dir/sync.mjs" <<MJS
  import {globSync} from '$wd/dist/mjs/index.js'
  console.log(globSync(process.argv[2]).length)
MJS
  t node "$wd/bench-working-dir/sync.mjs" "$p"

done
