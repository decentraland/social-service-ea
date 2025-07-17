import { test } from '../components'
import { TestCleanup } from '../db-cleanup'
import { ReferralProgressStatus } from '../../src/types/referral-db.type'
import { createTestIdentity, Identity } from './utils/auth'
import { AuthLinkType } from '@dcl/crypto'
import { makeAuthenticatedRequest } from './utils/auth'

test('PATCH /v1/referral-progress', ({ components }) => {
  let cleanup: TestCleanup
  const endpoint = '/v1/referral-progress'
  let invitedUserIdentity: Identity
  let referrerIdentity: Identity
  let invitedUserAddress: string
  let referrerAddress: string
  let nonExistentUserIdentity: Identity
  let nonExistentUserAddress: string
  let invitedUserIP: string
  const makeRequest = makeAuthenticatedRequest(components)

  beforeAll(async () => {
    cleanup = new TestCleanup(components.pg)
    invitedUserIdentity = await createTestIdentity()
    invitedUserAddress = invitedUserIdentity.realAccount.address.toLowerCase()
    referrerIdentity = await createTestIdentity()
    referrerAddress = referrerIdentity.realAccount.address.toLowerCase()
    nonExistentUserIdentity = await createTestIdentity()
    nonExistentUserAddress = nonExistentUserIdentity.realAccount.address.toLowerCase()
  })

  beforeEach(async () => {
    invitedUserIP = '192.168.1.1'
    await components.referralDb.createReferral({
      referrer: referrerAddress,
      invitedUser: invitedUserAddress,
      invitedUserIP
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
        const response = await makeRequest(invitedUserIdentity, endpoint, 'PATCH')
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
        const invalidIdentity: Identity = {
          ...invitedUserIdentity,
          authChain: {
            ...invitedUserIdentity.authChain,
            authChain: [
              ...invitedUserIdentity.authChain.authChain,
              { type: AuthLinkType.SIGNER, payload: 'invalid-signature' }
            ]
          }
        }

        const response = await makeRequest(invalidIdentity, endpoint, 'PATCH')
        expect(response.status).toBe(401)
      })
    })

    describe('and referral does not exist', () => {
      it('should return 404 with message "No referral progress found for the invited user"', async () => {
        const response = await makeRequest(nonExistentUserIdentity, endpoint, 'PATCH')
        expect(response.status).toBe(404)
        const json = await response.json()
        expect(json).toEqual({
          error: 'Not Found',
          message: 'Referral progress not found for user: ' + nonExistentUserAddress
        })
      })
    })

    describe('and referral is already signed up', () => {
      beforeEach(async () => {
        await components.referralDb.updateReferralProgress(invitedUserAddress, ReferralProgressStatus.SIGNED_UP)
      })

      it('should return 400 with message "Invalid referral status"', async () => {
        const response = await makeRequest(invitedUserIdentity, endpoint, 'PATCH')
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
