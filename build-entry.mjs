// Inlines the canonical pure logic (logic.js) into index.jsx between the
// INLINE-LOGIC sentinels, stripping the `export` keywords. Mobius's app
// installer fetches and compiles ONLY the single `entry` file (it never
// fetches sibling .js modules), so the production entry must be self-contained
// — a relative `import './logic.js'` would fail at install-time esbuild.
//
// logic.js stays the source of truth: it's what __tests__ imports and what
// this script copies. Run `node build-entry.mjs` after editing logic.js; the
// test asserts the inlined block is in sync, so a forgotten rebuild fails CI.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const START = '// ===== INLINE-LOGIC START (generated from logic.js — run build-entry.mjs) ====='
const END = '// ===== INLINE-LOGIC END ====='
const TEST_EXPORTS = [
  'normalizeEntry',
  'normalizeStoredEntries',
  'mergeEntriesForSave',
  'draftsFromParsedPayload',
  'groupSessions',
  'summarizeMetrics',
]

export function stripExports(logicSource) {
  // Drop the leading export keyword from top-level declarations and re-exports.
  // logic.js only uses `export function`, `export const`. The inlined copy is
  // module-local, so the names are just in-file bindings.
  return logicSource
    .replace(/^export\s+(function|const|let|class)\b/gm, '$1')
    .trimEnd()
}

export function buildEntry(indexSource, logicSource) {
  const inlined = stripExports(logicSource)
  const exportBlock = `export {\n  ${TEST_EXPORTS.join(',\n  ')},\n}`
  const block = `${START}\n${inlined}\n\n${exportBlock}\n${END}`
  const re = new RegExp(`${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}`)
  if (!re.test(indexSource)) {
    throw new Error('index.jsx is missing the INLINE-LOGIC sentinels')
  }
  return indexSource.replace(re, block)
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Run as a script (not when imported by the test).
if (process.argv[1] && process.argv[1].endsWith('build-entry.mjs')) {
  const indexPath = join(here, 'index.jsx')
  const logicPath = join(here, 'logic.js')
  const next = buildEntry(readFileSync(indexPath, 'utf8'), readFileSync(logicPath, 'utf8'))
  writeFileSync(indexPath, next)
  console.log('index.jsx logic block regenerated from logic.js')
}
