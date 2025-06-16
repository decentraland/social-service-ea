import { test } from '../components'
import { TestCleanup } from '../db-cleanup'
import { ReferralProgressStatus } from '../../src/types/referral-db.type'
import { createAuthChain, makeRequest } from '../utils'
import { AuthIdentity, AuthLinkType } from '@dcl/crypto'

test('PATCH /v1/referral-progress', ({ components }) => {
  let cleanup: TestCleanup
  const endpoint = '/v1/referral-progress'
  let invitedUserIdentity: AuthIdentity
  let referrerIdentity: AuthIdentity
  let invitedUserAddress: string
  let referrerAddress: string
  let nonExistentUserIdentity: AuthIdentity
  let nonExistentUserAddress: string

  beforeAll(async () => {
    cleanup = new TestCleanup(components.pg)
    invitedUserIdentity = await createAuthChain()
    invitedUserAddress = invitedUserIdentity.authChain[0].payload.toLowerCase()
    referrerIdentity = await createAuthChain()
    referrerAddress = referrerIdentity.authChain[0].payload.toLowerCase()
    nonExistentUserIdentity = await createAuthChain()
    nonExistentUserAddress = nonExistentUserIdentity.authChain[0].payload.toLowerCase()
  })

  beforeEach(async () => {
    await components.referralDb.createReferral({
      referrer: referrerAddress,
      invitedUser: invitedUserAddress
    })
    cleanup.trackInsert('referral_progress', {
      referrer: referrerAddress,
      invited_user: invitedUserAddress
    })
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  describe('when updating a referral as signed up', () => {
    describe('with valid identity', () => {
      it('should update referral progress as signed up and return 204', async () => {
        const { localHttpFetch } = components

        const response = await makeRequest(
          localHttpFetch,
          endpoint,
          {
            method: 'PATCH'
          },
          invitedUserIdentity
        )
        expect(response.status).toBe(204)

        const progress = await components.referralDb.findReferralProgress({ invitedUser: invitedUserAddress })
        expect(progress[0]).toHaveProperty('referrer', referrerAddress)
        expect(progress[0]).toHaveProperty('invited_user', invitedUserAddress)
        expect(progress[0]).toHaveProperty('status', ReferralProgressStatus.SIGNED_UP)
        expect(progress[0]).toHaveProperty('signed_up_at')
      })
    })

    describe('and authentication fails', () => {
      it('should return 401 with invalid auth chain', async () => {
        const { localHttpFetch } = components
        const invalidIdentity = {
          ...invitedUserIdentity,
          authChain: [...invitedUserIdentity.authChain, { type: AuthLinkType.SIGNER, payload: 'invalid-signature' }]
        }

        const response = await makeRequest(
          localHttpFetch,
          endpoint,
          {
            method: 'PATCH'
          },
          invalidIdentity
        )
        expect(response.status).toBe(401)
      })
    })

    describe('and referral does not exist', () => {
      it('should return 404 with message "No referral progress found for the invited user"', async () => {
        const { localHttpFetch } = components
        const response = await makeRequest(
          localHttpFetch,
          endpoint,
          {
            method: 'PATCH'
          },
          nonExistentUserIdentity
        )
        expect(response.status).toBe(404)
        const json = await response.json()
        expect(json).toEqual({
          error: 'Not found',
          message: 'Referral progress not found for user: ' + nonExistentUserAddress
        })
      })
    })

    describe('and referral is already signed up', () => {
      beforeEach(async () => {
        await components.referralDb.updateReferralProgress(invitedUserAddress, ReferralProgressStatus.SIGNED_UP)
      })

      it('should return 400 with message "Invalid referral status"', async () => {
        const { localHttpFetch } = components
        const response = await makeRequest(
          localHttpFetch,
          endpoint,
          {
            method: 'PATCH'
          },
          invitedUserIdentity
        )
        expect(response.status).toBe(400)
        const json = await response.json()
        expect(json).toEqual({
          error: 'Bad request',
          message: 'Invalid referral status: signed_up. Expected: pending'
        })
      })
    })
  })
})
