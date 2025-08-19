import { InvalidRequestError } from '@dcl/platform-server-commons/dist/errors'
import { EthAddress } from '@dcl/schemas'
import { Community } from '../../../logic/community'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { errorMessageOrDefault } from '../../../utils/errors'

export async function getCommunityInvitesHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'communities', '/v1/members/:address/invites'>,
    'components' | 'params' | 'verification' | 'url'
  >
): Promise<HTTPResponse<Pick<Community, 'id' | 'name'>[]>> {
  const {
    components: { logs, communities },
    params: { address: inviteeAddress },
    verification
  } = context

  const logger = logs.getLogger('get-community-invites-handler')

  try {
    const inviterAddress = verification!.auth.toLowerCase()

    if (inviterAddress === inviteeAddress) {
      throw new InvalidRequestError('Users cannot invite themselves')
    }

    if (!EthAddress.validate(inviterAddress) || !EthAddress.validate(inviteeAddress)) {
      throw new InvalidRequestError('Invalid addresses')
    }

    const invites = await communities.getCommunityInvites(inviterAddress, inviteeAddress)

    return {
      status: 200,
      body: {
        data: invites.map((invite) => ({
          id: invite.id,
          name: invite.name
        }))
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting community invites for invitee ${inviteeAddress}: ${message}`)

    if (error instanceof InvalidRequestError) {
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
