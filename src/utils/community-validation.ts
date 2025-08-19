import { InvalidRequestError } from '@dcl/platform-server-commons'
import fileType from 'file-type'
import { CommunityPrivacyEnum } from '../logic/community'
import { IAIContentValidatorComponent } from '../types/components'

export interface CommunityValidationFields {
  name?: string
  description?: string
  placeIds?: string[]
  thumbnailBuffer?: Buffer
  privacy: CommunityPrivacyEnum
}

export interface CommunityValidationOptions {
  requireName?: boolean
  requireDescription?: boolean
  aiContentValidator?: IAIContentValidatorComponent
}

export async function validateCommunityFields(
  formData: any,
  thumbnailBuffer?: Buffer,
  options: CommunityValidationOptions = {}
): Promise<CommunityValidationFields> {
  const { requireName = false, requireDescription = false, aiContentValidator } = options

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
    }
  }

  if (requireDescription || description !== undefined) {
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      throw new InvalidRequestError('Description must be a non-empty string')
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

  // AI Content Validation
  if (aiContentValidator && name && description) {
    const imageBase64 = thumbnailBuffer ? thumbnailBuffer.toString('base64') : undefined

    const isContentAppropriate = await aiContentValidator.validateContent({
      title: name,
      description: description,
      image: imageBase64
    })

    if (!isContentAppropriate) {
      throw new InvalidRequestError('Community content does not meet platform guidelines')
    }
  }

  return {
    name,
    description,
    placeIds,
    privacy: privacy === 'private' ? CommunityPrivacyEnum.Private : CommunityPrivacyEnum.Public,
    thumbnailBuffer
  }
}
