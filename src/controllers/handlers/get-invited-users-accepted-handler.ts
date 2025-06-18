import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath } from '../../types/http'
import { errorMessageOrDefault } from '../../utils/errors'
import { ReferralInvalidInputError } from '../../logic/referral/errors'

export async function getInvitedUsersAcceptedHandler(
  ctx: Pick<
    HandlerContextWithPath<'logs' | 'referralDb' | 'referral' | 'config' | 'fetcher'>,
    'components' | 'request' | 'url' | 'params' | 'verification'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, referral },
    verification
  } = ctx
  const logger = logs.getLogger('get-invited-users-accepted-handler')

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const referrer = verification.auth.toLowerCase()

  if (!referrer) {
    throw new InvalidRequestError('Missing required field: referrer')
  }

  try {
    const stats = await referral.getInvitedUsersAcceptedStats(referrer)

    return {
      status: 200,
      body: stats
    }
  } catch (error: any) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error getting invited users accepted stats: ${message}`)
    logger.debug('Error stack', { stack: error?.stack })

    if (error instanceof ReferralInvalidInputError) {
      throw new InvalidRequestError(error.message)
    }

    if (error instanceof InvalidRequestError) {
      throw error
    }

    return {
      status: 500,
      body: { message }
    }
  }
}
