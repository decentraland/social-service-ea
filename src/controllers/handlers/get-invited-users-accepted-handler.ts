import { IHttpServerComponent } from '@well-known-components/interfaces'
import { ReferrerBody } from '../../types/get-referral-tier-handler.type'
import { validateRequestBody, validationRules } from '../../logic/validations'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { HandlerContextWithPath } from '../../types/http'

export async function getInvitedUsersAcceptedHandler(
  ctx: Pick<
    HandlerContextWithPath<'logs' | 'referralDb' | 'config' | 'fetcher'>,
    'components' | 'request' | 'url' | 'params' | 'verification'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, referralDb },
    request,
    verification
  } = ctx
  const logger = logs.getLogger('get-referral-tier-handler')

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const body = await validateRequestBody<ReferrerBody>(
    { referrer: verification.auth.toLowerCase() },
    { db: referralDb, logger, request },
    [
      {
        field: 'referrer',
        rules: [validationRules.required, validationRules.ethAddress]
      }
    ]
  )

  const invitedUsersAccepted = await referralDb.countAcceptedInvitesByReferrer(body.referrer)
  const invitedUsersAcceptedViewed = await referralDb.getLastViewedProgressByReferrer(body.referrer)
  await referralDb.setLastViewedProgressByReferrer(body.referrer, invitedUsersAccepted)

  return {
    status: 200,
    body: {
      invitedUsersAccepted,
      invitedUsersAcceptedViewed
    }
  }
}
