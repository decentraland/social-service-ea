import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { ReferralProgressStatus } from '../../types/referral-db.type'
import { HandlerContextWithPath } from '../../types/http'

export async function updateReferralSignedUpHandler(
  ctx: Pick<HandlerContextWithPath<'referral'>, 'components' | 'verification'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { referral },
    verification
  } = ctx

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  await referral.updateProgress(verification.auth, ReferralProgressStatus.SIGNED_UP)

  return {
    status: 204
  }
}
