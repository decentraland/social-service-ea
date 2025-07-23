import { EthAddress } from '@dcl/schemas/dist/misc'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import {
  UpsertFriendshipPayload,
  UpsertFriendshipResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { Action, RpcServerContext, RPCServiceContext } from '../../../types'
import { parseUpsertFriendshipRequest, parseFriendshipRequestToFriendshipRequestResponse } from '../../../logic/friends'
import { InvalidFriendshipActionError } from '../../errors/rpc.errors'
import { isErrorWithMessage } from '../../../utils/errors'
import { BlockedUserError } from '../../../logic/friends/errors'

export function upsertFriendshipService({ components: { logs, friends } }: RPCServiceContext<'logs' | 'friends'>) {
  const logger = logs.getLogger('upsert-friendship-service')

  return async function (
    request: UpsertFriendshipPayload,
    context: RpcServerContext
  ): Promise<UpsertFriendshipResponse> {
    try {
      const parsedRequest = parseUpsertFriendshipRequest(request)

      if (!parsedRequest) {
        logger.error('upsert friendship received unknown message: ', request as any)
        throw new InvalidRequestError('Unknown message')
      }

      if (parsedRequest.action === Action.REQUEST && parsedRequest.user === context.address) {
        throw new InvalidFriendshipActionError('You cannot send a friendship request to yourself')
      }

      if (!EthAddress.validate(parsedRequest.user)) {
        throw new InvalidRequestError('Invalid user address in the request payload')
      }

      const { friendshipRequest, receiverProfile } = await friends.upsertFriendship(
        context.address,
        parsedRequest.user,
        parsedRequest.action,
        parsedRequest.action === Action.REQUEST ? parsedRequest.metadata : null
      )

      return {
        response: {
          $case: 'accepted',
          accepted: parseFriendshipRequestToFriendshipRequestResponse(friendshipRequest, receiverProfile)
        }
      }
    } catch (error) {
      logger.error(`Error upserting friendship: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`)

      if (error instanceof InvalidFriendshipActionError || error instanceof BlockedUserError) {
        return {
          response: {
            $case: 'invalidFriendshipAction',
            invalidFriendshipAction: { message: error.message }
          }
        }
      }

      return {
        response: {
          $case: 'internalServerError',
          internalServerError: {
            message: isErrorWithMessage(error) ? error.message : 'Unknown error'
          }
        }
      }
    }
  }
}
