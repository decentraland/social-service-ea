import { AuthIdentity, AuthLinkType } from '@dcl/crypto'
import { test } from '../components'
import { createAuthChain, makeRequest } from '../utils'
import { TestCleanup } from '../db-cleanup'
import { ReferralProgressStatus } from '../../src/types/referral-db.type'

test('GET /v1/referral-progress', ({ components }) => {
  let cleanup: TestCleanup
  const endpoint = '/v1/referral-progress'
  let referrer: AuthIdentity
  let invited_user: AuthIdentity
  let newReferrer: AuthIdentity

  beforeAll(async () => {
    cleanup = new TestCleanup(components.pg)
  })

  beforeEach(async () => {
    referrer = await createAuthChain()
    invited_user = await createAuthChain()
    newReferrer = await createAuthChain()

    await components.referralDb.createReferral({
      referrer: referrer.authChain[0].payload.toLowerCase(),
      invited_user: invited_user.authChain[0].payload.toLowerCase()
    })
    await components.referralDb.updateReferralProgress(
      invited_user.authChain[0].payload.toLowerCase(),
      ReferralProgressStatus.TIER_GRANTED
    )
    cleanup.trackInsert('referral_progress', {
      referrer: referrer.authChain[0].payload.toLowerCase(),
      invited_user: invited_user.authChain[0].payload.toLowerCase()
    })
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  describe('when getting invited users accepted', () => {
    describe('with valid authentication and referrer', () => {
      beforeEach(async () => {
        cleanup.trackInsert('referral_progress_viewed', {
          referrer: referrer.authChain[0].payload.toLowerCase()
        })
      })
      it('should return invited users accepted and viewed counts and update last viewed', async () => {
        const { localHttpFetch } = components
        const response = await makeRequest(
          localHttpFetch,
          endpoint,
          {
            method: 'GET'
          },
          referrer
        )

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          invitedUsersAccepted: 1,
          invitedUsersAcceptedViewed: 0
        })

        const seen = await components.referralDb.getLastViewedProgressByReferrer(
          referrer.authChain[0].payload.toLowerCase()
        )
        expect(seen).toBe(1)
      })
    })

    describe('when authentication fails', () => {
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
            method: 'GET'
          },
          invalidIdentity
        )

        expect(response.status).toBe(401)
      })
    })

    describe('when referrer has no referrals', () => {
      it('should return 0 counts for new referrer and update last viewed to 0', async () => {
        const { localHttpFetch } = components
        const response = await makeRequest(
          localHttpFetch,
          endpoint,
          {
            method: 'GET'
          },
          newReferrer
        )

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          invitedUsersAccepted: 0,
          invitedUsersAcceptedViewed: 0
        })

        const seen = await components.referralDb.getLastViewedProgressByReferrer(
          newReferrer.authChain[0].payload.toLowerCase()
        )
        expect(seen).toBe(0)
      })
    })
  })
})
