import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { normalizeAddress } from '../../../utils/address'
import { errorMessageOrDefault } from '../../../utils/errors'

export async function getBlockingStatusHandler(
  context: Pick<HandlerContextWithPath<'friends' | 'logs', '/v1/blocking-status'>, 'components' | 'verification'>
): Promise<HTTPResponse<{ blockedUsers: string[]; blockedByUsers: string[] }>> {
  const {
    components: { friends, logs },
    verification
  } = context

  const logger = logs.getLogger('get-blocking-status-handler')
  const userAddress = normalizeAddress(verification!.auth)

  try {
    const { blockedUsers, blockedByUsers } = await friends.getBlockingStatus(userAddress)

    return {
      status: 200,
      body: {
        data: { blockedUsers, blockedByUsers }
      }
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting blocking status of ${userAddress}, error: ${message}`)

    throw error
  }
}
