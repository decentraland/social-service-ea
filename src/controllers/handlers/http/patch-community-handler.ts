import { InvalidRequestError, NotAuthorizedError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'
import { CommunityNotFoundError } from '../../../logic/community/errors'
import { FeatureFlag } from '../../../adapters/feature-flags'

type PatchCommunityBody = {
  editorsChoice?: boolean
}

export async function patchCommunityHandler(
  context: Pick<
    HandlerContextWithPath<'communities' | 'communitiesDb' | 'featureFlags' | 'logs', '/v1/communities/:id'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse> {
  const {
    components: { communitiesDb, featureFlags, logs },
    params: { id: communityId },
    verification,
    request
  } = context

  const logger = logs.getLogger('patch-community-handler')
  const userAddress = verification!.auth.toLowerCase()

  try {
    const communityExists = await communitiesDb.communityExists(communityId)
    if (!communityExists) {
      throw new CommunityNotFoundError(communityId)
    }

    const body: PatchCommunityBody = await request.json()

    const hasAnyUpdate = Object.keys(body).length > 0
    if (!hasAnyUpdate) {
      throw new InvalidRequestError('At least one field must be provided for update')
    }

    if (body.editorsChoice !== undefined) {
      if (typeof body.editorsChoice !== 'boolean') {
        throw new InvalidRequestError('editorsChoice must be a boolean')
      }

      const globalModerators =
        (await featureFlags.getVariants<string[]>(FeatureFlag.COMMUNITIES_GLOBAL_MODERATORS)) || []

      if (!globalModerators.includes(userAddress)) {
        throw new NotAuthorizedError("Only global moderators can update Editor's Choice flag")
      }

      logger.info("Updating Editor's Choice flag", {
        communityId,
        userAddress,
        editorsChoice: body.editorsChoice ? 'true' : 'false'
      })

      await communitiesDb.setEditorChoice(communityId, body.editorsChoice)
    }

    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error patching community ${communityId}: ${message}`)

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
