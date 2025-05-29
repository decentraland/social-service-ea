import { test } from '../components'
import { PrivateMessagesPrivacy } from '../../src/types'
import { createOrUpdateSocialSettings } from './utils/friendships'

test('Privacy Controller', function ({ components, spyComponents }) {
  describe('when checking the privacy settings', () => {
    let address: string

    describe('and there are privacy settings set for the address', () => {
      beforeEach(async () => {
        address = '0xa8b0cc8d68b3708df1a2ea3aef330d0e42681df8'
        await createOrUpdateSocialSettings(components.friendsDb, address, PrivateMessagesPrivacy.ONLY_FRIENDS)
      })

      it('should respond with a 200 status code and the privacy settings', async () => {
        const { localUwsFetch } = components

        const response = await localUwsFetch.fetch(`/v1/users/${address}/privacy-settings`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS
        })
      })
    })

    describe('and there are no privacy settings set for the address', () => {
      beforeAll(async () => {
        address = '0x0000000000000000000000000000000000000000'
      })

      it('should respond with a 200 status code and the default privacy settings', async () => {
        const { localUwsFetch } = components

        const response = await localUwsFetch.fetch(`/v1/users/${address}/privacy-settings`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          private_messages_privacy: PrivateMessagesPrivacy.ALL
        })
      })
    })

    describe('and the address is not valid', () => {
      beforeAll(async () => {
        address = '0x'
      })

      it('should respond with a 400 status code and a message saying that the address is invalid', async () => {
        const { localUwsFetch } = components

        const response = await localUwsFetch.fetch(`/v1/users/${address}/privacy-settings`)
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'Invalid address' })
      })
    })

    describe('and getting the privacy settings from the DB fails', () => {
      beforeEach(() => {
        spyComponents.friendsDb.getSocialSettings.mockRejectedValueOnce(new Error('Failed to get privacy settings'))
        address = '0xa8b0cc8d68b3708df1a2ea3aef330d0e42681df8'
      })

      it('should respond with a 500 status code and an error message', async () => {
        const { localUwsFetch } = components
        const response = await localUwsFetch.fetch(`/v1/users/${address}/privacy-settings`)
        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({ error: 'Failed to get privacy settings' })
      })
    })
  })
})
