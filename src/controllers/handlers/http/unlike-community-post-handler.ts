import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityPostNotFoundError } from '../../../logic/community/errors'

export async function unlikeCommunityPostHandler(
  context: Pick<
    HandlerContextWithPath<'communityPosts' | 'logs', '/v1/communities/:id/posts/:postId/like'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { communityPosts, logs },
    params: { id: communityId, postId },
    verification
  } = context

  const logger = logs.getLogger('unlike-community-post-handler')
  const userAddress = verification!.auth.toLowerCase()

  try {
    await communityPosts.unlikePost(communityId, postId, userAddress)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error unliking post: ${postId} in community: ${communityId}, error: ${message}`)

    if (error instanceof CommunityPostNotFoundError || error instanceof NotAuthorizedError) {
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
