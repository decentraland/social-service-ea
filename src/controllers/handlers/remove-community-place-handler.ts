import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityNotFoundError } from '../../logic/community'

export async function removeCommunityPlaceHandler(
  context: Pick<
    HandlerContextWithPath<'communityPlaces' | 'logs', '/v1/communities/:id/places/:placeId'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityPlaces, logs },
    verification,
    params
  } = context

  const logger = logs.getLogger('remove-community-place-handler')
  const { id: communityId, placeId } = params
  const userAddress = verification!.auth.toLowerCase()

  try {
    await communityPlaces.removePlace(communityId, userAddress, placeId)
    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error removing place ${placeId} from community ${communityId}: ${message}`)

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
