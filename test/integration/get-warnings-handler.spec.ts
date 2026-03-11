import { test, TEST_MODERATOR_ACCOUNT } from '../components'
import { createTestIdentity, createTestIdentityFromAccount, Identity, makeAuthenticatedRequest } from './utils/auth'

test('Get Warnings Handler', function ({ components }) {
  const makeRequest = makeAuthenticatedRequest(components)

  afterEach(async () => {
    await components.pg.query('DELETE FROM user_warnings')
    await components.pg.query('DELETE FROM user_bans')
  })

  describe('when getting warnings for a player', () => {
    let targetAddress: string

    beforeEach(() => {
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localHttpFetch.fetch(`/v1/moderation/users/${targetAddress}/warnings`, {
          method: 'GET'
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the caller is not a moderator', () => {
        let nonModeratorIdentity: Identity

        beforeEach(async () => {
          nonModeratorIdentity = await createTestIdentity()
        })

        it('should respond with a 401 and the unauthorized error', async () => {
          const response = await makeRequest(
            nonModeratorIdentity,
            `/v1/moderation/users/${targetAddress}/warnings`
          )
          expect(response.status).toBe(401)
          const body = await response.json()
          expect(body.error).toBe('You are not authorized to access this resource')
        })
      })

      describe('and the caller is a moderator', () => {
        let moderatorIdentity: Identity

        beforeEach(async () => {
          moderatorIdentity = await createTestIdentityFromAccount(TEST_MODERATOR_ACCOUNT)
        })

        describe('and the player has multiple warnings', () => {
          beforeEach(async () => {
            await makeRequest(moderatorIdentity, `/v1/moderation/users/${targetAddress}/warnings`, 'POST', {
              reason: 'Warning 1'
            })
            await makeRequest(moderatorIdentity, `/v1/moderation/users/${targetAddress}/warnings`, 'POST', {
              reason: 'Warning 2'
            })
          })

          it('should respond with a 200 and all warnings', async () => {
            const response = await makeRequest(moderatorIdentity, `/v1/moderation/users/${targetAddress}/warnings`)
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
            const response = await makeRequest(moderatorIdentity, `/v1/moderation/users/${unknownAddress}/warnings`)
            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data).toEqual([])
          })
        })
      })
    })
  })
})
