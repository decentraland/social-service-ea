import { AuthLinkType } from '@dcl/crypto'
import { test } from '../components'
import { createTestIdentity, Identity, createAuthHeaders } from './utils/auth'
import { TestCleanup } from '../db-cleanup'
import { makeAuthenticatedRequest } from './utils/auth'

test('POST /v1/referral-progress', ({ components, spyComponents }) => {
  const makeRequest = makeAuthenticatedRequest(components)
  let cleanup: TestCleanup
  const endpoint = '/v1/referral-progress'

  let referrer: Identity
  let invited_user: Identity
  let body: {}

  beforeAll(async () => {
    cleanup = new TestCleanup(components.pg)
  })

  beforeEach(async () => {
    referrer = await createTestIdentity()
    invited_user = await createTestIdentity()
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  describe('when referral registration is disabled by the kill switch', () => {
    beforeEach(() => {
      body = {
        referrer: referrer.realAccount.address.toLowerCase()
      }
      spyComponents.featureFlags.isEnabled.mockReturnValue(true)
    })

    it('should reject the create with 503 and register nothing', async () => {
      const response = await makeRequest(invited_user, endpoint, 'POST', body)

      expect(response.status).toBe(503)
      const json = await response.json()
      expect(json).toEqual({
        error: 'Service Unavailable',
        message: 'Referral registration is temporarily disabled'
      })
    })
  })

  describe('when creating a new referral progress entry', () => {
    describe('with valid referral data', () => {
      beforeEach(() => {
        body = {
          referrer: referrer.realAccount.address.toLowerCase()
        }
      })

      afterEach(async () => {
        await cleanup.trackInsert('referral_progress', body)
      })

      it('should create referral and return 204', async () => {
        const response = await makeRequest(invited_user, endpoint, 'POST', body)

        expect(response.status).toBe(204)
      })
    })

    describe('when referral progress already exists for the invited user', () => {
      afterEach(async () => {
        await cleanup.trackInsert('referral_progress', { referrer: referrer.realAccount.address.toLowerCase() })
      })

      describe('and the second create uses the same referrer', () => {
        beforeEach(() => {
          body = {
            referrer: referrer.realAccount.address.toLowerCase()
          }
        })

        it('should be idempotent and return 204', async () => {
          await makeRequest(invited_user, endpoint, 'POST', body)

          const response = await makeRequest(invited_user, endpoint, 'POST', body)

          expect(response.status).toBe(204)
        })
      })

      describe('and the second create uses a different referrer', () => {
        let otherReferrer: Identity

        beforeEach(async () => {
          otherReferrer = await createTestIdentity()
          body = {
            referrer: referrer.realAccount.address.toLowerCase()
          }
        })

        it('should return 400 with referral progress already exists error', async () => {
          await makeRequest(invited_user, endpoint, 'POST', body)

          const response = await makeRequest(invited_user, endpoint, 'POST', {
            referrer: otherReferrer.realAccount.address.toLowerCase()
          })

          expect(response.status).toBe(400)
          const json = await response.json()
          expect(json).toEqual({
            error: 'Bad request',
            message:
              'Referral progress already exists for the invited user: ' + invited_user.realAccount.address.toLowerCase()
          })
        })
      })
    })

    describe('when input validation fails', () => {
      describe('with missing referrer', () => {
        beforeEach(() => {
          body = {}
        })

        it('should return 400 with message "Missing required field: referrer"', async () => {
          const response = await makeRequest(invited_user, endpoint, 'POST', body)
          expect(response.status).toBe(400)
        })
      })

      describe('with empty referrer', () => {
        beforeEach(() => {
          body = {
            referrer: ''
          }
        })

        it('should return 400 with message "Missing required field: referrer"', async () => {
          const response = await makeRequest(invited_user, endpoint, 'POST', body)
          expect(response.status).toBe(400)
        })
      })

      describe('with invalid ethereum address', () => {
        beforeEach(() => {
          body = {
            referrer: 'invalid'
          }
        })

        it('should return 400 with message "Invalid referrer address"', async () => {
          const response = await makeRequest(invited_user, endpoint, 'POST', body)
          expect(response.status).toBe(400)
          const json = await response.json()
          expect(json).toEqual({
            error: 'Bad request',
            message: 'Invalid referrer address'
          })
        })
      })

      describe('with invalid JSON body', () => {
        it('should return 400 with message "Invalid JSON body"', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...createAuthHeaders('POST', endpoint, {}, invited_user)
            },
            body: '{"referrer": "0x123", "invalid":}'
          })
          expect(response.status).toBe(400)
        })
      })
    })

    describe('when authentication fails', () => {
      beforeEach(() => {
        body = {
          referrer: referrer.realAccount.address.toLowerCase()
        }
      })

      it('should return 401 with invalid auth chain', async () => {
        const invalidIdentity: Identity = {
          ...invited_user,
          authChain: {
            ...invited_user.authChain,
            authChain: [
              ...invited_user.authChain.authChain,
              { type: AuthLinkType.SIGNER, payload: 'invalid-signature' }
            ]
          }
        }

        const response = await makeRequest(invalidIdentity, endpoint, 'POST', body)
        expect(response.status).toBe(401)
      })
    })
  })
})
