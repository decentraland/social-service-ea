import { test } from '../components'
import { createMockProfile } from '../mocks/profile'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { createOrUpsertActiveFriendship } from './utils/friendships'

test('Blocks Controller', function ({ components, stubComponents }) {
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
    stubComponents.registry.getProfile.mockImplementation(async (profileAddress: string) =>
      createMockProfile(profileAddress)
    )
  })

  async function getBlockingStatus(from: Identity) {
    const response = await makeRequest(from, '/v1/blocking-status')
    return (await response.json()).data
  }

  describe('when the request is not signed', () => {
    it('should respond with a 400 status code on every blocks endpoint', async () => {
      const routes: [string, string][] = [
        ['GET', '/v2/blocks'],
        ['POST', '/v1/blocks'],
        ['DELETE', `/v1/blocks/${otherAddress}`],
        ['GET', '/v1/blocking-status']
      ]

      for (const [method, path] of routes) {
        const response = await components.localHttpFetch.fetch(path, { method })
        expect({ method, path, status: response.status }).toEqual({ method, path, status: 400 })
      }
    })
  })

  describe('when blocking a user (POST /v1/blocks)', () => {
    describe('and the request is valid', () => {
      it('should respond with a 201, the blocked address and when it was blocked', async () => {
        const response = await makeRequest(identity, '/v1/blocks', 'POST', { address: otherAddress })

        expect(response.status).toBe(201)
        expect((await response.json()).data).toEqual({ address: otherAddress, blockedAt: expect.any(Number) })
      })

      it('should not resolve the blocked user profile', async () => {
        await makeRequest(identity, '/v1/blocks', 'POST', { address: otherAddress })

        expect(stubComponents.registry.getProfile).not.toHaveBeenCalled()
        expect(stubComponents.registry.getProfiles).not.toHaveBeenCalled()
      })

      it('should show the block in the blocking status of both users', async () => {
        await makeRequest(identity, '/v1/blocks', 'POST', { address: otherAddress })

        expect(await getBlockingStatus(identity)).toEqual({ blockedUsers: [otherAddress], blockedByUsers: [] })
        expect(await getBlockingStatus(otherIdentity)).toEqual({ blockedUsers: [], blockedByUsers: [address] })
      })
    })

    describe('and the users are friends', () => {
      beforeEach(async () => {
        await createOrUpsertActiveFriendship(components.friendsDb, [address, otherAddress])
      })

      it('should end the friendship', async () => {
        await makeRequest(identity, '/v1/blocks', 'POST', { address: otherAddress })

        const response = await makeRequest(otherIdentity, '/v2/friends')
        expect((await response.json()).data.total).toBe(0)
      })
    })

    describe('and the caller blocks themselves', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/blocks', 'POST', { address })

        expect(response.status).toBe(400)
      })
    })

    describe('and the body is not valid', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/blocks', 'POST', { user: otherAddress })

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when getting the blocked users (GET /v2/blocks)', () => {
    beforeEach(async () => {
      await makeRequest(identity, '/v1/blocks', 'POST', { address: otherAddress })
    })

    it('should respond with the blocked address and the pagination properties', async () => {
      const response = await makeRequest(identity, '/v2/blocks?limit=10')

      expect(response.status).toBe(200)
      expect((await response.json()).data).toEqual({
        results: [{ address: otherAddress, blockedAt: expect.any(Number) }],
        total: 1,
        page: 1,
        pages: 1,
        limit: 10
      })
    })

    it('should not list the block for the blocked user', async () => {
      const response = await makeRequest(otherIdentity, '/v2/blocks')

      expect((await response.json()).data.total).toBe(0)
    })
  })

  describe('when unblocking a user (DELETE /v1/blocks/:address)', () => {
    beforeEach(async () => {
      await makeRequest(identity, '/v1/blocks', 'POST', { address: otherAddress })
    })

    describe('and the address is blocked', () => {
      it('should respond with a 204 and remove the block', async () => {
        const response = await makeRequest(identity, `/v1/blocks/${otherAddress}`, 'DELETE')

        expect(response.status).toBe(204)
        expect(await getBlockingStatus(otherIdentity)).toEqual({ blockedUsers: [], blockedByUsers: [] })
      })
    })

    describe('and the address is not valid', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/blocks/0x123', 'DELETE')

        expect(response.status).toBe(400)
      })
    })
  })
})
