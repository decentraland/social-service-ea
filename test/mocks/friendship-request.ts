import { FriendshipRequest } from '../../src/types'

/**
 * Creates a mock friendship request from given parameters.
 */
export const createMockFriendshipRequest = (
  address: string,
  timestamp: string,
  message?: string
): FriendshipRequest => ({
  address,
  timestamp,
  metadata: message ? { message } : undefined
})

/**
 * Creates the expected mapped response for a friendship request.
 */
export const createMockExpectedFriendshipRequest = (address: string, createdAt: string, message: string) => ({
  user: { address },
  createdAt: new Date(createdAt).getTime(),
  message
})
