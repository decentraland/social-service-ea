import { test, TEST_MODERATOR_ACCOUNT } from '../components'
import { createTestIdentity, createTestIdentityFromAccount, Identity, makeAuthenticatedRequest } from './utils/auth'

test('Lift Ban Handler', function ({ components }) {
  const makeRequest = makeAuthenticatedRequest(components)

  afterEach(async () => {
    await components.pg.query('DELETE FROM user_warnings')
    await components.pg.query('DELETE FROM user_bans')
  })

  describe('when lifting a ban', () => {
    let targetAddress: string

    beforeEach(() => {
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localHttpFetch.fetch(`/v1/moderation/users/${targetAddress}/bans`, {
          method: 'DELETE'
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
            `/v1/moderation/users/${targetAddress}/bans`,
            'DELETE'
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

        describe('and the player has an active ban', () => {
          beforeEach(async () => {
            await makeRequest(moderatorIdentity, `/v1/moderation/users/${targetAddress}/bans`, 'POST', {
              reason: 'Spamming'
            })
          })

          it('should respond with a 204 status code and the ban should no longer be active', async () => {
            const response = await makeRequest(
              moderatorIdentity,
              `/v1/moderation/users/${targetAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(204)

            const statusResponse = await components.localHttpFetch.fetch(
              `/v1/moderation/users/${targetAddress}/bans`,
              { method: 'GET' }
            )
            expect(statusResponse.status).toBe(200)
            const statusBody = await statusResponse.json()
            expect(statusBody.data.isBanned).toBe(false)
          })
        })

        describe('and no active ban exists for the player', () => {
          it('should respond with a 404 and a not found error', async () => {
            const response = await makeRequest(
              moderatorIdentity,
              `/v1/moderation/users/${targetAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(404)
            const body = await response.json()
            expect(body.error).toBe('Not Found')
          })
        })
      })
    })
  })
})
