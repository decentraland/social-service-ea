import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import {
  ReferralInvalidInputError,
  ReferralAlreadyExistsError,
  SelfReferralError
} from '../../../logic/referral/errors'
import type { HandlerContextWithPath } from '../../../types/http'
import type { CreateReferralWithInvitedUser } from '../../../types/create-referral-handler.type'
import type { CreateReferralRequestBody } from './schemas'

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

  const rawBody: CreateReferralRequestBody = await request.json()

  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')

  const invitedUserIP = cfConnectingIp || forwardedFor?.split(',')[0]?.trim() || realIp

  if (!invitedUserIP) {
    logger.error('Unable to determine client IP address from connection headers')
    throw new InvalidRequestError('Unable to determine client IP address from connection headers')
  }

  const body: CreateReferralWithInvitedUser = {
    ...rawBody,
    invitedUser: verification.auth,
    invitedUserIP
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
