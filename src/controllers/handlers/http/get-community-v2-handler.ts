import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import {
  CommunityNotFoundError,
  AggregatedCommunityWithMemberAndVoiceChatDataV2,
  CommunityPublicInformationWithVoiceChatV2
} from '../../../logic/community'
import { InvalidRequestError } from '@dcl/http-commons'

/**
 * v2 of {@link getCommunityHandler}: returns the owner address only (no owner name) and
 * never fails when the owner profile cannot be resolved.
 */
export async function getCommunityV2Handler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'config' | 'communities', '/v2/communities/:id'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<
  HTTPResponse<
    | AggregatedCommunityWithMemberAndVoiceChatDataV2
    | Omit<CommunityPublicInformationWithVoiceChatV2, 'isHostingLiveEvent'>
  >
> {
  const {
    components: { communities, logs },
    params: { id },
    verification
  } = context
  const logger = logs.getLogger('get-community-v2-handler')

  logger.info(`Getting community (v2): ${id}`)

  try {
    const userAddress: string | undefined = verification?.auth?.toLowerCase()

    const data = userAddress
      ? await communities.getCommunityWithoutProfile(id, {
          as: userAddress
        })
      : await communities.getCommunityPublicInformationWithoutProfile(id)

    return {
      status: 200,
      body: {
        data
      }
    }
  } catch (error: any) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting community (v2): ${id}, error: ${message}`)

    if (error instanceof CommunityNotFoundError || error instanceof InvalidRequestError) {
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
