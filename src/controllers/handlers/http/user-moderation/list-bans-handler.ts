import { HandlerContextWithPath, HTTPResponse } from '../../../../types'
import { errorMessageOrDefault } from '../../../../utils/errors'
import { UserBan } from '../../../../logic/user-moderation/types'

export async function listBansHandler(
  context: Pick<HandlerContextWithPath<'userModeration' | 'logs', '/v1/moderation/bans'>, 'components'>
): Promise<HTTPResponse<UserBan[]>> {
  const {
    components: { userModeration, logs }
  } = context

  const logger = logs.getLogger('list-bans-handler')

  try {
    const bans = await userModeration.getActiveBans()

    return {
      status: 200,
      body: {
        data: bans
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error listing active bans: ${message}`)

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
