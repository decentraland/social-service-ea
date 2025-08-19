import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { FormHandlerContextWithPath, HTTPResponse } from '../../../types/http'
import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import { validateCommunityFields } from '../../../utils/community-validation'
import { CommunityOwnerNotFoundError } from '../../../logic/community'

export async function createCommunityHandler(
  context: FormHandlerContextWithPath<'communities' | 'logs' | 'aiContentValidator', '/v1/communities'> &
    DecentralandSignatureContext<any>
): Promise<HTTPResponse> {
  const {
    components: { communities, logs, aiContentValidator },
    verification,
    formData
  } = context

  const logger = logs.getLogger('create-community-handler')
  const address = verification!.auth.toLowerCase()

  try {
    const thumbnailFile = formData?.files?.['thumbnail']
    const thumbnailBuffer = thumbnailFile?.value

    const { name, description, placeIds, privacy } = await validateCommunityFields(formData, thumbnailBuffer, {
      requireName: true,
      requireDescription: true,
      aiContentValidator
    })

    logger.info('Creating community', {
      owner: address,
      name: name!,
      placeIds: placeIds?.length ? placeIds.join(',') : 'N/A'
    })

    const createdCommunity = await communities.createCommunity(
      {
        name: name!,
        description: description!,
        ownerAddress: address,
        privacy
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

    if (
      error instanceof NotAuthorizedError ||
      error instanceof InvalidRequestError ||
      error instanceof CommunityOwnerNotFoundError
    ) {
      throw error
    }

    return {
      status: 500,
      body: { message }
    }
  }
}
