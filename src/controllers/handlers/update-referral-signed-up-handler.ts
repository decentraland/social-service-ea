import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { ReferralProgressStatus } from '../../types/referral-db.type'
import { validateRequestBody, validationRules } from '../../logic/validations'
import { UpdateReferralSignedUpPayload } from '../../types/update-referral-signed-up-handler.type'
import { HandlerContextWithPath } from '../../types/http'

export async function updateReferralSignedUpHandler(
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
  const logger = logs.getLogger('update-referral-signed-up-handler')

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const body = await validateRequestBody<UpdateReferralSignedUpPayload>(
    { invited_user: verification.auth.toLowerCase() },
    { db: referralDb, logger, request },
    [
      {
        field: 'invited_user',
        rules: [validationRules.required, validationRules.ethAddress, validationRules.referralStatus]
      }
    ]
  )

  await referralDb.updateReferralProgress(body.invited_user, ReferralProgressStatus.SIGNED_UP)

  return {
    status: 204
  }
}
