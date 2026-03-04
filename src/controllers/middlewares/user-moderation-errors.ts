import { IHttpServerComponent } from '@well-known-components/interfaces'
import { PlayerAlreadyBannedError, BanNotFoundError } from '../../logic/user-moderation/errors'
import { ComponentsWithLogger } from '@dcl/platform-server-commons/dist/types'

export async function userModerationErrorsHandler(
  _ctx: IHttpServerComponent.DefaultContext<ComponentsWithLogger>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  try {
    return await next()
  } catch (error: any) {
    if (error instanceof PlayerAlreadyBannedError) {
      return {
        status: 409,
        body: {
          error: 'Conflict',
          message: error.message
        }
      }
    }

    if (error instanceof BanNotFoundError) {
      return {
        status: 404,
        body: {
          error: 'Not Found',
          message: error.message
        }
      }
    }

    // let next generic middleware handle the error
    throw error
  }
}
