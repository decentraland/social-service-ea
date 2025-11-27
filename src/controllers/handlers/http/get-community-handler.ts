import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import {
  CommunityNotFoundError,
  CommunityOwnerNotFoundError,
  AggregatedCommunityWithMemberAndVoiceChatData,
  CommunityPublicInformationWithVoiceChat
} from '../../../logic/community'
import { InvalidRequestError } from '@dcl/platform-server-commons'

export async function getCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'config' | 'communities', '/v1/communities/:id'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<
  HTTPResponse<
    AggregatedCommunityWithMemberAndVoiceChatData | Omit<CommunityPublicInformationWithVoiceChat, 'isHostingLiveEvent'>
  >
> {
  const {
    components: { communities, logs },
    params: { id },
    verification
  } = context
  const logger = logs.getLogger('get-community-handler')

  logger.info(`Getting community: ${id}`)

  try {
    const userAddress: string | undefined = verification?.auth?.toLowerCase()

    const data = userAddress
      ? await communities.getCommunity(id, {
          as: userAddress
        })
      : await communities.getCommunityPublicInformation(id)

    return {
      status: 200,
      body: {
        data
      }
    }
  } catch (error: any) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting community: ${id}, error: ${message}`)

    if (
      error instanceof CommunityNotFoundError ||
      error instanceof CommunityOwnerNotFoundError ||
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
