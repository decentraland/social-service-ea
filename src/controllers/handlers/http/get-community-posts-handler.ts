import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, HTTPResponse } from '../../../types/http'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { CommunityPostWithProfile } from '../../../logic/community/types'

export async function getCommunityPostsHandler(
  context: HandlerContextWithPath<'communityPosts' | 'logs', '/v1/communities/:id/posts'> &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse<{ posts: CommunityPostWithProfile[]; total: number }>> {
  const { components, params, verification, url } = context
  const { communityPosts, logs } = components
  const logger = logs.getLogger('get-community-posts-handler')

  // Get optional user address for authentication
  const userAddress = verification?.auth?.toLowerCase()

  // Parse pagination from query parameters
  const limit = Number(url.searchParams.get('limit') || '20')
  const offset = Number(url.searchParams.get('offset') || '0')

  if (isNaN(limit) || limit <= 0 || limit > 100) {
    throw new InvalidRequestError('Invalid limit. Must be a positive number up to 100.')
  }
  if (isNaN(offset) || offset < 0) {
    throw new InvalidRequestError('Invalid offset. Must be a non-negative number.')
  }

  // Get posts
  const result = await communityPosts.getPosts(params.id, {
    pagination: { limit, offset },
    userAddress
  })

  logger.info('Posts retrieved successfully', {
    communityId: params.id,
    count: result.posts.length,
    total: result.total,
    userAddress: userAddress || 'anonymous'
  })

  return {
    status: 200,
    body: {
      data: {
        posts: result.posts,
        total: result.total
      }
    }
  }
}
