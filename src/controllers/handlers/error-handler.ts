import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import {
  ReferralProgressExistsError,
  ReferralProgressNotFoundError,
  InvalidReferralStatusError,
  SelfReferralError
} from '../../types/errors'
import { HandlerContextWithPath } from '../../types/http'

export async function errorHandler(
  ctx: Pick<HandlerContextWithPath<'logs' | 'referralDb' | 'config' | 'fetcher'>, 'components'>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  const logger = ctx.components.logs.getLogger('error-handler')

  try {
    return await next()
  } catch (error: any) {
    if (
      error instanceof ReferralProgressExistsError ||
      error instanceof ReferralProgressNotFoundError ||
      error instanceof InvalidReferralStatusError ||
      error instanceof SelfReferralError ||
      error instanceof InvalidRequestError
    ) {
      return {
        status: 400,
        body: JSON.stringify({
          error: 'Bad request',
          message: error.message
        })
      }
    }

    logger.error('Unhandled error:', { error })

    return {
      status: 500,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      })
    }
  }
}
