import { AuthIdentity, AuthLinkType } from '@dcl/crypto'
import { test } from '../components'
import { createAuthChain, makeRequest } from '../utils'
import { TestCleanup } from '../db-cleanup'

test('POST /v1/referral-progress', ({ components }) => {
  let cleanup: TestCleanup
  const endpoint = '/v1/referral-progress'

  let referrer: AuthIdentity
  let invited_user: AuthIdentity
  let body: {}

  beforeAll(async () => {
    cleanup = new TestCleanup(components.pg)
  })

  beforeEach(async () => {
    referrer = await createAuthChain()
    invited_user = await createAuthChain()
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  describe('when creating a new referral progress entry', () => {
    describe('with valid referral data', () => {
      beforeEach(() => {
        body = {
          referrer: referrer.authChain[0].payload.toLowerCase()
        }
      })
      afterEach(() => {
        cleanup.trackInsert('referral_progress', body)
      })

      it('should create referral and return 204', async () => {
        const { localHttpFetch } = components
        const response = await makeRequest(
          localHttpFetch,
          endpoint,
          {
            method: 'POST',
            body: JSON.stringify(body)
          },
          invited_user
        )

        expect(response.status).toBe(204)
      })

      it('should return 400 when referral progress already exists for the invited user', async () => {
        const { localHttpFetch } = components

        await makeRequest(
          localHttpFetch,
          endpoint,
          {
            method: 'POST',
            body: JSON.stringify(body)
          },
          invited_user
        )

        const response = await makeRequest(
          localHttpFetch,
          endpoint,
          {
            method: 'POST',
            body: JSON.stringify(body)
          },
          invited_user
        )

        expect(response.status).toBe(400)
        const json = await response.json()
        expect(json).toEqual({
          error: 'Bad request',
          message:
            'Referral progress already exists for the invited user: ' + invited_user.authChain[0].payload.toLowerCase()
        })
      })
    })

    describe('when authentication fails', () => {
      beforeEach(() => {
        body = {
          referrer: referrer.authChain[0].payload.toLowerCase()
        }
      })
      it('should return 401 with invalid auth chain', async () => {
        const { localHttpFetch } = components
        const invalidIdentity = {
          ...invited_user,
          authChain: [...invited_user.authChain, { type: AuthLinkType.SIGNER, payload: 'invalid-signature' }]
        }

        const response = await makeRequest(
          localHttpFetch,
          endpoint,
          {
            method: 'POST',
            body: JSON.stringify(body)
          },
          invalidIdentity
        )
        expect(response.status).toBe(401)
      })
    })

    describe('when input validation fails', () => {
      describe('and referrer is missing', () => {
        beforeEach(() => {
          body = {}
        })
        it('should return 400 with message "Missing required field: referrer"', async () => {
          const { localHttpFetch } = components
          const response = await makeRequest(
            localHttpFetch,
            endpoint,
            {
              method: 'POST',
              body: JSON.stringify(body)
            },
            invited_user
          )
          expect(response.status).toBe(400)
          const json = await response.json()
          expect(json).toEqual({
            error: 'Bad request',
            message: 'Missing required field: referrer'
          })
        })
      })

      describe('and referrer is empty', () => {
        beforeEach(() => {
          body = {
            referrer: ''
          }
        })
        it('should return 400 with message "Missing required field: referrer"', async () => {
          const { localHttpFetch } = components
          const response = await makeRequest(
            localHttpFetch,
            endpoint,
            {
              method: 'POST',
              body: JSON.stringify(body)
            },
            invited_user
          )
          expect(response.status).toBe(400)
          const json = await response.json()
          expect(json).toEqual({
            error: 'Bad request',
            message: 'Missing required field: referrer'
          })
        })
      })

      describe('and referrer is not a valid ethereum address', () => {
        beforeEach(() => {
          body = {
            referrer: 'invalid'
          }
        })
        it('should return 400 with message "Invalid referrer address"', async () => {
          const { localHttpFetch } = components
          const response = await makeRequest(
            localHttpFetch,
            endpoint,
            {
              method: 'POST',
              body: JSON.stringify(body)
            },
            invited_user
          )
          expect(response.status).toBe(400)
          const json = await response.json()
          expect(json).toEqual({
            error: 'Bad request',
            message: 'Invalid referrer address'
          })
        })
      })

      describe('and JSON body is invalid', () => {
        it('should return 400 with message "Invalid JSON body"', async () => {
          const { localHttpFetch } = components
          const response = await makeRequest(
            localHttpFetch,
            endpoint,
            {
              method: 'POST',
              body: 'invalid-json{'
            },
            invited_user
          )
          expect(response.status).toBe(400)
          const json = await response.json()
          expect(json).toEqual({
            error: 'Bad request',
            message: 'Invalid JSON body'
          })
        })
      })
    })
  })
})
