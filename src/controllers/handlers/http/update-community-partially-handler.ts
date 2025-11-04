import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityNotFoundError } from '../../../logic/community/errors'
import { UpdateCommunityPartiallyRequestBody } from './schemas'

export async function updateCommunityPartiallyHandler(
  context: Pick<
    HandlerContextWithPath<'communities' | 'logs', '/v1/communities/:id'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse> {
  const {
    components: { communities, logs },
    params: { id: communityId },
    verification,
    request
  } = context

  const logger = logs.getLogger('update-community-partially-handler')
  const userAddress = verification!.auth.toLowerCase()

  try {
    const body: UpdateCommunityPartiallyRequestBody = await request.json()

    await communities.updateEditorChoice(communityId, userAddress, body.editorsChoice)

    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error updating community partially ${communityId}: ${message}`)

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
