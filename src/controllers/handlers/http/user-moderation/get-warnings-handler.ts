import { HandlerContextWithPath, HTTPResponse } from '../../../../types'
import { errorMessageOrDefault } from '../../../../utils/errors'
import { UserWarning } from '../../../../logic/user-moderation/types'

export async function getWarningsHandler(
  context: Pick<
    HandlerContextWithPath<'userModeration' | 'logs', '/v1/moderation/users/:address/warnings'>,
    'components' | 'params'
  >
): Promise<HTTPResponse<UserWarning[]>> {
  const {
    components: { userModeration, logs },
    params: { address }
  } = context

  const logger = logs.getLogger('get-warnings-handler')

  try {
    const warnings = await userModeration.getPlayerWarnings(address)

    return {
      status: 200,
      body: {
        data: warnings
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting warnings for player ${address}: ${message}`)

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
