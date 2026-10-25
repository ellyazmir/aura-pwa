/**
 * Shared test helpers for the Aura test suite.
 *
 * These utilities synthesise browser objects (such as `File`) without
 * allocating real byte buffers, so property-based tests can explore very
 * large declared sizes (e.g. > 10 MB) cheaply and deterministically.
 */

/**
 * Create a synthetic `File` without allocating real bytes.
 *
 * The returned object is a genuine `File` instance (so `instanceof File`
 * and the `File` API work), but its `size` property is overridden to the
 * requested value. This lets tests assert size-limit behaviour at, above,
 * and below the 10 MB boundary without ever holding that much data in memory.
 *
 * @param {Object} [options]
 * @param {string} [options.type='image/jpeg'] - MIME type for the file.
 * @param {number} [options.size=0] - Declared byte size reported by `file.size`.
 * @param {string} [options.name='fake'] - File name.
 * @returns {File} A `File` instance with the declared `type` and `size`.
 */
export function fakeFile({ type = 'image/jpeg', size = 0, name = 'fake' } = {}) {
  const file = new File([], name, { type })
  // `File.size` is read-only; redefine it to report the declared size
  // without materialising `size` bytes of backing data.
  Object.defineProperty(file, 'size', {
    value: size,
    writable: false,
    configurable: true,
  })
  return file
}
