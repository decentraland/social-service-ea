import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { FormHandlerContextWithPath, HTTPResponse } from '../../types/http'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityNotFoundError } from '../../logic/community'
import { validateCommunityFields } from '../../utils/community-validation'

export async function updateCommunityHandler(
  context: FormHandlerContextWithPath<'communities' | 'logs', '/v1/communities/:id'> & DecentralandSignatureContext<any>
): Promise<HTTPResponse> {
  const {
    components: { communities, logs },
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
    } = await validateCommunityFields(formData, thumbnailBuffer)

    logger.info('Updating community', {
      communityId,
      userAddress,
      updates: JSON.stringify({ name, description, placeIds: placeIds ? placeIds.length : 0 }),
      hasThumbnail: validatedThumbnail ? 'true' : 'false'
    })

    const updatedCommunity = await communities.updateCommunity(communityId, userAddress, {
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
