import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { FormHandlerContextWithPath, HTTPResponse } from '../../types/http'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../utils/errors'

const parsePlaceIds = (placeIds: string): string[] => {
  try {
    return JSON.parse(placeIds)
  } catch {
    throw new InvalidRequestError('placeIds must be a valid JSON array')
  }
}

export async function createCommunityHandler(
  context: FormHandlerContextWithPath<'community' | 'logs', '/v1/communities'> & DecentralandSignatureContext<any>
): Promise<HTTPResponse> {
  const {
    components: { community, logs },
    verification,
    formData
  } = context

  const logger = logs.getLogger('create-community-handler')
  const address = verification!.auth.toLowerCase()

  try {
    const name: string = formData.fields.name?.value
    const description: string = formData.fields.description?.value

    const placeIds: string[] = parsePlaceIds(formData.fields.placeIds?.value || '[]')

    const thumbnailFile = formData?.files?.['thumbnail']

    if (!name || !description) {
      logger.error('Invalid request body while creating Community', {
        name,
        description,
        thumbnails: thumbnailFile ? 'present' : 'missing',
        placeIds: placeIds.length
      })

      throw new InvalidRequestError('Invalid request body')
    }

    if (!Array.isArray(placeIds)) {
      logger.error('Invalid placeIds format', { placeIds })
      throw new InvalidRequestError('placeIds must be an array')
    }

    logger.info('Creating community', {
      owner: address,
      name,
      placeIds: placeIds.length
    })

    const createdCommunity = await community.createCommunity(
      {
        name,
        description,
        ownerAddress: address
      },
      thumbnailFile?.value,
      placeIds
    )

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
  } catch (error: any) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error creating community: ${message}`)
    logger.debug('Error stack', { stack: error?.stack })

    if (error instanceof NotAuthorizedError || error instanceof InvalidRequestError) {
      throw error
    }

    return {
      status: 500,
      body: { message }
    }
  }
}
