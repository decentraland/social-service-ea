import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { MAX_PRIVATE_MESSAGES_SETTINGS_ADDRESSES, PrivateMessagesSettings } from '../../../logic/settings'

export async function getPrivateMessagesSettingsHandler(
  context: Pick<
    HandlerContextWithPath<'settings' | 'logs', '/v1/private-messages-settings'>,
    'components' | 'url' | 'verification'
  >
): Promise<HTTPResponse<PrivateMessagesSettings[]>> {
  const {
    components: { settings, logs },
    url,
    verification
  } = context

  const logger = logs.getLogger('get-private-messages-settings-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    const addresses = url.searchParams.getAll('addresses').map(normalizeAddress)

    if (addresses.length > MAX_PRIVATE_MESSAGES_SETTINGS_ADDRESSES) {
      throw new InvalidRequestError(`At most ${MAX_PRIVATE_MESSAGES_SETTINGS_ADDRESSES} addresses can be requested`)
    }

    const invalidAddress = addresses.find((address) => !EthAddress.validate(address))
    if (invalidAddress !== undefined) {
      throw new InvalidRequestError(`Invalid address: ${invalidAddress}`)
    }

    return {
      status: 200,
      body: {
        data: await settings.getPrivateMessagesSettings(userAddress, addresses)
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting private messages settings for ${userAddress}, error: ${message}`)

    throw error
  }
}
