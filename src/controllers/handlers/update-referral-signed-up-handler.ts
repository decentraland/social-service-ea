import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError, NotFoundError } from '@dcl/platform-server-commons'
import { ReferralProgressStatus } from '../../types/referral-db.type'
import { HandlerContextWithPath } from '../../types/http'
import { errorMessageOrDefault } from '../../utils/errors'
import {
  ReferralNotFoundError,
  ReferralInvalidInputError,
  ReferralInvalidStatusError
} from '../../logic/referral/errors'

export async function updateReferralSignedUpHandler(
  ctx: Pick<HandlerContextWithPath<'logs' | 'referral'>, 'components' | 'verification'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, referral },
    verification
  } = ctx
  const logger = logs.getLogger('update-referral-signed-up-handler')

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  try {
    await referral.updateProgress(verification.auth, ReferralProgressStatus.SIGNED_UP)

    return {
      status: 204
    }
  } catch (error: any) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error updating referral signed up: ${message}`)
    logger.debug('Error stack', { stack: error?.stack })

    if (
      error instanceof ReferralNotFoundError ||
      error instanceof ReferralInvalidInputError ||
      error instanceof ReferralInvalidStatusError ||
      error instanceof InvalidRequestError ||
      error instanceof NotFoundError
    ) {
      throw error
    }

    return {
      status: 500,
      body: { message }
    }
  }
}
