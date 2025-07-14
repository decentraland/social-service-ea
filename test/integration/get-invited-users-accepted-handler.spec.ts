import { AuthLinkType } from '@dcl/crypto'
import { test } from '../components'
import { createTestIdentity, Identity } from './utils/auth'
import { TestCleanup } from '../db-cleanup'
import { ReferralProgressStatus } from '../../src/types/referral-db.type'
import { makeAuthenticatedRequest } from './utils/auth'
import { generateRandomWalletAddresses } from '../mocks/wallet'

test('GET /v1/referral-progress', ({ components }) => {
  let cleanup: TestCleanup
  const endpoint = '/v1/referral-progress'
  let referrer: Identity
  let newReferrer: Identity
  let invited_user: string
  let invitedUserIP: string
  const makeRequest = makeAuthenticatedRequest(components)

  beforeAll(() => {
    cleanup = new TestCleanup(components.pg)
  })

  beforeEach(async () => {
    invitedUserIP = '192.168.1.1'
    ;[referrer, newReferrer] = await Promise.all([createTestIdentity(), createTestIdentity()])

    invited_user = generateRandomWalletAddresses(1)[0]

    await components.referralDb.createReferral({
      referrer: referrer.realAccount.address.toLowerCase(),
      invitedUser: invited_user.toLowerCase(),
      invitedUserIP
    })
    await components.referralDb.updateReferralProgress(invited_user.toLowerCase(), ReferralProgressStatus.TIER_GRANTED)
    cleanup.trackInsert('referral_progress', {
      referrer: referrer.realAccount.address.toLowerCase(),
      invited_user: invited_user.toLowerCase()
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
          referrer: referrer.realAccount.address.toLowerCase()
        })
      })
      it('should return invited users accepted and viewed counts and update last viewed', async () => {
        const response = await makeRequest(referrer, endpoint, 'GET')

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          invitedUsersAccepted: 1,
          invitedUsersAcceptedViewed: 0,
          rewardImages: []
        })

        const seen = await components.referralDb.getLastViewedProgressByReferrer(
          referrer.realAccount.address.toLowerCase()
        )
        expect(seen).toBe(1)
      })
    })

    describe('when authentication fails', () => {
      it('should return 401 with invalid auth chain', async () => {
        const invalidIdentity: Identity = {
          ...referrer,
          authChain: {
            ...referrer.authChain,
            authChain: [...referrer.authChain.authChain, { type: AuthLinkType.SIGNER, payload: 'invalid-signature' }]
          }
        }
        const response = await makeRequest(invalidIdentity, endpoint, 'GET')

        expect(response.status).toBe(401)
      })
    })

    describe('when referrer has no referrals', () => {
      it('should return 0 counts for new referrer and update last viewed to 0', async () => {
        const response = await makeRequest(newReferrer, endpoint, 'GET')

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          invitedUsersAccepted: 0,
          invitedUsersAcceptedViewed: 0,
          rewardImages: []
        })

        const seen = await components.referralDb.getLastViewedProgressByReferrer(
          newReferrer.realAccount.address.toLowerCase()
        )
        expect(seen).toBe(0)
      })
    })

    describe('when referrer has 5 invited users accepted and a reward assigned', () => {
      let rewardImageUrl: string

      beforeEach(async () => {
        rewardImageUrl = 'https://rewards.decentraland.zone/reward5.png'
        for (let i = 0; i < 4; i++) {
          const invited_user = generateRandomWalletAddresses(1)[0]
          await components.referralDb.createReferral({
            referrer: referrer.realAccount.address.toLowerCase(),
            invitedUser: invited_user.toLowerCase(),
            invitedUserIP
          })
          await components.referralDb.updateReferralProgress(
            invited_user.toLowerCase(),
            ReferralProgressStatus.TIER_GRANTED
          )
          cleanup.trackInsert('referral_progress', {
            referrer: referrer.realAccount.address.toLowerCase(),
            invited_user: invited_user.toLowerCase()
          })
        }
        await components.referralDb.setReferralRewardImage({
          referrer: referrer.realAccount.address.toLowerCase(),
          rewardImageUrl,
          tier: 5
        })
      })

      it('should return 5 accepted, 0 viewed and rewardImages with tier 5', async () => {
        const response = await makeRequest(referrer, endpoint, 'GET')
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          invitedUsersAccepted: 5,
          invitedUsersAcceptedViewed: 0,
          rewardImages: [{ tier: 5, url: rewardImageUrl }]
        })
      })
    })
  })
})
