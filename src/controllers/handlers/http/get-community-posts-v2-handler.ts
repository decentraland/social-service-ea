import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, HTTPResponse } from '../../../types/http'
import { getPaginationParams, NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityPostWithLikes } from '../../../logic/community/types'
import { CommunityNotFoundError } from '../../../logic/community/errors'
import { errorMessageOrDefault } from '../../../utils/errors'

/**
 * v2 of {@link getCommunityPostsHandler}: returns the post author addresses only, without
 * any profile information.
 */
export async function getCommunityPostsV2Handler(
  context: HandlerContextWithPath<'communityPosts' | 'logs', '/v2/communities/:id/posts'> &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse<{ posts: CommunityPostWithLikes[]; total: number }>> {
  const { components, params, verification, url } = context
  const { communityPosts, logs } = components
  const logger = logs.getLogger('get-community-posts-v2-handler')

  const userAddress = verification?.auth?.toLowerCase()
  const pagination = getPaginationParams(url.searchParams)

  try {
    const result = await communityPosts.getPostsWithoutProfiles(params.id, {
      pagination,
      userAddress
    })

    logger.info('Posts (v2) retrieved successfully', {
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
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting posts (v2) for community: ${params.id}, error: ${message}`)

    if (error instanceof CommunityNotFoundError || error instanceof NotAuthorizedError) {
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
