import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { BlockedUserProfile } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { parseAddressToBlockedUser, parseProfileToBlockedUser } from '../../../logic/friends'
import { BlockUserRequestBody } from './schemas'

export async function blockUserHandler(
  context: Pick<HandlerContextWithPath<'friends' | 'logs', '/v1/blocks'>, 'components' | 'request' | 'verification'>
): Promise<HTTPResponse<BlockedUserProfile>> {
  const {
    components: { friends, logs },
    request,
    verification
  } = context

  const logger = logs.getLogger('block-user-handler')
  const blockerAddress = normalizeAddress(verification!.auth)
  let blockedAddress: string | undefined

  try {
    const body: BlockUserRequestBody = await request.json()
    blockedAddress = normalizeAddress(body.address)

    if (!EthAddress.validate(blockedAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    if (blockedAddress === blockerAddress) {
      throw new InvalidRequestError('You cannot block yourself')
    }

    const { profile, blockedAt } = await friends.blockUser(blockerAddress, blockedAddress)

    return {
      status: 201,
      body: {
        data: profile
          ? parseProfileToBlockedUser(profile, blockedAt)
          : parseAddressToBlockedUser(blockedAddress, blockedAt)
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error blocking ${blockedAddress} by ${blockerAddress}, error: ${message}`)

    throw error
  }
}
