import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../types'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { CommunityNotFoundError } from '../../logic/community'
import { errorMessageOrDefault } from '../../utils/errors'

export async function kickMemberHandler(
  context: Pick<
    HandlerContextWithPath<'community' | 'logs', '/v1/communities/:id/members/:memberAddress'>,
    'components' | 'params' | 'verification'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { community },
    params: { id: communityId, memberAddress: memberToKickAddress },
    verification
  } = context

  const logger = context.components.logs.getLogger('kick-member-handler')

  logger.info(`Kicking member ${memberToKickAddress} from community ${communityId}`)

  try {
    const kickerAddress = verification!.auth.toLowerCase()

    await community.kickMember(communityId, kickerAddress, memberToKickAddress)
    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error kicking member: ${memberToKickAddress} from community: ${communityId}, error: ${message}`)

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
