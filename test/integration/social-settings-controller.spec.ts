import { test } from '../components'
import { PrivateMessagesPrivacy } from '../../src/types'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { createOrUpdateSocialSettings, createOrUpsertActiveFriendship, removeSocialSettings } from './utils/friendships'

test('Social Settings Controller', function ({ components }) {
  const makeRequest = makeAuthenticatedRequest(components)

  let identity: Identity
  let address: string
  let gatekeeperSpy: jest.SpyInstance

  beforeEach(async () => {
    identity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
    gatekeeperSpy = jest
      .spyOn(components.commsGatekeeper, 'updateUserPrivateMessagePrivacyMetadata')
      .mockResolvedValue(undefined)
  })

  afterEach(async () => {
    gatekeeperSpy.mockRestore()
    await removeSocialSettings(components.friendsDb, address)
  })

  async function getSettings() {
    const response = await makeRequest(identity, '/v1/social-settings')
    return (await response.json()).data
  }

  describe('when the request is not signed', () => {
    it('should respond with a 400 status code on every settings endpoint', async () => {
      const routes: [string, string][] = [
        ['GET', '/v1/social-settings'],
        ['PATCH', '/v1/social-settings'],
        ['GET', '/v1/private-messages-settings']
      ]

      for (const [method, path] of routes) {
        const response = await components.localHttpFetch.fetch(path, { method })
        await response.text()
        expect({ method, path, status: response.status }).toEqual({ method, path, status: 400 })
      }
    })
  })

  describe('when getting the social settings (GET /v1/social-settings)', () => {
    describe('and the user never changed them', () => {
      it('should respond with the default settings', async () => {
        const response = await makeRequest(identity, '/v1/social-settings')

        expect(response.status).toBe(200)
        expect((await response.json()).data).toEqual({
          privateMessagesPrivacy: 'all',
          blockedUsersMessagesVisibility: 'show_messages',
          showSituationReactions: 'show'
        })
      })
    })
  })

  describe('when updating the social settings (PATCH /v1/social-settings)', () => {
    describe('and only some settings are submitted', () => {
      beforeEach(async () => {
        await createOrUpdateSocialSettings(components.friendsDb, address, PrivateMessagesPrivacy.ALL)
      })

      it('should respond with every setting and keep the others unchanged', async () => {
        const response = await makeRequest(identity, '/v1/social-settings', 'PATCH', {
          blockedUsersMessagesVisibility: 'do_not_show_messages'
        })

        expect(response.status).toBe(200)
        expect((await response.json()).data).toEqual({
          privateMessagesPrivacy: 'all',
          blockedUsersMessagesVisibility: 'do_not_show_messages',
          showSituationReactions: 'show'
        })
        expect(await getSettings()).toEqual(expect.objectContaining({ blockedUsersMessagesVisibility: 'do_not_show_messages' }))
      })

      it('should not call Gatekeeper', async () => {
        const response = await makeRequest(identity, '/v1/social-settings', 'PATCH', { showSituationReactions: 'hide' })
        await response.text()

        expect(gatekeeperSpy).not.toHaveBeenCalled()
      })
    })

    describe('and the private messages privacy is restricted to friends', () => {
      it('should store it and sync it to Gatekeeper', async () => {
        const response = await makeRequest(identity, '/v1/social-settings', 'PATCH', {
          privateMessagesPrivacy: 'only_friends'
        })

        await response.text()
        expect(response.status).toBe(200)
        expect(gatekeeperSpy).toHaveBeenCalledWith(address, PrivateMessagesPrivacy.ONLY_FRIENDS)
        expect((await getSettings()).privateMessagesPrivacy).toBe('only_friends')
      })
    })

    describe('and Gatekeeper fails while restricting the privacy', () => {
      beforeEach(() => {
        gatekeeperSpy.mockRejectedValue(new Error('gatekeeper down'))
      })

      it('should respond with a 500 status code and keep the previous privacy', async () => {
        const response = await makeRequest(identity, '/v1/social-settings', 'PATCH', {
          privateMessagesPrivacy: 'only_friends'
        })

        await response.text()
        expect(response.status).toBe(500)
        expect((await getSettings()).privateMessagesPrivacy).toBe('all')
      })
    })

    describe('and the body is empty', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/social-settings', 'PATCH', {})

        await response.text()
        expect(response.status).toBe(400)
      })
    })

    describe('and a setting has an unknown value', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/social-settings', 'PATCH', {
          privateMessagesPrivacy: 'nobody'
        })

        await response.text()
        expect(response.status).toBe(400)
      })
    })
  })

  describe('when getting the private messages settings (GET /v1/private-messages-settings)', () => {
    let friendAddress: string
    let strangerAddress: string

    beforeEach(async () => {
      friendAddress = (await createTestIdentity()).realAccount.address.toLowerCase()
      strangerAddress = (await createTestIdentity()).realAccount.address.toLowerCase()
      await createOrUpsertActiveFriendship(components.friendsDb, [address, friendAddress])
      await createOrUpdateSocialSettings(components.friendsDb, strangerAddress, PrivateMessagesPrivacy.ONLY_FRIENDS)
    })

    afterEach(async () => {
      await removeSocialSettings(components.friendsDb, strangerAddress)
    })

    it('should respond with the privacy of each user and whether they are friends of the caller', async () => {
      const response = await makeRequest(
        identity,
        `/v1/private-messages-settings?addresses=${friendAddress}&addresses=${strangerAddress}`
      )

      expect(response.status).toBe(200)
      expect((await response.json()).data).toEqual([
        { address: friendAddress, privateMessagesPrivacy: 'all', isFriend: true },
        { address: strangerAddress, privateMessagesPrivacy: 'only_friends', isFriend: false }
      ])
    })

    describe('and an address is not valid', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/private-messages-settings?addresses=0x123')

        await response.text()
        expect(response.status).toBe(400)
      })
    })
  })
})
