import { test } from '../components'

test('Ban Status Handler', function ({ components }) {
  afterEach(async () => {
    await components.pg.query('DELETE FROM user_warnings')
    await components.pg.query('DELETE FROM user_bans')
  })

  describe('when getting the ban status for a player', () => {
    let targetAddress: string

    beforeEach(() => {
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the player is banned', () => {
      beforeEach(async () => {
        await components.userModerationDb.createBan({
          bannedAddress: targetAddress,
          bannedBy: '0x0000000000000000000000000000000000000099',
          reason: 'Spamming'
        })
      })

      it('should respond with a 200 and isBanned true with ban details', async () => {
        const response = await components.localHttpFetch.fetch(`/v1/moderation/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(true)
        expect(body.data.ban).toBeDefined()
      })
    })

    describe('and the player is not banned', () => {
      it('should respond with a 200 and isBanned false', async () => {
        const response = await components.localHttpFetch.fetch(`/v1/moderation/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(false)
      })
    })

    describe('and the player has an expired ban', () => {
      beforeEach(async () => {
        await components.userModerationDb.createBan({
          bannedAddress: targetAddress,
          bannedBy: '0x0000000000000000000000000000000000000099',
          reason: 'Expired ban',
          expiresAt: new Date(Date.now() - 1000)
        })
      })

      it('should respond with a 200 and isBanned false', async () => {
        const response = await components.localHttpFetch.fetch(`/v1/moderation/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(false)
      })
    })
  })
})
