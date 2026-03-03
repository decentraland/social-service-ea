import { HandlerContextWithPath, HTTPResponse } from '../../../../types'
import { errorMessageOrDefault } from '../../../../utils/errors'
import { PlayerAlreadyBannedError } from '../../../../logic/user-moderation/errors'
import { UserBan } from '../../../../logic/user-moderation/types'
import { BanPlayerRequestBody } from '../schemas'

export async function banPlayerHandler(
  context: Pick<
    HandlerContextWithPath<'userModeration' | 'logs', '/v1/moderation/users/:address/bans'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<HTTPResponse<UserBan>> {
  const {
    components: { userModeration, logs },
    params: { address },
    verification,
    request
  } = context

  const logger = logs.getLogger('ban-player-handler')

  try {
    const body = (await request.json()) as BanPlayerRequestBody
    const bannedBy = verification!.auth

    const ban = await userModeration.banPlayer(address, bannedBy, body.reason, body.duration, body.customMessage)

    return {
      status: 201,
      body: {
        data: ban
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error banning player ${address}: ${message}`)

    if (error instanceof PlayerAlreadyBannedError) {
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
