import { EthAddress } from '@dcl/schemas'
import { MemberRequest } from '../../../logic/community/types'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { CommunityNotFoundError, InvalidCommunityRequestError } from '../../../logic/community'
import { errorMessageOrDefault } from '../../../utils/errors'
import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CreateCommunityRequestRequestBody } from './schemas'

export async function createCommunityRequestHandler(
  context: Pick<
    HandlerContextWithPath<'communityRequests' | 'logs', '/v1/communities/:id/requests'> &
      DecentralandSignatureContext<any>,
    'components' | 'request' | 'params' | 'verification'
  >
): Promise<HTTPResponse<MemberRequest>> {
  const {
    components: { communityRequests, logs },
    params: { id: communityId },
    verification,
    request
  } = context

  const logger = logs.getLogger('create-community-request-handler')

  const body: CreateCommunityRequestRequestBody = await request.json()

  try {
    const callerAddress = verification!.auth.toLowerCase()

    const communityRequest = await communityRequests.createCommunityRequest(
      communityId,
      body.targetedAddress as EthAddress,
      body.type,
      callerAddress
    )

    return {
      status: 200,
      body: {
        data: {
          ...communityRequest
        }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)

    logger.error(`Error creating community request: ${message}`, {
      communityId,
      targetedAddress: body.targetedAddress,
      type: body.type
    })

    if (
      error instanceof InvalidCommunityRequestError ||
      error instanceof CommunityNotFoundError ||
      error instanceof NotAuthorizedError
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
