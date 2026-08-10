/**
 * Leading bytes of the thumbnail formats this service accepts, and the media
 * type each one denotes.
 *
 * Only fixed signature bytes are inspected. Variable-depth container parsing is
 * intentionally kept off the main Node.js thread; full decoding must run in a
 * resource-bounded worker if it is ever added.
 */
const IMAGE_SIGNATURES: { mimeType: SupportedImageMimeType; bytes: number[] }[] = [
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
  { mimeType: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] } // GIF89a
]

/** RIFF containers name their format at offset 8, after the size field. */
const RIFF_HEADER = 'RIFF'
const WEBP_FORM_TYPE = 'WEBP'

export type SupportedImageMimeType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

/** Rejection message for bytes that announce none of the formats above. */
export const UNSUPPORTED_IMAGE_SIGNATURE_MESSAGE =
  'Thumbnail must start with a supported PNG, JPEG, GIF or WebP signature'

/**
 * Reads the media type a buffer's leading bytes announce.
 *
 * The answer travels with the bytes: it is what the thumbnail is stored and
 * served as, so a JPEG is not labelled as a PNG further down.
 *
 * @param buffer - Uploaded thumbnail bytes.
 * @returns The media type, or null when the bytes start with no supported
 * signature.
 */
export function detectImageMimeType(buffer: Buffer): SupportedImageMimeType | null {
  const signature = IMAGE_SIGNATURES.find(
    ({ bytes }) => buffer.length >= bytes.length && buffer.subarray(0, bytes.length).equals(Buffer.from(bytes))
  )

  if (signature) {
    return signature.mimeType
  }

  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === RIFF_HEADER &&
    buffer.subarray(8, 12).toString('ascii') === WEBP_FORM_TYPE

  return isWebp ? 'image/webp' : null
}
