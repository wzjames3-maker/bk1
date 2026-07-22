import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRewriteLockParams,
  hasRewriteLock,
} from './episode-rewrite-guard'

test('treats only true or a non-empty token as an active rewrite lock', () => {
  assert.equal(hasRewriteLock({ rewrite_in_progress: true }), true)
  assert.equal(hasRewriteLock({ rewrite_in_progress: 'lock-token' }), true)
  assert.equal(hasRewriteLock({ rewrite_in_progress: false }), false)
  assert.equal(hasRewriteLock({}), false)
})

test('adds a token lock without dropping existing episode parameters', () => {
  const params = buildRewriteLockParams(
    { duration_min: 10, rewrite_count: 2, tts_segments: [{ durationMs: 1000 }] },
    'lock-token'
  )

  assert.deepEqual(params, {
    duration_min: 10,
    rewrite_count: 2,
    tts_segments: [{ durationMs: 1000 }],
    rewrite_in_progress: 'lock-token',
  })
})
