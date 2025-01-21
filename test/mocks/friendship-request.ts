import { FriendshipRequest } from '../../src/types'

/**
 * Creates a mock friendship request from given parameters.
 */
export const createMockFriendshipRequest = (
  id: string,
  address: string,
  timestamp: string,
  message?: string
): FriendshipRequest => ({
  id,
  address,
  timestamp,
  metadata: message ? { message } : undefined
})

/**
 * Creates the expected mapped response for a friendship request.
 */
export const createMockExpectedFriendshipRequest = (
  id: string,
  address: string,
  createdAt?: string,
  message?: string
) => ({
  id,
  user: { address },
  createdAt: createdAt ? new Date(createdAt).getTime() : new Date(createdAt).getTime(),
  message
})
