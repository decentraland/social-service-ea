import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath } from '../../types/http'

export async function getInvitedUsersAcceptedHandler(
  ctx: Pick<HandlerContextWithPath<'referral'>, 'components' | 'verification'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { referral },
    verification
  } = ctx

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  return {
    status: 200,
    body: await referral.getInvitedUsersAcceptedStats(verification.auth)
  }
}
