import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types/http'
import { CommunityPost } from '../../../logic/community/types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityNotFoundError } from '../../../logic/community/errors'
import { CreateCommunityPostRequestBody } from './schemas'

export async function createCommunityPostHandler(
  context: HandlerContextWithPath<'communityPosts' | 'logs', '/v1/communities/:id/posts'> &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse<CommunityPost>> {
  const { components, params, verification, request } = context
  const { communityPosts, logs } = components
  const logger = logs.getLogger('create-community-post-handler')

  const userAddress = verification!.auth.toLowerCase()

  try {
    const body: CreateCommunityPostRequestBody = await request.json()
    const trimmedContent = body.content.trim()

    const post = await communityPosts.createPost(params.id, userAddress, trimmedContent)

    logger.info('Post created successfully', {
      postId: post.id,
      communityId: params.id,
      authorAddress: userAddress
    })

    return {
      status: 201,
      body: {
        data: post
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error creating post: ${params.id}, error: ${message}`)

    if (
      error instanceof CommunityNotFoundError ||
      error instanceof NotAuthorizedError ||
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
