import { InvalidRequestError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { EthAddress } from '@dcl/schemas'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'
import { SelfMuteError } from '../../../logic/user-mutes'

export async function addUserMuteHandler(
  context: Pick<HandlerContextWithPath<'userMutes' | 'logs', '/v1/mutes'>, 'components' | 'request' | 'verification'>
): Promise<HTTPResponse> {
  const {
    components: { userMutes, logs },
    request,
    verification
  } = context

  const logger = logs.getLogger('add-user-mute-handler')
  const muterAddress = normalizeAddress(verification!.auth)

  try {
    const body: { muted_address: string } = await request.json()
    const mutedAddress = normalizeAddress(body.muted_address)

    if (!EthAddress.validate(mutedAddress)) {
      throw new InvalidRequestError('Invalid muted_address')
    }

    await userMutes.muteUser(muterAddress, mutedAddress)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error muting user, error: ${message}`)

    if (error instanceof SelfMuteError) {
      throw new InvalidRequestError(error.message)
    }

    throw error
  }
}
