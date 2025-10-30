import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, HTTPResponse } from '../../../types/http'
import { getPaginationParams } from '@dcl/platform-server-commons'
import { CommunityPostWithProfile } from '../../../logic/community/types'

export async function getCommunityPostsHandler(
  context: HandlerContextWithPath<'communityPosts' | 'logs', '/v1/communities/:id/posts'> &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse<{ posts: CommunityPostWithProfile[]; total: number }>> {
  const { components, params, verification, url } = context
  const { communityPosts, logs } = components
  const logger = logs.getLogger('get-community-posts-handler')

  const userAddress = verification?.auth?.toLowerCase()
  const pagination = getPaginationParams(url.searchParams)

  const result = await communityPosts.getPosts(params.id, {
    pagination,
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
