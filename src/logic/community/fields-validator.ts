import { InvalidRequestError } from '@dcl/http-commons'
import { CommunityPrivacyEnum, CommunityVisibilityEnum } from '.'
import { AppComponents } from '../../types/system'
import {
  ICommunityFieldsValidatorComponent,
  CommunityFieldsValidationOptions,
  CommunityFieldsValidationFields
} from './types'

const MIN_THUMBNAIL_BYTES = 1024
const MAX_THUMBNAIL_BYTES = 500 * 1024

/**
 * Checks only fixed signature bytes for the supported thumbnail formats.
 *
 * Variable-depth container parsing is intentionally kept off the main Node.js thread. Full
 * decoding must run in a resource-bounded worker if it is added in the future.
 *
 * @param buffer - Uploaded thumbnail bytes
 * @returns Whether the bytes start with a supported PNG, JPEG, GIF or WebP signature
 */
function hasSupportedImageSignature(buffer: Buffer): boolean {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const isPng = buffer.length >= pngSignature.length && buffer.subarray(0, pngSignature.length).equals(pngSignature)
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  const gifSignature = buffer.subarray(0, 6).toString('ascii')
  const isGif = gifSignature === 'GIF87a' || gifSignature === 'GIF89a'
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'

  return isPng || isJpeg || isGif || isWebp
}

export async function createCommunityFieldsValidatorComponent(
  components: Pick<AppComponents, 'config'>
): Promise<ICommunityFieldsValidatorComponent> {
  const { config } = components

  const restrictedNames = ((await config.getString('RESTRICTED_NAMES')) || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)

  return {
    validate: async (
      formData: any,
      thumbnailBuffer?: Buffer,
      options?: CommunityFieldsValidationOptions
    ): Promise<CommunityFieldsValidationFields> => {
      const { requireName = false, requireDescription = false } = options ?? {}

      const name: string | undefined = formData.fields.name?.value
      const description: string | undefined = formData.fields.description?.value
      const placeIdsField: string | undefined = formData.fields.placeIds?.value
      const privacy: string | undefined = formData.fields.privacy?.value
      const visibility: string | undefined = formData.fields.visibility?.value

      let placeIds: string[] | undefined = undefined
      if (placeIdsField) {
        let parsedPlaceIds: unknown
        try {
          parsedPlaceIds = JSON.parse(placeIdsField)
        } catch (error) {
          throw new InvalidRequestError('placeIds must be a valid JSON array')
        }
        if (!Array.isArray(parsedPlaceIds) || !parsedPlaceIds.every((id) => typeof id === 'string')) {
          throw new InvalidRequestError('placeIds must be a valid JSON array')
        }
        placeIds = parsedPlaceIds
      }

      if (requireName || name !== undefined) {
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          throw new InvalidRequestError('Name must be a non-empty string')
        } else if (name.length > 30) {
          throw new InvalidRequestError('Name must be less or equal to 30 characters')
        } else if (restrictedNames.includes(name.trim().toLowerCase())) {
          throw new InvalidRequestError('Name is not allowed')
        }
      }

      if (requireDescription || description !== undefined) {
        if (!description || typeof description !== 'string' || description.trim().length === 0) {
          throw new InvalidRequestError('Description must be a non-empty string')
        } else if (description.length > 500) {
          throw new InvalidRequestError('Description must be less or equal to 500 characters')
        }
      }

      // Always require at least one field for updates
      if (
        name === undefined &&
        description === undefined &&
        !thumbnailBuffer &&
        placeIds === undefined &&
        privacy === undefined &&
        visibility === undefined
      ) {
        throw new InvalidRequestError('At least one field must be provided for update')
      }

      // Validate thumbnail if provided
      if (thumbnailBuffer) {
        const size = thumbnailBuffer.length
        if (size < MIN_THUMBNAIL_BYTES || size > MAX_THUMBNAIL_BYTES) {
          throw new InvalidRequestError('Thumbnail size must be between 1KB and 500KB')
        }

        if (!hasSupportedImageSignature(thumbnailBuffer)) {
          throw new InvalidRequestError('Thumbnail must be a valid PNG, JPEG, GIF or WebP image')
        }
      }

      return {
        name,
        description,
        placeIds,
        privacy: (privacy?.trim() as CommunityPrivacyEnum) ?? undefined,
        visibility: (visibility?.trim() as CommunityVisibilityEnum) ?? undefined,
        thumbnailBuffer
      }
    }
  }
}
