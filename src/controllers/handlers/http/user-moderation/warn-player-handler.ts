import { HandlerContextWithPath, HTTPResponse } from '../../../../types'
import { errorMessageOrDefault } from '../../../../utils/errors'
import { UserWarning } from '../../../../logic/user-moderation/types'
import { WarnPlayerRequestBody } from '../schemas'

export async function warnPlayerHandler(
  context: Pick<
    HandlerContextWithPath<'userModeration' | 'logs', '/v1/moderation/users/:address/warnings'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse<UserWarning>> {
  const {
    components: { userModeration, logs },
    params: { address },
    verification,
    request
  } = context

  const logger = logs.getLogger('warn-player-handler')

  try {
    const body = (await request.json()) as WarnPlayerRequestBody
    const warnedBy = verification!.auth

    const warning = await userModeration.warnPlayer(address, body.reason, warnedBy)

    return {
      status: 201,
      body: {
        data: warning
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error warning player ${address}: ${message}`)

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
