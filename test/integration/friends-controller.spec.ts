import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { test } from '../components'
import { createMockProfile } from '../mocks/profile'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { createOrUpsertActiveFriendship, createPendingFriendshipRequest } from './utils/friendships'

test('Friends Controller', function ({ components, stubComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  let identity: Identity
  let address: string
  let otherIdentity: Identity
  let otherAddress: string

  beforeEach(async () => {
    identity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
    otherIdentity = await createTestIdentity()
    otherAddress = otherIdentity.realAccount.address.toLowerCase()

    stubComponents.registry.getProfiles.mockImplementation(async (addresses: string[]) =>
      addresses.map((profileAddress) => createMockProfile(profileAddress))
    )
  })

  async function getStatus(from: Identity, to: string): Promise<FriendshipStatus> {
    const response = await makeRequest(from, `/v1/users/${to}/friendship-status`)
    return (await response.json()).data.status
  }

  describe('when the request is not signed', () => {
    it('should respond with a 400 status code on every friends endpoint', async () => {
      const routes: [string, string][] = [
        ['GET', '/v2/friends'],
        ['DELETE', `/v1/friends/${otherAddress}`],
        ['GET', `/v2/users/${otherAddress}/mutual-friends`],
        ['GET', `/v1/users/${otherAddress}/friendship-status`],
        ['GET', '/v2/friendship-requests?direction=received'],
        ['POST', '/v1/friendship-requests'],
        ['PATCH', `/v1/friendship-requests/${otherAddress}`]
      ]

      for (const [method, path] of routes) {
        const response = await components.localHttpFetch.fetch(path, { method })
        expect({ method, path, status: response.status }).toEqual({ method, path, status: 400 })
      }
    })
  })

  describe('when getting the friends (GET /v2/friends)', () => {
    describe('and the user has a friend', () => {
      beforeEach(async () => {
        await createOrUpsertActiveFriendship(components.friendsDb, [address, otherAddress])
      })

      it('should respond with the friend address and the pagination properties', async () => {
        const response = await makeRequest(identity, '/v2/friends?limit=10')

        expect(response.status).toBe(200)
        expect((await response.json()).data).toEqual({
          results: [{ address: otherAddress }],
          total: 1,
          page: 1,
          pages: 1,
          limit: 10
        })
      })
    })

    describe('and the user has no friends', () => {
      it('should respond with an empty page', async () => {
        const response = await makeRequest(identity, '/v2/friends')

        expect(response.status).toBe(200)
        expect((await response.json()).data).toEqual({ results: [], total: 0, page: 1, pages: 0, limit: 100 })
      })
    })

    describe('and the profiles service is down', () => {
      beforeEach(async () => {
        await createOrUpsertActiveFriendship(components.friendsDb, [address, otherAddress])
        stubComponents.registry.getProfiles.mockRejectedValue(new Error('catalyst down'))
      })

      it('should still respond with the friends, since no profile is resolved', async () => {
        const response = await makeRequest(identity, '/v2/friends')

        expect(response.status).toBe(200)
        expect((await response.json()).data.results).toEqual([{ address: otherAddress }])
        expect(stubComponents.registry.getProfiles).not.toHaveBeenCalled()
      })
    })
  })

  describe('when getting the mutual friends (GET /v2/users/:address/mutual-friends)', () => {
    describe('and both users share a friend', () => {
      let mutualAddress: string

      beforeEach(async () => {
        mutualAddress = (await createTestIdentity()).realAccount.address.toLowerCase()
        await createOrUpsertActiveFriendship(components.friendsDb, [address, mutualAddress])
        await createOrUpsertActiveFriendship(components.friendsDb, [otherAddress, mutualAddress])
      })

      it('should respond with the shared friend', async () => {
        const response = await makeRequest(identity, `/v2/users/${otherAddress}/mutual-friends`)

        expect(response.status).toBe(200)
        const { data } = await response.json()
        expect(data.total).toBe(1)
        expect(data.results).toEqual([{ address: mutualAddress }])
      })
    })

    describe('and the address is not valid', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v2/users/not-an-address/mutual-friends')

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when getting the friendship status (GET /v1/users/:address/friendship-status)', () => {
    describe('and the users are friends', () => {
      beforeEach(async () => {
        await createOrUpsertActiveFriendship(components.friendsDb, [otherAddress, address])
      })

      it('should respond with the accepted status', async () => {
        const response = await makeRequest(identity, `/v1/users/${otherAddress}/friendship-status`)

        expect(response.status).toBe(200)
        expect((await response.json()).data).toEqual({ status: FriendshipStatus.ACCEPTED })
      })
    })

    describe('and the users never interacted', () => {
      it('should respond with the none status', async () => {
        expect(await getStatus(identity, otherAddress)).toBe(FriendshipStatus.NONE)
      })
    })

    describe('and the address is not valid', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/users/0x123/friendship-status')

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when getting the friendship requests (GET /v2/friendship-requests)', () => {
    beforeEach(async () => {
      await createPendingFriendshipRequest(components.friendsDb, [otherAddress, address])
    })

    describe('and the direction is received', () => {
      it('should respond with the requests sent to the caller', async () => {
        const response = await makeRequest(identity, '/v2/friendship-requests?direction=received')

        expect(response.status).toBe(200)
        const { data } = await response.json()
        expect(data.total).toBe(1)
        expect(data.results).toEqual([{ id: expect.any(String), address: otherAddress, createdAt: expect.any(Number) }])
      })
    })

    describe('and the direction is sent', () => {
      it('should respond with the requests the caller sent', async () => {
        const response = await makeRequest(otherIdentity, '/v2/friendship-requests?direction=sent')

        expect(response.status).toBe(200)
        const { data } = await response.json()
        expect(data.total).toBe(1)
        expect(data.results).toEqual([{ id: expect.any(String), address, createdAt: expect.any(Number) }])
      })

      it('should not include them in the requests the caller received', async () => {
        const response = await makeRequest(otherIdentity, '/v2/friendship-requests?direction=received')

        expect((await response.json()).data.total).toBe(0)
      })
    })

    describe('and the direction is missing', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v2/friendship-requests')

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when sending a friendship request (POST /v1/friendship-requests)', () => {
    describe('and the request is valid', () => {
      it('should respond with a 201 and the created request', async () => {
        const response = await makeRequest(identity, '/v1/friendship-requests', 'POST', {
          address: otherAddress,
          message: 'hello'
        })

        expect(response.status).toBe(201)
        expect((await response.json()).data).toEqual({
          id: expect.any(String),
          address: otherAddress,
          createdAt: expect.any(Number),
          message: 'hello'
        })
      })

      it('should leave the request pending for both users', async () => {
        await makeRequest(identity, '/v1/friendship-requests', 'POST', { address: otherAddress })

        expect(await getStatus(identity, otherAddress)).toBe(FriendshipStatus.REQUEST_SENT)
        expect(await getStatus(otherIdentity, address)).toBe(FriendshipStatus.REQUEST_RECEIVED)
      })
    })

    describe('and the receiver has no profile', () => {
      beforeEach(() => {
        stubComponents.registry.getProfiles.mockResolvedValue([])
      })

      it('should still respond with a 201 and leave the request pending', async () => {
        const response = await makeRequest(identity, '/v1/friendship-requests', 'POST', { address: otherAddress })

        expect(response.status).toBe(201)
        expect(await getStatus(otherIdentity, address)).toBe(FriendshipStatus.REQUEST_RECEIVED)
      })
    })

    describe('and the message is longer than 256 characters', () => {
      it('should respond with a 400 status code without recording the request', async () => {
        const response = await makeRequest(identity, '/v1/friendship-requests', 'POST', {
          address: otherAddress,
          message: 'a'.repeat(257)
        })

        expect(response.status).toBe(400)
        expect(await getStatus(identity, otherAddress)).toBe(FriendshipStatus.NONE)
      })
    })

    describe('and a request is already pending', () => {
      beforeEach(async () => {
        await createPendingFriendshipRequest(components.friendsDb, [address, otherAddress])
      })

      it('should respond with a 409 status code', async () => {
        const response = await makeRequest(identity, '/v1/friendship-requests', 'POST', { address: otherAddress })

        expect(response.status).toBe(409)
      })
    })

    describe('and the other user blocked the caller', () => {
      beforeEach(async () => {
        await components.friendsDb.blockUser(otherAddress, address)
      })

      it('should respond with a 403 status code', async () => {
        const response = await makeRequest(identity, '/v1/friendship-requests', 'POST', { address: otherAddress })

        expect(response.status).toBe(403)
      })
    })

    describe('and the caller sends it to themselves', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/friendship-requests', 'POST', { address })

        expect(response.status).toBe(400)
      })
    })

    describe('and the body is not valid', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/friendship-requests', 'POST', { address: 'not-an-address' })

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when updating a friendship request (PATCH /v1/friendship-requests/:address)', () => {
    beforeEach(async () => {
      await createPendingFriendshipRequest(components.friendsDb, [otherAddress, address])
    })

    describe('and the receiver accepts it', () => {
      it('should respond with a 200 and make both users friends', async () => {
        const response = await makeRequest(identity, `/v1/friendship-requests/${otherAddress}`, 'PATCH', {
          intention: 'accepted'
        })

        expect(response.status).toBe(200)
        expect(await getStatus(identity, otherAddress)).toBe(FriendshipStatus.ACCEPTED)

        const friendsResponse = await makeRequest(otherIdentity, '/v2/friends')
        expect((await friendsResponse.json()).data.results).toEqual([{ address }])
      })
    })

    describe('and the receiver rejects it', () => {
      it('should respond with a 200 and leave the request rejected', async () => {
        const response = await makeRequest(identity, `/v1/friendship-requests/${otherAddress}`, 'PATCH', {
          intention: 'rejected'
        })

        expect(response.status).toBe(200)
        expect(await getStatus(identity, otherAddress)).toBe(FriendshipStatus.REJECTED)
      })
    })

    describe('and the sender cancels it', () => {
      it('should respond with a 200 and leave the request cancelled', async () => {
        const response = await makeRequest(otherIdentity, `/v1/friendship-requests/${address}`, 'PATCH', {
          intention: 'cancelled'
        })

        expect(response.status).toBe(200)
        expect(await getStatus(identity, otherAddress)).toBe(FriendshipStatus.CANCELED)
      })
    })

    describe('and the sender tries to accept their own request', () => {
      it('should respond with a 409 status code', async () => {
        const response = await makeRequest(otherIdentity, `/v1/friendship-requests/${address}`, 'PATCH', {
          intention: 'accepted'
        })

        expect(response.status).toBe(409)
      })
    })

    describe('and the intention is not valid', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, `/v1/friendship-requests/${otherAddress}`, 'PATCH', {
          intention: 'pending'
        })

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when removing a friend (DELETE /v1/friends/:address)', () => {
    describe('and the users are friends', () => {
      beforeEach(async () => {
        await createOrUpsertActiveFriendship(components.friendsDb, [address, otherAddress])
      })

      it('should respond with a 204 and end the friendship', async () => {
        const response = await makeRequest(identity, `/v1/friends/${otherAddress}`, 'DELETE')

        expect(response.status).toBe(204)
        expect(await getStatus(otherIdentity, address)).toBe(FriendshipStatus.DELETED)
      })
    })

    describe('and the friend has no profile', () => {
      beforeEach(async () => {
        await createOrUpsertActiveFriendship(components.friendsDb, [address, otherAddress])
        stubComponents.registry.getProfiles.mockResolvedValue([])
      })

      it('should still respond with a 204 and end the friendship', async () => {
        const response = await makeRequest(identity, `/v1/friends/${otherAddress}`, 'DELETE')

        expect(response.status).toBe(204)
        expect(await getStatus(otherIdentity, address)).toBe(FriendshipStatus.DELETED)
      })
    })

    describe('and the users are not friends', () => {
      it('should respond with a 409 status code', async () => {
        const response = await makeRequest(identity, `/v1/friends/${otherAddress}`, 'DELETE')

        expect(response.status).toBe(409)
      })
    })
  })
})
