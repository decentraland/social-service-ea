import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { FormHandlerContextWithPath, HTTPResponse } from '../../types/http'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityNotFoundError } from '../../logic/community'
import fileType from 'file-type'

async function validateFields(formData: any, thumbnailBuffer?: Buffer) {
  const name: string | undefined = formData.fields.name?.value
  const description: string | undefined = formData.fields.description?.value
  const placeIdsField: string | undefined = formData.fields.placeIds?.value

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

  if (name === undefined && description === undefined && !thumbnailBuffer && placeIds === undefined) {
    throw new InvalidRequestError('At least one field must be provided for update')
  }

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    throw new InvalidRequestError('Name must be a non-empty string')
  }

  if (description !== undefined && (typeof description !== 'string' || description.trim().length === 0)) {
    throw new InvalidRequestError('Description must be a non-empty string')
  }

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
    thumbnailBuffer
  }
}

export async function updateCommunityHandler(
  context: FormHandlerContextWithPath<'community' | 'logs', '/v1/communities/:id'> & DecentralandSignatureContext<any>
): Promise<HTTPResponse> {
  const {
    components: { community, logs },
    verification,
    formData,
    params
  } = context

  const logger = logs.getLogger('update-community-handler')
  const { id: communityId } = params
  const userAddress = verification!.auth.toLowerCase()

  try {
    const thumbnailFile = formData?.files?.['thumbnail']
    const thumbnailBuffer = thumbnailFile?.value

    const {
      name,
      description,
      placeIds,
      thumbnailBuffer: validatedThumbnail
    } = await validateFields(formData, thumbnailBuffer)

    logger.info('Updating community', {
      communityId,
      userAddress,
      updates: JSON.stringify({ name, description, placeIds }),
      hasThumbnail: validatedThumbnail ? 'true' : 'false'
    })

    const updatedCommunity = await community.updateCommunity(communityId, userAddress, {
      name,
      description,
      placeIds,
      thumbnailBuffer: validatedThumbnail
    })

    return {
      status: 200,
      body: {
        message: 'Community updated successfully',
        data: updatedCommunity
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error updating community ${communityId}: ${message}`)

    if (
      error instanceof CommunityNotFoundError ||
      error instanceof NotAuthorizedError ||
      error instanceof InvalidRequestError
    ) {
      throw error
    }

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
