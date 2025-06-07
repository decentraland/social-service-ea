import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../types/http'
import { CreateReferralPayload, CreateReferralWithInvitedUser } from '../../types/create-referral-handler.type'
import { validateRequestBody, validationRules } from '../../logic/validations'
import { InvalidRequestError } from '@dcl/platform-server-commons'

export async function createReferralHandler(
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
  const logger = logs.getLogger('create-referral-progress-handler')

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

  const body = await validateRequestBody<CreateReferralWithInvitedUser>(
    { ...rawBody, invited_user: verification.auth.toLowerCase() },
    { db: referralDb, logger, request },
    [
      {
        field: 'referrer',
        rules: [validationRules.required, validationRules.ethAddress]
      },
      {
        field: 'invited_user',
        rules: [
          validationRules.required,
          validationRules.ethAddress,
          validationRules.referralDoesNotExist,
          validationRules.notSelfReferral
        ]
      }
    ]
  )

  await referralDb.createReferral(body)

  return {
    status: 204
  }
}
