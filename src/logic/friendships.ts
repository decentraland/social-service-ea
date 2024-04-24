import {
  FriendshipUpdate,
  UpsertFriendshipPayload
} from '@dcl/protocol/out-ts/decentraland/social_service_v2/social_service.gen'
import {
  Action,
  FRIENDSHIP_ACTION_TRANSITIONS,
  FriendshipAction,
  FriendshipStatus,
  SubscriptionEventsEmitter
} from '../types'
import { normalizeAddress } from '../utils/address'

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

type ParsedUpsertFriendshipRequest =
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
  update: SubscriptionEventsEmitter['update']
): FriendshipUpdate | null {
  switch (update.action) {
    case Action.REQUEST:
      return {
        update: {
          $case: 'request',
          request: {
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
