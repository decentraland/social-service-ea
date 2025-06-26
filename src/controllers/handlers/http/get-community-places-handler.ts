import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { PaginatedResponse } from '@dcl/schemas'
import { CommunityNotFoundError, CommunityPlace } from '../../../logic/community'
import { getPaginationResultProperties } from '../../../utils/pagination'

export async function getCommunityPlacesHandler(
  context: Pick<
    HandlerContextWithPath<'communityPlaces' | 'logs', '/v1/communities/:id/places'>,
    'components' | 'url' | 'verification' | 'params'
  >
): Promise<HTTPResponse<PaginatedResponse<Pick<CommunityPlace, 'id'>>>> {
  const {
    components: { communityPlaces, logs },
    verification,
    url,
    params: { id: communityId }
  } = context
  const logger = logs.getLogger('get-community-places-handler')

  logger.info(`Getting places for community ${communityId}`)

  try {
    const userAddress = verification?.auth?.toLowerCase()
    const paginationParams = getPaginationParams(url.searchParams)
    const { places, totalPlaces } = await communityPlaces.getPlaces(communityId, {
      userAddress,
      pagination: paginationParams
    })

    return {
      status: 200,
      body: {
        data: {
          results: places,
          total: totalPlaces,
          ...getPaginationResultProperties(totalPlaces, paginationParams)
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting places: ${communityId}, error: ${message}`)

    if (error instanceof CommunityNotFoundError || error instanceof NotAuthorizedError) {
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
