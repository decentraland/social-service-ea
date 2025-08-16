import { EthAddress } from '@dcl/schemas'
import { MemberRequest, CommunityRequestType } from '../../../logic/community/types'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { CommunityNotFoundError, InvalidCommunityRequestError } from '../../../logic/community'
import { errorMessageOrDefault } from '../../../utils/errors'

export async function createCommunityRequestHandler(
  context: Pick<
    HandlerContextWithPath<'communityRequests' | 'logs', '/v1/communities/:id/requests'>,
    'components' | 'request' | 'params'
  >
): Promise<HTTPResponse<MemberRequest>> {
  const {
    components: { communityRequests, logs },
    params: { id: communityId },
    request
  } = context

  const logger = logs.getLogger('create-community-request-handler')

  let body: { targetedAddress: string; type: CommunityRequestType }

  try {
    body = await request.json()
  } catch (error) {
    return {
      status: 400,
      body: {
        message: 'Invalid JSON in request body'
      }
    }
  }

  try {
    if (!body.targetedAddress || !body.type) {
      throw new InvalidCommunityRequestError('Missing targetedAddress or type field')
    }

    if (!EthAddress.validate(body.targetedAddress)) {
      throw new InvalidCommunityRequestError('Invalid targeted address')
    }

    if (!Object.values(CommunityRequestType).includes(body.type)) {
      throw new InvalidCommunityRequestError('Invalid type value')
    }

    const communityRequest = await communityRequests.createCommunityRequest(
      communityId,
      body.targetedAddress as EthAddress,
      body.type
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

    if (error instanceof InvalidCommunityRequestError || error instanceof CommunityNotFoundError) {
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
