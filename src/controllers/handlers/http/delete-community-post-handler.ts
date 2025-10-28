import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, HTTPResponse } from '../../../types/http'

export async function deleteCommunityPostHandler(
  context: HandlerContextWithPath<'communityPosts' | 'logs', '/v1/communities/:id/posts/:postId'> &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse> {
  const { components, params, verification } = context
  const { communityPosts, logs } = components
  const logger = logs.getLogger('delete-community-post-handler')

  // Get authenticated user address
  const userAddress = verification!.auth.toLowerCase()

  // Delete the post
  await communityPosts.deletePost(params.postId, userAddress)

  logger.info('Post deleted successfully', {
    postId: params.postId,
    communityId: params.id,
    deleterAddress: userAddress
  })

  return {
    status: 204,
    body: undefined
  }
}
