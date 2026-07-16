import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('exercise detail dialog owns focus, traps Tab, and restores the trigger', () => {
  const source = read('ui/ExerciseDetailSheet.jsx')
  assert.match(source, /const previousFocus = document\.activeElement/)
  assert.match(source, /closeRef\.current\?\.focus\(\)/)
  assert.match(source, /e\.key !== 'Tab'/)
  assert.match(source, /previousFocus\?\.focus\?\.\(\)/)
})

test('session validation is consolidated and rest completion is announced', () => {
  const panel = read('ui/CurrentSessionPanel.jsx')
  const card = read('ui/SessionDraftCard.jsx')
  assert.match(panel, /Complete before finishing:/)
  assert.match(panel, /role="timer" aria-live="off"/)
  assert.match(panel, /role="status" aria-live="polite"/)
  assert.doesNotMatch(card, /wk-current-session-missing/)
  assert.doesNotMatch(card, /is-incomplete/)
})

test('top-level workout tabs expose a roving keyboard tab contract', () => {
  const source = read('index.jsx')
  assert.match(source, /role="tablist"/)
  assert.match(source, /role="tab"/)
  assert.match(source, /aria-selected=\{tab === 'session'\}/)
  assert.match(source, /tabIndex=\{tab === 'session' \? 0 : -1\}/)
  assert.match(source, /event\.key === 'ArrowRight'/)
  assert.match(source, /event\.key === 'Home'/)
  assert.match(source, /role=\{!editingEntry && !quickAddDraft \? 'tabpanel'/)
})

test('live-session numeric fields reject negative browser input and completed sets have a clear undo label', () => {
  const card = read('ui/SessionDraftCard.jsx')
  assert.match(card, /Mark incomplete/)
  assert.match(card, /placeholder="reps" min="0" step="1"/)
  assert.match(card, /placeholder=\{unit\} min="0" step="any"/)
})
