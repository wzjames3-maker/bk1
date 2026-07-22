import assert from 'node:assert/strict'
import test from 'node:test'
import { parseShowNotes } from './show-notes'

test('keeps legacy plain show notes available when a cover suggestion exists', () => {
  const parsed = parseShowNotes('旧节目简介')

  assert.deepEqual(parsed, { plain: '旧节目简介' })
})
