import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

test('User Moderation Controller', function ({ components }) {
  const makeRequest = makeAuthenticatedRequest(components)

  afterEach(async () => {
    await components.pg.query('DELETE FROM user_warnings')
    await components.pg.query('DELETE FROM user_bans')
  })

  describe('when banning a player', () => {
    let identity: Identity
    let targetAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localHttpFetch.fetch(`/v1/moderation/users/${targetAddress}/bans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'test' })
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and a permanent ban is created with a valid reason', () => {
        it('should respond with a 201 status code and the ban data', async () => {
          const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`, 'POST', {
            reason: 'Spamming'
          })
          expect(response.status).toBe(201)
          const body = await response.json()
          expect(body.data).toMatchObject({
            bannedAddress: targetAddress,
            reason: 'Spamming',
            expiresAt: null,
            liftedAt: null
          })
          expect(body.data.id).toBeDefined()
        })
      })

      describe('and a timed ban is created with duration and custom message', () => {
        let duration: number

        beforeEach(() => {
          duration = 3600000
        })

        it('should respond with a 201 status code and include expiresAt and customMessage', async () => {
          const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`, 'POST', {
            reason: 'Temporary ban',
            duration,
            customMessage: 'You have been temporarily banned'
          })
          expect(response.status).toBe(201)
          const body = await response.json()
          expect(body.data).toMatchObject({
            bannedAddress: targetAddress,
            reason: 'Temporary ban',
            customMessage: 'You have been temporarily banned'
          })
          expect(body.data.expiresAt).toBeDefined()
        })
      })

      describe('and the player is already banned', () => {
        beforeEach(async () => {
          await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`, 'POST', {
            reason: 'First ban'
          })
        })

        it('should respond with a 409 and a conflict error', async () => {
          const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`, 'POST', {
            reason: 'Second ban'
          })
          expect(response.status).toBe(409)
          const body = await response.json()
          expect(body.error).toBe('Conflict')
        })
      })

      describe('and the reason is missing from the body', () => {
        it('should respond with a 400 status code', async () => {
          const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`, 'POST', {})
          expect(response.status).toBe(400)
        })
      })
    })
  })

  describe('when listing active bans', () => {
    let identity: Identity

    beforeEach(async () => {
      identity = await createTestIdentity()
    })

    describe('and there are no active bans', () => {
      it('should respond with a 200 and an empty array', async () => {
        const response = await makeRequest(identity, '/v1/moderation/bans')
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data).toEqual([])
      })
    })

    describe('and there are multiple active bans', () => {
      let address1: string
      let address2: string

      beforeEach(async () => {
        address1 = '0x0000000000000000000000000000000000000001'
        address2 = '0x0000000000000000000000000000000000000002'
        await makeRequest(identity, `/v1/moderation/users/${address1}/bans`, 'POST', { reason: 'Ban 1' })
        await makeRequest(identity, `/v1/moderation/users/${address2}/bans`, 'POST', { reason: 'Ban 2' })
      })

      it('should respond with a 200 and all active bans', async () => {
        const response = await makeRequest(identity, '/v1/moderation/bans')
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data).toHaveLength(2)
      })
    })
  })

  describe('when lifting a ban', () => {
    let identity: Identity
    let targetAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the player has an active ban', () => {
      beforeEach(async () => {
        await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`, 'POST', {
          reason: 'Spamming'
        })
      })

      it('should respond with a 204 status code', async () => {
        const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`, 'DELETE')
        expect(response.status).toBe(204)
      })
    })

    describe('and no active ban exists for the player', () => {
      it('should respond with a 404 and a not found error', async () => {
        const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`, 'DELETE')
        expect(response.status).toBe(404)
        const body = await response.json()
        expect(body.error).toBe('Not Found')
      })
    })
  })

  describe('when getting ban status for a player', () => {
    let identity: Identity
    let targetAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the player is banned', () => {
      beforeEach(async () => {
        await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`, 'POST', {
          reason: 'Spamming'
        })
      })

      it('should respond with a 200 and isBanned true with ban details', async () => {
        const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(true)
        expect(body.data.ban).toBeDefined()
      })
    })

    describe('and the player is not banned', () => {
      it('should respond with a 200 and isBanned false', async () => {
        const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`)
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
        const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/bans`)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(false)
      })
    })

    describe('and the request is not signed', () => {
      it('should still respond with a 200 and isBanned false', async () => {
        const response = await components.localHttpFetch.fetch(`/v1/moderation/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(false)
      })
    })
  })

  describe('when warning a player', () => {
    let identity: Identity
    let targetAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localHttpFetch.fetch(`/v1/moderation/users/${targetAddress}/warnings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'test' })
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and a valid reason is provided', () => {
        it('should respond with a 201 and the warning data', async () => {
          const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/warnings`, 'POST', {
            reason: 'Inappropriate language'
          })
          expect(response.status).toBe(201)
          const body = await response.json()
          expect(body.data).toMatchObject({
            warnedAddress: targetAddress,
            reason: 'Inappropriate language'
          })
          expect(body.data.id).toBeDefined()
        })
      })

      describe('and the reason is missing from the body', () => {
        it('should respond with a 400 status code', async () => {
          const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/warnings`, 'POST', {})
          expect(response.status).toBe(400)
        })
      })
    })
  })

  describe('when getting warnings for a player', () => {
    let identity: Identity
    let targetAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the player has multiple warnings', () => {
      beforeEach(async () => {
        await makeRequest(identity, `/v1/moderation/users/${targetAddress}/warnings`, 'POST', {
          reason: 'Warning 1'
        })
        await makeRequest(identity, `/v1/moderation/users/${targetAddress}/warnings`, 'POST', {
          reason: 'Warning 2'
        })
      })

      it('should respond with a 200 and all warnings', async () => {
        const response = await makeRequest(identity, `/v1/moderation/users/${targetAddress}/warnings`)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data).toHaveLength(2)
      })
    })

    describe('and the player has no warnings', () => {
      let unknownAddress: string

      beforeEach(() => {
        unknownAddress = '0x0000000000000000000000000000000000000099'
      })

      it('should respond with a 200 and an empty array', async () => {
        const response = await makeRequest(identity, `/v1/moderation/users/${unknownAddress}/warnings`)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data).toEqual([])
      })
    })
  })
})
