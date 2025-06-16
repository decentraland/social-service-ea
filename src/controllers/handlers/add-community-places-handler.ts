import { HandlerContextWithPath, HTTPResponse } from '../../types'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { errorMessageOrDefault } from '../../utils/errors'
import { CommunityNotFoundError } from '../../logic/community'

interface AddPlacesRequest {
  placeIds: string[]
}

export async function addCommunityPlacesHandler(
  context: HandlerContextWithPath<'communityPlaces' | 'logs', '/v1/communities/:id/places'> &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse> {
  const {
    components: { communityPlaces, logs },
    request,
    verification,
    params
  } = context

  const logger = logs.getLogger('add-community-place-handler')
  const { id: communityId } = params
  const userAddress = verification!.auth.toLowerCase()

  try {
    const body: AddPlacesRequest = await request.json()
    const { placeIds } = body

    if (!Array.isArray(placeIds)) {
      throw new InvalidRequestError('placeIds must be an array')
    }

    await communityPlaces.addPlaces(communityId, userAddress, placeIds)
    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error adding places to community ${communityId}: ${message}`)

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
