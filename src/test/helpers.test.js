import { describe, it, expect } from 'vitest'
import { fakeFile } from './helpers.js'

describe('test setup smoke test', () => {
  it('runs in a jsdom environment (File is available)', () => {
    expect(typeof File).toBe('function')
    expect(typeof document).toBe('object')
  })
})

describe('fakeFile', () => {
  it('produces a File instance with default type and size', () => {
    const file = fakeFile()
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/jpeg')
    expect(file.size).toBe(0)
  })

  it('reports the declared size without allocating real bytes', () => {
    const file = fakeFile({ type: 'image/png', size: 20 * 1024 * 1024 })
    expect(file.type).toBe('image/png')
    expect(file.size).toBe(20 * 1024 * 1024)
  })
})
