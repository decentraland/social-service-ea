import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError, CommunityRequestNotFoundError } from '../../../logic/community'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { UpdateCommunityRequestStatusRequestBody } from './schemas'

export async function updateCommunityRequestStatusHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communityRequests', '/v1/communities/:id/requests/:requestId'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse> {
  const {
    components: { logs, communityRequests },
    params: { id: communityId, requestId },
    verification,
    request
  } = context

  const logger = logs.getLogger('update-community-request-status-handler')
  const body: UpdateCommunityRequestStatusRequestBody = await request.json()

  try {
    await communityRequests.updateRequestStatus(requestId, body.intention, {
      callerAddress: verification!.auth.toLowerCase()
    })

    logger.info('Community request status updated', {
      requestId,
      communityId: communityId,
      intention: body.intention,
      callerAddress: verification!.auth.toLowerCase()
    })

    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error updating community request status: ${message}`, {
      requestId,
      communityId: communityId,
      intention: body.intention,
      callerAddress: verification!.auth.toLowerCase()
    })

    if (
      error instanceof CommunityRequestNotFoundError ||
      error instanceof CommunityNotFoundError ||
      error instanceof NotAuthorizedError ||
      error instanceof InvalidRequestError
    ) {
      throw error
    }

    return {
      status: 500,
      body: { message }
    }
  }
}
