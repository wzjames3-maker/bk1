import assert from 'node:assert/strict'
import test from 'node:test'
import { validateSegments, normalizeSegments, validateFinal } from './script-validate'

test('validateSegments rejects empty and non-array', () => {
  assert.equal(validateSegments(null), false)
  assert.equal(validateSegments([]), false)
  assert.equal(validateSegments('not array'), false)
})

test('validateSegments rejects missing role or text', () => {
  assert.equal(validateSegments([{ role: '', text: 'hello' }]), false)
  assert.equal(validateSegments([{ role: 'A', text: '' }]), false)
  assert.equal(validateSegments([{ text: 'hello' }]), false)
})

test('validateSegments accepts valid segments', () => {
  assert.equal(validateSegments([{ role: '小林', text: '你好' }]), true)
})

test('normalizeSegments filters noise text and roles', () => {
  const raw = [
    { role: '小林', text: '你好', emotion: '中性', pause_ms: 300 },
    { role: '**节目名**', text: 'AI茶水间', emotion: '中性', pause_ms: 300 },
    { role: '老陈', text: '---', emotion: '中性', pause_ms: 300 },
    { role: '老陈', text: '你好啊', emotion: '中性', pause_ms: 300 },
    { role: '这是一个超级长的角色名超过十个字', text: 'test', emotion: '中性', pause_ms: 300 },
  ]
  const result = normalizeSegments(raw)
  assert.equal(result.length, 2)
  assert.equal(result[0].role, '小林')
  assert.equal(result[1].role, '老陈')
})

test('validateFinal rejects too many roles', () => {
  const segments = Array.from({ length: 6 }, (_, i) => ({
    role: `角色${i}`,
    text: `台词${i}`,
    emotion: '中性',
    pause_ms: 300,
  }))
  assert.equal(validateFinal(segments), false)
})

test('validateFinal accepts 5 or fewer roles', () => {
  const segments = Array.from({ length: 5 }, (_, i) => ({
    role: `角色${i}`,
    text: `台词${i}`,
    emotion: '中性',
    pause_ms: 300,
  }))
  assert.equal(validateFinal(segments), true)
})
