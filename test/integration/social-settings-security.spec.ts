import { PrivateMessagePrivacySetting } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { PrivateMessagesPrivacy } from '../../src/types'
import { test } from '../components'
import { createAuthHeaders, createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { connectAuthenticatedRpcClient } from './utils/rpc-client'

test('Social settings transport security', ({ components, stubComponents }) => {
  let identity: Identity
  let otherIdentity: Identity
  let address: string
  let otherAddress: string
  let connection: Awaited<ReturnType<typeof connectAuthenticatedRpcClient>> | undefined
  let gatekeeperSpy: jest.SpyInstance

  beforeEach(async () => {
    identity = await createTestIdentity()
    otherIdentity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
    otherAddress = otherIdentity.realAccount.address.toLowerCase()
    gatekeeperSpy = jest.spyOn(components.commsGatekeeper, 'updateUserPrivateMessagePrivacyMetadata').mockResolvedValue(undefined)
    stubComponents.registry.getProfile.mockRejectedValue(new Error('No profiles available'))
    stubComponents.registry.getProfiles.mockRejectedValue(new Error('No profiles available'))
  })

  afterEach(() => {
    connection?.close()
    connection = undefined
    gatekeeperSpy.mockRestore()
  })

  async function getPrivacy(user: Identity): Promise<PrivateMessagesPrivacy> {
    const response = await makeAuthenticatedRequest(components)(user, '/v1/social-settings')
    const body = await response.json()
    expect(response.status).toBe(200)
    return body.data.privateMessagesPrivacy
  }

  async function updatePrivacy(transport: 'HTTP' | 'RPC', privacy: PrivateMessagesPrivacy): Promise<number> {
    if (transport === 'HTTP') {
      const response = await makeAuthenticatedRequest(components)(identity, '/v1/social-settings', 'PATCH', {
        privateMessagesPrivacy: privacy
      })
      await response.text()
      return response.status
    }
    connection ??= await connectAuthenticatedRpcClient(components, identity)
    const result = await connection.client.upsertSocialSettings({
      privateMessagesPrivacy: privacy === PrivateMessagesPrivacy.ALL
        ? PrivateMessagePrivacySetting.ALL
        : PrivateMessagePrivacySetting.ONLY_FRIENDS
    })
    expect(['ok', 'internalServerError']).toContain(result.response?.$case)
    return result.response?.$case === 'ok' ? 200 : 500
  }

  describe.each(['HTTP', 'RPC'] as const)('when updating settings through %s', (transport) => {
    describe('and restricting private messages succeeds', () => {
      let status: number

      beforeEach(async () => {
        status = await updatePrivacy(transport, PrivateMessagesPrivacy.ONLY_FRIENDS)
      })

      it('should change only the authenticated user settings and Gatekeeper metadata', async () => {
        expect(status).toBe(200)
        expect(await getPrivacy(identity)).toBe(PrivateMessagesPrivacy.ONLY_FRIENDS)
        expect(await getPrivacy(otherIdentity)).toBe(PrivateMessagesPrivacy.ALL)
        expect(gatekeeperSpy).toHaveBeenCalledWith(address, PrivateMessagesPrivacy.ONLY_FRIENDS)
      })

      it('should succeed without resolving profiles', () => {
        expect(stubComponents.registry.getProfile).not.toHaveBeenCalled()
        expect(stubComponents.registry.getProfiles).not.toHaveBeenCalled()
      })
    })

    describe.each([PrivateMessagesPrivacy.ALL, PrivateMessagesPrivacy.ONLY_FRIENDS])(
      'and Gatekeeper fails while setting privacy to %s',
      (privacy) => {
        let status: number

        beforeEach(async () => {
          await components.friendsDb.upsertSocialSettings(address, {
            private_messages_privacy: privacy === PrivateMessagesPrivacy.ALL
              ? PrivateMessagesPrivacy.ONLY_FRIENDS
              : PrivateMessagesPrivacy.ALL
          })
          gatekeeperSpy.mockRejectedValueOnce(new Error('Gatekeeper unavailable'))
          status = await updatePrivacy(transport, privacy)
        })

        it('should report failure and preserve the existing write ordering', async () => {
          expect(status).toBe(500)
          // Tightening is not persisted if Gatekeeper rejects it; loosening is persisted first.
          expect(await getPrivacy(identity)).toBe(PrivateMessagesPrivacy.ALL)
        })
      }
    )
  })

  describe.each(['HTTP', 'RPC'] as const)('when reading private messages settings through %s', (transport) => {
    describe.each([50, 51])('and requesting %s addresses', (count) => {
      let accepted: boolean
      let resultCount: number | undefined

      beforeEach(async () => {
        const addresses = Array.from({ length: count }, (_, index) => `0x${(index + 1).toString(16).padStart(40, '0')}`)
        resultCount = undefined
        if (transport === 'HTTP') {
          const query = new URLSearchParams(addresses.map((userAddress) => ['addresses', userAddress]))
          const response = await makeAuthenticatedRequest(components)(identity, `/v1/private-messages-settings?${query}`)
          const body = await response.json()
          expect(response.status).toBe(count === 50 ? 200 : 400)
          accepted = response.status === 200
          resultCount = body.data?.length
        } else {
          connection = await connectAuthenticatedRpcClient(components, identity)
          const result = await connection.client.getPrivateMessagesSettings({ user: addresses.map((value) => ({ address: value })) })
          expect(result.response?.$case).toBe(count === 50 ? 'ok' : 'invalidRequest')
          accepted = result.response?.$case === 'ok'
          if (result.response?.$case === 'ok') resultCount = result.response.ok.settings.length
        }
      })

      it('should enforce the same address limit', () => {
        expect(accepted).toBe(count === 50)
        expect(resultCount).toBe(count === 50 ? 50 : undefined)
      })
    })
  })

  describe.each([
    ['GET', '/v1/social-settings'],
    ['PATCH', '/v1/social-settings'],
    ['GET', '/v1/private-messages-settings']
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

    it('should reject the request before changing Gatekeeper metadata', () => {
      expect(status).toBe(400)
      expect(gatekeeperSpy).not.toHaveBeenCalled()
    })
  })

  describe('when the PATCH body tries to select another user', () => {
    let status: number

    beforeEach(async () => {
      const response = await makeAuthenticatedRequest(components)(identity, '/v1/social-settings', 'PATCH', {
        address: otherAddress,
        privateMessagesPrivacy: 'only_friends'
      })
      await response.text()
      status = response.status
    })

    it('should reject the unknown field without modifying either user', async () => {
      expect(status).toBe(400)
      expect(await getPrivacy(identity)).toBe(PrivateMessagesPrivacy.ALL)
      expect(await getPrivacy(otherIdentity)).toBe(PrivateMessagesPrivacy.ALL)
      expect(gatekeeperSpy).not.toHaveBeenCalled()
    })
  })
})
