import { IHttpServerComponent } from '@dcl/core-commons'
import { ComponentsWithLogger } from '@dcl/http-commons/dist/types'
import { BlockedUserError, FriendshipRateLimitError, InvalidFriendshipActionError } from '../../logic/friends/errors'

export async function friendsErrorsHandler(
  _ctx: IHttpServerComponent.DefaultContext<ComponentsWithLogger>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  try {
    return await next()
  } catch (error: any) {
    if (error instanceof BlockedUserError) {
      return {
        status: 403,
        body: {
          error: 'Forbidden',
          message: error.message
        }
      }
    }

    if (error instanceof InvalidFriendshipActionError) {
      return {
        status: 409,
        body: {
          error: 'Conflict',
          message: error.message
        }
      }
    }

    if (error instanceof FriendshipRateLimitError) {
      return {
        status: 429,
        body: {
          error: 'Too Many Requests',
          message: error.message
        }
      }
    }

    // let next generic middleware handle the error
    throw error
  }
}
