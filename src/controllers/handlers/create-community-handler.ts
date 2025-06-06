import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HTTPResponse } from '../../types/http'
import { HandlerContextWithPath } from '../../types/http'
import { Community } from '../../logic/community'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../utils/errors'

export async function createCommunityHandler(
  context: HandlerContextWithPath<'community' | 'logs', '/v1/communities'> & DecentralandSignatureContext<any>
): Promise<HTTPResponse> {
  const {
    components: { community, logs },
    verification,
    request
  } = context

  const logger = logs.getLogger('create-community-handler')
  const address = verification!.auth.toLowerCase()

  try {
    const body: Pick<Community, 'name' | 'description' | 'thumbnails'> = await request.json()

    // TODO: add thumbnails validation when implemented
    if (!body.name || !body.description) {
      logger.error('Invalid request body while creating Community', {
        body: JSON.stringify(body)
      })

      throw new InvalidRequestError('Invalid request body')
    }

    logger.info('Creating community', {
      owner: address,
      name: body.name,
      thumbnails: JSON.stringify(body.thumbnails)
    })

    // TODO: support thumbnails upload
    const createdCommunity = await community.createCommunity({
      name: body.name,
      description: body.description,
      ownerAddress: address,
      thumbnails: body.thumbnails
    })

    logger.info('Community created', {
      community: JSON.stringify(createdCommunity)
    })

    return {
      status: 201,
      body: {
        message: 'Community created successfully',
        data: createdCommunity
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error creating community: ${message}`)

    if (error instanceof NotAuthorizedError || error instanceof InvalidRequestError) {
      throw error
    }

    return {
      status: 500,
      body: { message }
    }
  }
}
