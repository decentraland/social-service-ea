import { Action } from '../../src/types'
import { normalizeAddress } from '../../src/utils/address'
import { test } from '../components'
import { createActiveFriendship, createFriendshipRequest } from '../db'
import { AUTH_ADDRESS, Identity, getIdentity } from '../rpc'

test('RpcServer', ({ components }) => {
  describe('getFriends()', () => {
    it('should return all active friendships', async () => {
      await createActiveFriendship(components.db, [AUTH_ADDRESS, '0xb'])

      const gen = components.socialServiceClient.client.getFriends({})
      const next = await gen.next()
      expect(next.value.users.length).toBe(1)
      expect(next.value.users[0].address).toBe('0xb')
      const next2 = await gen.next()
      expect(next2.done).toBeTruthy()
      expect(next2.value.users.length).toBe(0)
    })
  })

  describe('getMutualFriends()', () => {
    it('should return all mutual friends between two users', async () => {
      await createActiveFriendship(components.db, [AUTH_ADDRESS, '0xb'])
      await createActiveFriendship(components.db, [AUTH_ADDRESS, '0xc'])
      await createActiveFriendship(components.db, ['0xb', '0xc'])

      const gen = components.socialServiceClient.client.getMutualFriends({
        user: {
          address: '0xb'
        }
      })
      const next = await gen.next()
      expect(next.value.users.length).toBe(1)
      expect(next.value.users[0].address).toBe('0xc')
      const next2 = await gen.next()
      expect(next2.done).toBeTruthy()
      expect(next2.value.users.length).toBe(0)
    })
  })

  describe('getPendingFriendshipRequests()', () => {
    it('should return all pending requests', async () => {
      const { db, socialServiceClient } = components
      {
        const id = await createFriendshipRequest(db, ['0xd', AUTH_ADDRESS])

        const response = await socialServiceClient.client.getPendingFriendshipRequests({})

        expect(response.response?.$case).toBe('requests')
        expect((response.response as any).requests.requests.length).toBe(1)
        expect((response.response as any).requests.requests[0].user.address).toBe('0xd')
        const requestAction = await db.getLastFriendshipAction(id)
        expect((response.response as any).requests.requests[0].createdAt).toBe(
          new Date(requestAction!.timestamp).getTime()
        )
        expect((response.response as any).requests.requests[0].message).toBe('')
      }

      {
        const id = await createFriendshipRequest(db, ['0xe', AUTH_ADDRESS], { message: 'Hi!' })

        const response = await socialServiceClient.client.getPendingFriendshipRequests({})

        expect(response.response?.$case).toBe('requests')
        expect((response.response as any).requests.requests.length).toBe(2)
        expect((response.response as any).requests.requests[1].user.address).toBe('0xe')
        const requestAction = await db.getLastFriendshipAction(id)
        expect((response.response as any).requests.requests[1].createdAt).toBe(
          new Date(requestAction!.timestamp).getTime()
        )
        expect((response.response as any).requests.requests[1].message).toBe(requestAction?.metadata?.message)
      }
    })
  })

  describe('getSentFriendshipRequests()', () => {
    it('should return all sent requests', async () => {
      const { db, socialServiceClient } = components
      {
        const id = await createFriendshipRequest(db, [AUTH_ADDRESS, '0xf'])

        const response = await socialServiceClient.client.getSentFriendshipRequests({})

        expect(response.response?.$case).toBe('requests')
        expect((response.response as any).requests.requests.length).toBe(1)
        expect((response.response as any).requests.requests[0].user.address).toBe('0xf')
        const requestAction = await db.getLastFriendshipAction(id)
        expect((response.response as any).requests.requests[0].createdAt).toBe(
          new Date(requestAction!.timestamp).getTime()
        )
        expect((response.response as any).requests.requests[0].message).toBe('')
      }

      {
        const id = await createFriendshipRequest(db, [AUTH_ADDRESS, '0xg'], { message: 'hi!' })

        const response = await socialServiceClient.client.getSentFriendshipRequests({})

        expect(response.response?.$case).toBe('requests')
        expect((response.response as any).requests.requests.length).toBe(2)
        expect((response.response as any).requests.requests[1].user.address).toBe('0xg')
        const requestAction = await db.getLastFriendshipAction(id)
        expect((response.response as any).requests.requests[1].createdAt).toBe(
          new Date(requestAction!.timestamp).getTime()
        )
        expect((response.response as any).requests.requests[1].message).toBe('hi!')
      }
    })
  })

  describe('upsertFriendship()', () => {
    let identity: Identity
    beforeAll(async () => {
      identity = await getIdentity()
    })
    it('should create a new NOT active friendship', async () => {
      const { socialServiceClient } = components
      const response = await socialServiceClient.client.upsertFriendship({
        action: {
          $case: 'request',
          request: {
            user: {
              address: identity.realAccount.address
            }
          }
        }
      })
      expect(response?.response).not.toBe(undefined)
      expect(response?.response?.$case).toBe('accepted')
      const friendship = await components.db.getFriendship([
        AUTH_ADDRESS,
        normalizeAddress(identity.realAccount.address)
      ])
      expect(friendship).not.toBe(undefined)
      expect(friendship?.is_active).toBeFalsy()
      expect(friendship?.address_requester).toBe(AUTH_ADDRESS)
      expect(friendship?.address_requested).toBe(normalizeAddress(identity.realAccount.address))
      const lastActionRecorded = await components.db.getLastFriendshipAction(friendship!.id)
      expect(lastActionRecorded?.action).toBe(Action.REQUEST)
      expect(lastActionRecorded?.acting_user).toBe(AUTH_ADDRESS)
    })

    it('should create a new NOT active friendship WITH a request message', async () => {
      const { socialServiceClient } = components
      const newIdentity = await getIdentity()
      const response = await socialServiceClient.client.upsertFriendship({
        action: {
          $case: 'request',
          request: {
            user: {
              address: newIdentity.realAccount.address
            },
            message: 'Hi!, how u doing?'
          }
        }
      })
      expect(response?.response).not.toBe(undefined)
      expect(response?.response?.$case).toBe('accepted')
      const friendship = await components.db.getFriendship([
        AUTH_ADDRESS,
        normalizeAddress(newIdentity.realAccount.address)
      ])
      expect(friendship).not.toBe(undefined)
      expect(friendship?.is_active).toBeFalsy()
      expect(friendship?.address_requester).toBe(AUTH_ADDRESS)
      expect(friendship?.address_requested).toBe(normalizeAddress(newIdentity.realAccount.address))
      const lastActionRecorded = await components.db.getLastFriendshipAction(friendship!.id)
      expect(lastActionRecorded?.action).toBe(Action.REQUEST)
      expect(lastActionRecorded?.acting_user).toBe(AUTH_ADDRESS)
      expect(lastActionRecorded?.metadata).toBeTruthy()
      expect(lastActionRecorded?.metadata).toEqual({
        message: 'Hi!, how u doing?'
      })
    })

    it('should be an invalid friendship action if requester sends a REJECT', async () => {
      const { socialServiceClient } = components
      const response = await socialServiceClient.client.upsertFriendship({
        action: {
          $case: 'reject',
          reject: {
            user: {
              address: identity.realAccount.address
            }
          }
        }
      })

      expect(response.response?.$case).toBe('invalidFriendshipAction')
    })

    it('should be an invalid friendship action if requester sends an ACCEPT', async () => {
      const { socialServiceClient } = components
      const response = await socialServiceClient.client.upsertFriendship({
        action: {
          $case: 'accept',
          accept: {
            user: {
              address: identity.realAccount.address
            }
          }
        }
      })

      expect(response.response?.$case).toBe('invalidFriendshipAction')
    })

    it('should be an invalid friendship action if requester sends a DELETE', async () => {
      const { socialServiceClient } = components
      const response = await socialServiceClient.client.upsertFriendship({
        action: {
          $case: 'delete',
          delete: {
            user: {
              address: identity.realAccount.address
            }
          }
        }
      })

      expect(response.response?.$case).toBe('invalidFriendshipAction')
    })

    it('should be an invalid friendship action if user has already requested friendship', async () => {
      const { socialServiceClient } = components
      const response = await socialServiceClient.client.upsertFriendship({
        action: {
          $case: 'request',
          request: {
            user: {
              address: identity.realAccount.address
            }
          }
        }
      })

      expect(response.response?.$case).toBe('invalidFriendshipAction')
    })

    it('should active the friendship if requested user sends an ACCEPT', async () => {
      const newFriendshipId = await createFriendshipRequest(components.db, ['0xa', AUTH_ADDRESS])
      const { socialServiceClient } = components

      const response = await socialServiceClient.client.upsertFriendship({
        action: {
          $case: 'accept',
          accept: {
            user: {
              address: '0xA'
            }
          }
        }
      })

      expect(response.response?.$case).toBe('accepted')
      const friendship = await components.db.getFriendship([AUTH_ADDRESS, '0xa'])
      expect(friendship?.id).toBe(newFriendshipId)
      expect(friendship?.is_active).toBeTruthy()
      expect(friendship?.address_requested).toBe(AUTH_ADDRESS)
      expect(friendship?.address_requester).toBe('0xa')
    })
  })
})
