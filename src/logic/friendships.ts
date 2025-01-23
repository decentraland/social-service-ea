import {
  FriendshipUpdate,
  UpsertFriendshipPayload,
  FriendshipStatus as FriendshipRequestStatus,
  FriendUpdate,
  FriendshipRequestResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  Action,
  FRIENDSHIP_ACTION_TRANSITIONS,
  FriendshipAction,
  FriendshipRequest,
  FriendshipStatus,
  SubscriptionEventsEmitter
} from '../types'
import { normalizeAddress } from '../utils/address'
import { parseProfileToFriend } from './friends'
import { Entity } from '@dcl/schemas'
import { getProfileAvatar } from './profiles'

const FRIENDSHIP_STATUS_BY_ACTION: Record<
  Action,
  (actingUser: string, contextAddress: string) => FriendshipRequestStatus | undefined
> = {
  [Action.ACCEPT]: () => FriendshipRequestStatus.ACCEPTED,
  [Action.CANCEL]: () => FriendshipRequestStatus.CANCELED,
  [Action.DELETE]: () => FriendshipRequestStatus.DELETED,
  [Action.REJECT]: () => FriendshipRequestStatus.REJECTED,
  [Action.REQUEST]: (actingUser, contextAddress) =>
    actingUser === contextAddress ? FriendshipRequestStatus.REQUEST_SENT : FriendshipRequestStatus.REQUEST_RECEIVED
  // TODO: [Action.BLOCK]: () => FriendshipRequestStatus.BLOCKED,
}

export function isFriendshipActionValid(from: Action | null, to: Action) {
  return FRIENDSHIP_ACTION_TRANSITIONS[to].includes(from)
}

export function isUserActionValid(
  actingUser: string,
  newAction: { action: Action; user: string },
  lastAction?: FriendshipAction
) {
  if (!lastAction) {
    if (newAction.action === Action.REQUEST && actingUser === newAction.user) return false

    return true
  }

  if (lastAction.acting_user === actingUser) {
    switch (newAction.action) {
      case Action.ACCEPT:
      case Action.REJECT:
        return false
      default:
        return true
    }
  } else {
    if (newAction.action === Action.CANCEL) return false
    return true
  }
}

export function getNewFriendshipStatus(action: Action) {
  switch (action) {
    case Action.REQUEST:
      return FriendshipStatus.Requested
    case Action.ACCEPT:
      return FriendshipStatus.Friends
    case Action.CANCEL:
    case Action.REJECT:
    case Action.DELETE:
    default:
      return FriendshipStatus.NotFriends
  }
}

export function validateNewFriendshipAction(
  actingUser: string,
  newAction: { action: Action; user: string },
  lastAction?: FriendshipAction
): boolean {
  if (!isFriendshipActionValid(lastAction?.action || null, newAction.action)) return false
  return isUserActionValid(actingUser, newAction, lastAction)
}

type CommonParsedRequest<A extends Action> = {
  action: A
  user: string
}

export type ParsedUpsertFriendshipRequest =
  | (CommonParsedRequest<Action.REQUEST> & { metadata: { message: string } | null })
  | CommonParsedRequest<Action.ACCEPT>
  | CommonParsedRequest<Action.CANCEL>
  | CommonParsedRequest<Action.DELETE>
  | CommonParsedRequest<Action.REJECT>

export function parseUpsertFriendshipRequest(request: UpsertFriendshipPayload): ParsedUpsertFriendshipRequest | null {
  switch (request.action?.$case) {
    case 'accept':
      return {
        action: Action.ACCEPT,
        user: normalizeAddress(request.action.accept.user!.address)
      }
    case 'cancel':
      return {
        action: Action.CANCEL,
        user: normalizeAddress(request.action.cancel.user!.address)
      }
    case 'delete':
      return {
        action: Action.DELETE,
        user: normalizeAddress(request.action.delete.user!.address)
      }
    case 'reject':
      return {
        action: Action.REJECT,
        user: normalizeAddress(request.action.reject.user!.address)
      }
    case 'request':
      return {
        action: Action.REQUEST,
        user: normalizeAddress(request.action.request.user!.address),
        metadata: request.action.request.message ? { message: request.action.request.message } : null
      }
    default:
      return null
  }
}

export function parseEmittedUpdateToFriendshipUpdate(
  update: SubscriptionEventsEmitter['friendshipUpdate']
): FriendshipUpdate | null {
  switch (update.action) {
    case Action.REQUEST:
      return {
        update: {
          $case: 'request',
          request: {
            id: update.id,
            createdAt: update.timestamp,
            user: {
              address: update.from
            },
            message: update.metadata?.message
          }
        }
      }
    case Action.CANCEL:
      return {
        update: {
          $case: 'cancel',
          cancel: {
            user: {
              address: update.from
            }
          }
        }
      }
    case Action.DELETE:
      return {
        update: {
          $case: 'delete',
          delete: {
            user: {
              address: update.from
            }
          }
        }
      }
    case Action.REJECT:
      return {
        update: {
          $case: 'reject',
          reject: {
            user: {
              address: update.from
            }
          }
        }
      }
    case Action.ACCEPT:
      return {
        update: {
          $case: 'accept',
          accept: {
            user: {
              address: update.from
            }
          }
        }
      }
    default:
      return null
  }
}

export function parseEmittedUpdateToFriendStatusUpdate({
  address,
  status
}: SubscriptionEventsEmitter['friendStatusUpdate']): FriendUpdate | null {
  return {
    user: { address },
    status: status
  }
}

export function getFriendshipRequestStatus(
  { action, acting_user }: FriendshipAction,
  loggedUserAddress: string
): FriendshipRequestStatus {
  const statusResolver = FRIENDSHIP_STATUS_BY_ACTION[action]
  return statusResolver?.(acting_user, loggedUserAddress) ?? FriendshipRequestStatus.UNRECOGNIZED
}

export function parseFriendshipRequestToFriendshipRequestResponse(
  request: FriendshipRequest,
  profile: Entity,
  profileImagesUrl: string
): FriendshipRequestResponse {
  return {
    id: request.id,
    friend: parseProfileToFriend(profile, profileImagesUrl),
    createdAt: new Date(request.timestamp).getTime(),
    message: request.metadata?.message || ''
  }
}

export function parseFriendshipRequestsToFriendshipRequestResponses(
  requests: FriendshipRequest[],
  profiles: Entity[],
  profileImagesUrl: string
): FriendshipRequestResponse[] {
  const profilesMap = new Map(profiles.map((profile) => [getProfileAvatar(profile).userId, profile]))

  return requests
    .map((request) => {
      const profile = profilesMap.get(request.address)

      if (!profile) {
        return null
      }

      return parseFriendshipRequestToFriendshipRequestResponse(request, profile, profileImagesUrl)
    })
    .filter((request) => request !== null)
}
