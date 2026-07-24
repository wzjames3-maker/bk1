import assert from 'node:assert/strict'
import test from 'node:test'
import { parseScript } from './script-parser'

test('parses structured dialogue with Chinese colon', () => {
  const input = `小林：大家好，今天聊AI。
老陈：好，我先说说背景。
小林：对，这个话题很火。
老陈：没错，发展很快。`

  const result = parseScript(input)
  assert.equal(result.length, 4)
  assert.equal(result[0].role, '小林')
  assert.equal(result[0].text, '大家好，今天聊AI。')
  assert.equal(result[1].role, '老陈')
  assert.equal(result[0].emotion, '中性')
  assert.equal(result[0].pause_ms, 300)
})

test('parses structured dialogue with English colon', () => {
  const input = `Host: Welcome to the show.
Guest: Thanks for having me.
Host: Let us dive in.
Guest: Sure thing.`

  const result = parseScript(input)
  assert.equal(result.length, 4)
  assert.equal(result[0].role, 'Host')
  assert.equal(result[0].text, 'Welcome to the show.')
})

test('parses plain text as monologue with role 主播', () => {
  const input = `今天我们来聊聊人工智能的发展。
从最早的专家系统到现在的深度学习，AI经历了巨大的变化。
未来会怎样呢？让我们一起探讨。`

  const result = parseScript(input)
  assert.equal(result.length, 3)
  assert.ok(result.every(s => s.role === '主播'))
})

test('splits long plain text paragraph at sentence boundaries', () => {
  const longLine = '这是第一句话。这是第二句话。'.repeat(20)
  const result = parseScript(longLine)
  assert.ok(result.length > 1)
  assert.ok(result.every(s => s.text.length <= 200))
})

test('returns empty array for empty input', () => {
  assert.deepEqual(parseScript(''), [])
  assert.deepEqual(parseScript('   \n  \n  '), [])
})
