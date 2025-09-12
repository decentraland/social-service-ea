import { InvalidRequestError } from '@dcl/platform-server-commons'
import fileType from 'file-type'
import { CommunityPrivacyEnum } from '.'
import { AppComponents } from '../../types/system'
import {
  ICommunityFieldsValidatorComponent,
  CommunityFieldsValidationOptions,
  CommunityFieldsValidationFields
} from './types'

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

      let placeIds: string[] | undefined = undefined
      if (placeIdsField) {
        try {
          placeIds = JSON.parse(placeIdsField)
          if (!Array.isArray(placeIds)) {
            throw new InvalidRequestError('placeIds must be a valid JSON array')
          }
        } catch (error) {
          throw new InvalidRequestError('placeIds must be a valid JSON array')
        }
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
        privacy === undefined
      ) {
        throw new InvalidRequestError('At least one field must be provided for update')
      }

      // Validate thumbnail if provided
      if (thumbnailBuffer) {
        const type = await fileType.fromBuffer(thumbnailBuffer)
        if (!type || !type.mime.startsWith('image/')) {
          throw new InvalidRequestError('Thumbnail must be a valid image file')
        }

        const size = thumbnailBuffer.length
        if (size < 1024 || size > 500 * 1024) {
          throw new InvalidRequestError('Thumbnail size must be between 1KB and 500KB')
        }
      }

      return {
        name,
        description,
        placeIds,
        privacy: (privacy?.trim() as CommunityPrivacyEnum) ?? undefined,
        thumbnailBuffer
      }
    }
  }
}
