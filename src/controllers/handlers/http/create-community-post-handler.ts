import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types/http'

export type CreatePostRequestBody = {
  content: string
}

export async function createCommunityPostHandler(
  context: HandlerContextWithPath<'communityPosts' | 'logs', '/v1/communities/:id/posts'> &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse> {
  const { components, params, verification, request } = context
  const { communityPosts, logs } = components
  const logger = logs.getLogger('create-community-post-handler')

  const userAddress = verification!.auth.toLowerCase()

  const body = (await request.json()) as CreatePostRequestBody
  const { content } = body

  if (!content) {
    throw new InvalidRequestError('Content is required')
  }

  const post = await communityPosts.createPost(params.id, userAddress, content)

  logger.info('Post created successfully', {
    postId: post.id,
    communityId: params.id,
    authorAddress: userAddress
  })

  return {
    status: 201,
    body: {
      message: 'Post created successfully',
      data: post
    }
  }
}
