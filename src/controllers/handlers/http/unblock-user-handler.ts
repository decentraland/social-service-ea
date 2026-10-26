import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'

export async function unblockUserHandler(
  context: Pick<
    HandlerContextWithPath<'friends' | 'logs', '/v1/blocks/:address'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { friends, logs },
    params,
    verification
  } = context

  const logger = logs.getLogger('unblock-user-handler')
  const blockerAddress = normalizeAddress(verification!.auth)
  const blockedAddress = normalizeAddress(params.address)

  try {
    if (!EthAddress.validate(blockedAddress)) {
      throw new InvalidRequestError('Invalid address')
    }

    if (blockedAddress === blockerAddress) {
      throw new InvalidRequestError('You cannot unblock yourself')
    }

    await friends.unblockUserWithoutProfile(blockerAddress, blockedAddress)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error unblocking ${blockedAddress} by ${blockerAddress}, error: ${message}`)

    throw error
  }
}
