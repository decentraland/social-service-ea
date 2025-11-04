import { HandlerContextWithPath, HTTPResponse } from '../../../types'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { errorMessageOrDefault } from '../../../utils/errors'
import { ReferralEmailUpdateTooSoonError, ReferralInvalidInputError } from '../../../logic/referral/errors'
import { AddReferralEmailRequestBody } from './schemas'

export async function addReferralEmailHandler(
  context: HandlerContextWithPath<'referral' | 'logs', '/v1/referral-email'> & DecentralandSignatureContext<any>
): Promise<HTTPResponse> {
  const {
    components: { referral, logs },
    request,
    verification
  } = context

  const logger = logs.getLogger('add-referral-email-handler')
  const userAddress = verification!.auth.toLowerCase()

  try {
    const body: AddReferralEmailRequestBody = await request.json()

    await referral.setReferralEmail({ referrer: userAddress, email: body.email })
    return {
      status: 204
    }
  } catch (error) {
    const message = errorMessageOrDefault(error)
    logger.error(`Error setting referral email for ${userAddress}: ${message}`)
    logger.debug('Error stack', { stack: (error as any)?.stack })

    if (error instanceof ReferralInvalidInputError || error instanceof ReferralEmailUpdateTooSoonError) {
      throw new InvalidRequestError(error.message)
    }

    if (error instanceof InvalidRequestError) {
      throw error
    }

    return {
      status: 500,
      body: {
        message
      }
    }
  }
}
