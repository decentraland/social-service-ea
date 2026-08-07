import { detectImageMimeType } from '../../../src/logic/community/image-signature'

function bufferStartingWith(bytes: number[]): Buffer {
  const buffer = Buffer.alloc(2048)
  Buffer.from(bytes).copy(buffer)
  return buffer
}

describe('when detecting the media type of a thumbnail', () => {
  describe.each([
    ['a PNG', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'],
    ['a JPEG', [0xff, 0xd8, 0xff, 0xe0], 'image/jpeg'],
    ['a GIF87a', [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], 'image/gif'],
    ['a GIF89a', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'image/gif'],
    [
      'a WebP',
      [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
      'image/webp'
    ]
  ])('and the bytes start with %s signature', (_format: string, bytes: number[], expected: string) => {
    let buffer: Buffer

    beforeEach(() => {
      buffer = bufferStartingWith(bytes)
    })

    it('should return the media type those bytes announce', () => {
      expect(detectImageMimeType(buffer)).toBe(expected)
    })
  })

  describe('and the bytes start with no supported signature', () => {
    let buffer: Buffer

    beforeEach(() => {
      buffer = Buffer.alloc(2048, 0x61)
    })

    it('should return null', () => {
      expect(detectImageMimeType(buffer)).toBeNull()
    })
  })

  describe('and the bytes are a RIFF container that is not WebP', () => {
    let buffer: Buffer

    beforeEach(() => {
      // RIFF header, but the form type at offset 8 says AVI.
      buffer = bufferStartingWith([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20
      ])
    })

    it('should return null rather than assume WebP from the container alone', () => {
      expect(detectImageMimeType(buffer)).toBeNull()
    })
  })

  describe('and the buffer is shorter than the signature it starts to match', () => {
    let buffer: Buffer

    beforeEach(() => {
      buffer = Buffer.from([0x89, 0x50, 0x4e])
    })

    it('should return null', () => {
      expect(detectImageMimeType(buffer)).toBeNull()
    })
  })
})
