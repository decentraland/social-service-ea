import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { FormHandlerContextWithPath, HTTPResponse } from '../../types/http'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../utils/errors'
import { validateCommunityFields } from '../../utils/community-validation'

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
    const thumbnailFile = formData?.files?.['thumbnail']
    const thumbnailBuffer = thumbnailFile?.value

    const { name, description, placeIds } = await validateCommunityFields(formData, thumbnailBuffer, {
      requireName: true,
      requireDescription: true
    })

    logger.info('Creating community', {
      owner: address,
      name: name!,
      placeIds: placeIds?.length || 0
    })

    const createdCommunity = await community.createCommunity(
      {
        name: name!,
        description: description!,
        ownerAddress: address
      },
      thumbnailBuffer,
      placeIds ?? []
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
