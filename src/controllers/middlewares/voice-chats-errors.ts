import { IHttpServerComponent } from '@dcl/core-commons'
import { ComponentsWithLogger } from '@dcl/http-commons/dist/types'
import {
  IncomingVoiceChatNotFoundError,
  UserAlreadyInVoiceChatError,
  UserInCommunityVoiceChatError,
  UsersAreCallingSomeoneElseError,
  VoiceChatNotAllowedError,
  VoiceChatNotFoundError
} from '../../logic/voice/errors'
import {
  CommunityVoiceChatAlreadyActiveError,
  CommunityVoiceChatNotFoundError,
  CommunityVoiceChatPermissionError,
  InvalidCommunityIdError,
  InvalidUserAddressError,
  UserNotCommunityMemberError
} from '../../logic/community-voice/errors'
import { InvalidGatekeeperIdentifierError } from '../../adapters/comms-gatekeeper'

export async function voiceChatsErrorsHandler(
  _ctx: IHttpServerComponent.DefaultContext<ComponentsWithLogger>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  try {
    return await next()
  } catch (error: any) {
    if (
      error instanceof VoiceChatNotFoundError ||
      error instanceof IncomingVoiceChatNotFoundError ||
      error instanceof CommunityVoiceChatNotFoundError
    ) {
      return {
        status: 404,
        body: {
          error: 'Not Found',
          message: error.message
        }
      }
    }

    if (
      error instanceof VoiceChatNotAllowedError ||
      error instanceof UserNotCommunityMemberError ||
      error instanceof CommunityVoiceChatPermissionError
    ) {
      return {
        status: 403,
        body: {
          error: 'Forbidden',
          message: error.message
        }
      }
    }

    if (
      error instanceof UserAlreadyInVoiceChatError ||
      error instanceof UsersAreCallingSomeoneElseError ||
      error instanceof UserInCommunityVoiceChatError ||
      error instanceof CommunityVoiceChatAlreadyActiveError
    ) {
      return {
        status: 409,
        body: {
          error: 'Conflict',
          message: error.message
        }
      }
    }

    if (
      error instanceof InvalidCommunityIdError ||
      error instanceof InvalidUserAddressError ||
      error instanceof InvalidGatekeeperIdentifierError
    ) {
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
