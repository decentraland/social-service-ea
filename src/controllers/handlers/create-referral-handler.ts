import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../utils/errors'
import { ReferralInvalidInputError, ReferralAlreadyExistsError, SelfReferralError } from '../../logic/referral/errors'
import type { HandlerContextWithPath } from '../../types/http'
import type { CreateReferralPayload, CreateReferralWithInvitedUser } from '../../types/create-referral-handler.type'

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

  if (!rawBody.referrer) {
    throw new InvalidRequestError('Missing required field: referrer')
  }

  const body: CreateReferralWithInvitedUser = {
    ...rawBody,
    invitedUser: verification.auth
  }

  try {
    await referral.create(body)

    return {
      status: 204
    }
  } catch (error: any) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error creating referral: ${message}`)
    logger.debug('Error stack', { stack: error?.stack })

    if (
      error instanceof ReferralInvalidInputError ||
      error instanceof SelfReferralError ||
      error instanceof ReferralAlreadyExistsError
    ) {
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
