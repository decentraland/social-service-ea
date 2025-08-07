import { IHttpServerComponent } from '@well-known-components/interfaces'
import {
  CommunityMemberNotFoundError,
  CommunityNotFoundError,
  CommunityOwnerNotFoundError,
  CommunityPlaceNotFoundError,
  InvalidCommunityRequestError
} from '../../logic/community/errors'
import { ComponentsWithLogger } from '@dcl/platform-server-commons/dist/types'

export async function communitiesErrorsHandler(
  _ctx: IHttpServerComponent.DefaultContext<ComponentsWithLogger>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  try {
    return await next()
  } catch (error: any) {
    if (
      error instanceof CommunityNotFoundError ||
      error instanceof CommunityMemberNotFoundError ||
      error instanceof CommunityOwnerNotFoundError ||
      error instanceof CommunityPlaceNotFoundError
    ) {
      return {
        status: 404,
        body: {
          error: 'Not Found',
          message: error.message
        }
      }
    }

    if (error instanceof InvalidCommunityRequestError) {
      return {
        status: 400,
        body: {
          error: 'Bad Request',
          message: error.message
        }
      }
    }

    // let next generic middleware handle the error
    throw error
  }
}
