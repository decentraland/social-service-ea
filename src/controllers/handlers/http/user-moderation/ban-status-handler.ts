import { HandlerContextWithPath, HTTPResponse } from '../../../../types'
import { errorMessageOrDefault } from '../../../../utils/errors'
import { BanStatus } from '../../../../logic/user-moderation/types'

export async function banStatusHandler(
  context: Pick<
    HandlerContextWithPath<'userModeration' | 'logs', '/v1/moderation/users/:address/bans'>,
    'components' | 'params'
  >
): Promise<HTTPResponse<BanStatus>> {
  const {
    components: { userModeration, logs },
    params: { address }
  } = context

  const logger = logs.getLogger('ban-status-handler')

  try {
    const banStatus = await userModeration.isPlayerBanned(address)

    return {
      status: 200,
      body: {
        data: banStatus
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting ban status for player ${address}: ${message}`)

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
