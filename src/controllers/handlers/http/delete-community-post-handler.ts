import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, HTTPResponse } from '../../../types/http'
import { errorMessageOrDefault } from '../../../utils/errors'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityPostNotFoundError } from '../../../logic/community'

export async function deleteCommunityPostHandler(
  context: HandlerContextWithPath<'communityPosts' | 'logs', '/v1/communities/:id/posts/:postId'> &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse> {
  const { components, params, verification } = context
  const { communityPosts, logs } = components
  const logger = logs.getLogger('delete-community-post-handler')

  const userAddress = verification!.auth.toLowerCase()

  try {
    await communityPosts.deletePost(params.postId, userAddress)

    logger.info('Post deleted successfully', {
      postId: params.postId,
      communityId: params.id,
      deleterAddress: userAddress
    })

    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error deleting post: ${params.postId} in community: ${params.id}, error: ${message}`)

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
