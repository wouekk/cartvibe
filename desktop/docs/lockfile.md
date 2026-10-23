# Changing dependencies and package-lock.json

Purpose: the recipe for moving dependencies without breaking `npm ci`, and why each step exists. The rules themselves
are in `../CLAUDE.md` → Dependencies.

## Use CI's Node and npm

CI pins one exact Node in `.github/workflows/ci.yml` (`node-version`, 24.22.1 with npm 11.19.1 at the time of writing).
Write the lockfile with that npm, so the npm that runs `npm ci` later wrote it. If your machine has another, unpack the
`nodejs.org/dist` tarball and put its `bin/` first on `PATH`.

## Why not regenerate the lockfile from scratch

Deleting the lockfile and reinstalling re-resolves every package to the newest version its range allows. `npm install`
and `npm audit` both report that as clean, but it breaks CI in two ways:

1. **`npm ci` refuses it (`EUSAGE`).** A fresh resolve can hoist a package the committed tree keeps nested. The case
   that hit us: a hard dependency on `@noble/hashes@1.4.0` deep in the tree, plus an optional peer
   `@noble/hashes@^1.8.0 || ^2.0.0` elsewhere. Committed, 1.4.0 sat nested; fresh, it was hoisted to the root, where
   the optional peer wanted 2.x, and `npm ci` failed with "lock file's X does not satisfy Y" / "Missing: X from lock
   file". `npm install` accepts such a lockfile; only `npm ci` rejects it.
2. **It drifts past CI's Node.** A fresh resolve once pulled `jsdom` 30 and friends declaring `node: ^22 || >=24`
   while CI was on Node 20 (`EBADENGINE`). The same can happen against any pinned Node.

## Incremental update

Start from the committed lockfile and edit `package.json` pins / `overrides` first. Then drop only the entries npm
will not move by itself and let it re-resolve that subtree:

- the peer-coupled family it `ERESOLVE`s on (`@angular/*`, `@angular-devkit/*`, `@ngtools/*`);
- every `overrides` target (an override is ignored unless its entry is re-resolved);
- any flagged transitive package whose fixed version its declaring range already admits (only its entry is stale).

Drop them at every nesting depth (keys matching `(^|/)node_modules/<name>$`) with a short script over
`package-lock.json`'s `packages` map, then:

1. `rm -rf node_modules && npm install`
2. Install **again** and confirm nothing moves (`cmp` the lockfile against the first pass); repeat until a pass
   changes nothing. One pass is not guaranteed to restore everything that was dropped: once the first pass left a
   package without some of its dependencies, so `npm audit` read 0 (the vulnerable packages were absent) while the
   lockfile was exactly the "Missing: … from lock file" kind `npm ci` refuses.
3. `npm ls --all > /dev/null` exits 0 (UNMET OPTIONAL lines are fine).

## The gate before pushing a dependency change

From a clean `node_modules`, with CI's Node:

1. `npm ci` exits 0.
2. `npm audit` reports 0 vulnerabilities.
3. `npm run test:ci` and `npm run build` pass (a lockfile can satisfy `npm ci` and still break the app).
4. Every `packages[*].engines.node` in the lockfile admits CI's Node: check with `semver.satisfies` in a one-off
   `node -e` script. `semver` is not a direct dependency; it resolves from the tree `npm ci` just installed, so run
   this last (after `npm ci --dry-run` it fails with `MODULE_NOT_FOUND`).

## Overrides: adding and dropping

- When `npm audit` flags a transitive package upstream has not bumped, raise its floor in `overrides`. Use the global
  form so it dedupes with other declarers.
- An override applies to every declarer. After any toolchain major, check that each floor still sits on the major
  every declarer asks for: stale `@babel/core` / `vite` floors once forced Angular's own builder back onto old majors.
- Drop an override once it does nothing: its target has left the tree, or every range declaring it already admits the
  floor (`npm ls <name>` shows the declarers). Dead overrides mislead.
- An advisory with no patched release (`braces`, `sprintf-js` in the past) cannot be fixed by a floor; remove the path
  that pulls it in.

## Known npm failures

- **`Cannot read properties of null (reading 'edgesOut')`** in `#loadPeerSet`: a freshly published package's peer set
  is inconsistent (an npm bug). Confirm with `npm view <pkg> time`, then `npm install --before=<ISO time just before
  it>`. The cutoff only constrains entries being re-resolved; check every fixed version you need predates it.
- **Optional-peer strays:** npm 10 recorded packages reachable only through optional peers (`"optional": true,
  "peer": true`), which npm 11 prunes. If a diff shows such entries appearing, the lockfile was written with an older
  npm.
- npm 11 runs no unapproved install scripts (esbuild, lmdb, msgpackr-extract, unrs-resolver, `@parcel/watcher`); they
  only fetch or check optional native binaries, and CI runs the same npm.
