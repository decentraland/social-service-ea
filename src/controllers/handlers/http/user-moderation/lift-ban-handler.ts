import { HandlerContextWithPath, HTTPResponse } from '../../../../types'
import { errorMessageOrDefault } from '../../../../utils/errors'
import { BanNotFoundError } from '../../../../logic/user-moderation/errors'

export async function liftBanHandler(
  context: Pick<
    HandlerContextWithPath<'userModeration' | 'logs', '/v1/moderation/users/:address/bans'>,
    'components' | 'params' | 'verification'
  >
): Promise<HTTPResponse> {
  const {
    components: { userModeration, logs },
    params: { address },
    verification
  } = context

  const logger = logs.getLogger('lift-ban-handler')

  try {
    const liftedBy = verification!.auth

    await userModeration.liftBan(address, liftedBy)

    return { status: 204 }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error lifting ban for player ${address}: ${message}`)

    if (error instanceof BanNotFoundError) {
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
