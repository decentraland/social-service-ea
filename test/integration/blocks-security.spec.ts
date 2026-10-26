import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { test } from '../components'
import { createAuthHeaders, createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { createOrUpsertActiveFriendship, createPendingFriendshipRequest } from './utils/friendships'
import { connectAuthenticatedRpcClient } from './utils/rpc-client'

test('Blocks transport security', ({ components, stubComponents }) => {
  let identity: Identity
  let address: string
  let otherAddress: string
  let connection: Awaited<ReturnType<typeof connectAuthenticatedRpcClient>> | undefined

  beforeEach(async () => {
    identity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
    otherAddress = (await createTestIdentity()).realAccount.address.toLowerCase()
    stubComponents.registry.getProfile.mockResolvedValue(null)
  })

  afterEach(() => {
    connection?.close()
    connection = undefined
  })

  async function readData(path: string) {
    const response = await makeAuthenticatedRequest(components)(identity, path)
    const body = await response.json()
    expect(response.status).toBe(200)
    return body.data
  }

  async function unblock(transport: 'HTTP' | 'RPC'): Promise<void> {
    if (transport === 'HTTP') {
      const response = await makeAuthenticatedRequest(components)(identity, `/v1/blocks/${otherAddress}`, 'DELETE')
      await response.text()
      expect(response.status).toBe(204)
    } else {
      connection ??= await connectAuthenticatedRpcClient(components, identity)
      expect((await connection.client.unblockUser({ user: { address: otherAddress } })).response?.$case).toBe('ok')
    }
  }

  describe.each(['HTTP', 'RPC'] as const)('when unblocking using %s', (transport) => {
    describe('and the target is a never-blocked friend', () => {
      beforeEach(async () => {
        await createOrUpsertActiveFriendship(components.friendsDb, [address, otherAddress])
        await unblock(transport)
        await unblock(transport)
      })

      it('should preserve the active friend and accepted status after retries', async () => {
        expect((await readData('/v2/friends')).results).toEqual([{ address: otherAddress }])
        expect((await readData(`/v1/users/${otherAddress}/friendship-status`)).status).toBe(FriendshipStatus.ACCEPTED)
      })
    })

    describe('and only the other user placed a block', () => {
      beforeEach(async () => {
        await components.friendsDb.blockUser(otherAddress, address)
        await unblock(transport)
      })

      it('should preserve the other user block', async () => {
        expect(await readData('/v1/blocking-status')).toEqual({ blockedUsers: [], blockedByUsers: [otherAddress] })
      })
    })

    describe('and a delayed retry arrives after a new friendship request', () => {
      beforeEach(async () => {
        await createOrUpsertActiveFriendship(components.friendsDb, [address, otherAddress])
        await components.friends.blockUserWithoutProfile(address, otherAddress)
        await unblock(transport)
        await createPendingFriendshipRequest(components.friendsDb, [otherAddress, address])
        await unblock(transport)
      })

      it('should preserve the new incoming request', async () => {
        expect((await readData(`/v1/users/${otherAddress}/friendship-status`)).status).toBe(
          FriendshipStatus.REQUEST_RECEIVED
        )
      })
    })
  })

  describe('when alternating HTTP and RPC exhausts the pair rate limit', () => {
    let httpStatus: number
    let rpcResponseCase: string | undefined

    beforeEach(async () => {
      const pairLimit = (await components.config.getNumber('FRIENDSHIP_RATE_LIMIT_PER_PAIR')) ?? 10
      for (let attempt = 0; attempt < pairLimit; attempt++) {
        await unblock(attempt % 2 === 0 ? 'HTTP' : 'RPC')
      }
      const response = await makeAuthenticatedRequest(components)(identity, `/v1/blocks/${otherAddress}`, 'DELETE')
      await response.text()
      httpStatus = response.status
      connection ??= await connectAuthenticatedRpcClient(components, identity)
      rpcResponseCase = (await connection.client.unblockUser({ user: { address: otherAddress } })).response?.$case
    })

    it('should reject further mutations through either transport', () => {
      expect(httpStatus).toBe(429)
      expect(rpcResponseCase).toBe('invalidRequest')
    })
  })

  describe.each([
    ['GET', '/v2/blocks'],
    ['POST', '/v1/blocks'],
    ['DELETE', '/v1/blocks/0x1234567890123456789012345678901234567890'],
    ['GET', '/v1/blocking-status']
  ])('when a scene-signed caller accesses %s %s', (method, path) => {
    let status: number

    beforeEach(async () => {
      const response = await components.localHttpFetch.fetch(path, {
        method,
        headers: createAuthHeaders(method, path, { signer: 'decentraland-kernel-scene' }, identity)
      })
      await response.text()
      status = response.status
    })

    it('should reject the request', () => {
      expect(status).toBe(400)
    })
  })

  describe('when the body tries to specify a different blocker', () => {
    let status: number

    beforeEach(async () => {
      const response = await makeAuthenticatedRequest(components)(identity, '/v1/blocks', 'POST', {
        address: otherAddress,
        blockerAddress: otherAddress
      })
      await response.text()
      status = response.status
    })

    it('should reject the extra field without creating a block', async () => {
      expect(status).toBe(400)
      expect(await readData('/v1/blocking-status')).toEqual({ blockedUsers: [], blockedByUsers: [] })
    })
  })
})
