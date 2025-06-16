import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../types/http'
import { CreateReferralPayload, CreateReferralWithInvitedUser } from '../../types/create-referral-handler.type'
import { InvalidRequestError } from '@dcl/platform-server-commons'

export async function createReferralHandler(
  ctx: Pick<HandlerContextWithPath<'logs' | 'referral'>, 'components' | 'request' | 'verification'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, referral },
    request,
    verification
  } = ctx
  const logger = logs.getLogger('create-referral-handler')

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  let rawBody: CreateReferralPayload
  try {
    rawBody = await request.json()
  } catch (error) {
    logger.debug('Invalid JSON body')
    throw new InvalidRequestError('Invalid JSON body')
  }

  const body: CreateReferralWithInvitedUser = {
    ...rawBody,
    invitedUser: verification.auth
  }

  await referral.create(body)

  return {
    status: 204
  }
}
