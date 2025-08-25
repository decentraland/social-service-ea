import { IHttpServerComponent } from '@well-known-components/interfaces'
import {
  CommunityNotFoundError,
  CommunityMemberNotFoundError,
  CommunityOwnerNotFoundError,
  CommunityPlaceNotFoundError,
  InvalidCommunityRequestError,
  CommunityNotCompliantError,
  CommunityRequestNotFoundError
} from '../../logic/community'
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
      error instanceof CommunityPlaceNotFoundError ||
      error instanceof CommunityRequestNotFoundError
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

    if (error instanceof CommunityNotCompliantError) {
      return {
        status: 400,
        body: {
          message: error.message,
          data: {
            issues: error.issues,
            warnings: error.warnings
          }
        }
      }
    }

    // let next generic middleware handle the error
    throw error
  }
}
