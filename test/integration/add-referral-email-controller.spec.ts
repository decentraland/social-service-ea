import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { TestCleanup } from '../db-cleanup'
import { ReferralProgressStatus } from '../../src/types/referral-db.type'

test('POST /v1/referral-email', function ({ components }) {
  let cleanup: TestCleanup

  beforeAll(async () => {
    cleanup = new TestCleanup(components.pg)
  })

  describe('when setting a referral email', () => {
    let identity: Identity
    let userAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      userAddress = identity.realAccount.address.toLowerCase()
    })

    afterEach(async () => {
      await cleanup.cleanup()
    })

    describe('and the request is not signed', () => {
      let validEmail: string

      beforeEach(() => {
        validEmail = 'test@example.com'
      })

      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch('/v1/referral-email', {
          method: 'POST',
          body: JSON.stringify({ email: validEmail })
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the email is valid', () => {
        let validEmail: string

        beforeEach(async () => {
          validEmail = 'test@example.com'

          // Setup: Create enough accepted invites for the user to be able to set email
          for (let i = 0; i < 100; i++) {
            const invitedUser = `0x${i.toString().padStart(40, '0')}`
            await components.referralDb.createReferral({
              referrer: userAddress,
              invitedUser,
              invitedUserIP: '127.0.0.1'
            })
            await components.referralDb.updateReferralProgress(invitedUser, ReferralProgressStatus.TIER_GRANTED)
          }
        })

        it('should return 204', async () => {
          const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
            email: validEmail
          })
          expect(response.status).toBe(204)
        })
      })

      describe('and the email contains spaces', () => {
        it('should return 204', async () => {
          const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
            email: '  test@example.com  '
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the email is missing', () => {
        it('should return 400', async () => {
          const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {})
          expect(response.status).toBe(400)
        })
      })

      describe('and the email is null', () => {
        it('should return 400', async () => {
          const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
            email: null
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the email is empty string', () => {
        it('should return 400', async () => {
          const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
            email: ''
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the email is only whitespace', () => {
        it('should return 400', async () => {
          const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
            email: '   '
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the email has invalid format', () => {
        let invalidEmail: string

        beforeEach(() => {
          invalidEmail = 'invalid-email'
        })

        it('should return 400', async () => {
          const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
            email: invalidEmail
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the user has insufficient accepted invites', () => {
        let testEmail: string

        beforeEach(() => {
          testEmail = 'test@example.com'
        })

        describe('when user has less than 100 accepted invites', () => {
          it('should respond with a 400 status and insufficient invites error message', async () => {
            const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
              email: testEmail
            })

            expect(response.status).toBe(400)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Bad request',
              message: 'You must have at least 100 accepted invites to set an email'
            })
          })
        })
      })

      describe('and the email validation fails in business logic', () => {
        describe('and the email has dangerous characters', () => {
          it('should return 400 for email with script tags', async () => {
            const maliciousEmail = 'foo`\'"</title/</script/--!><script/src=//pwn.gs></script>@bar.com'
            const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
              email: maliciousEmail
            })
            expect(response.status).toBe(400)
          })

          it('should return 400 for email with SQL injection patterns', async () => {
            const maliciousEmail = 'foo@bar.com\'"'
            const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
              email: maliciousEmail
            })
            expect(response.status).toBe(400)
          })

          it('should return 400 for email with HTML entities', async () => {
            const maliciousEmail = 'foo&lt;script&gt;@bar.com'
            const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
              email: maliciousEmail
            })
            expect(response.status).toBe(400)
          })

          it('should return 400 for email with JavaScript events', async () => {
            const maliciousEmail = 'foo"onload="alert(1)"@bar.com'
            const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
              email: maliciousEmail
            })
            expect(response.status).toBe(400)
          })
        })

        describe('and the email is too long', () => {
          beforeEach(async () => {
            // Setup: Create enough accepted invites for the user to be able to set email
            for (let i = 0; i < 100; i++) {
              const invitedUser = `0x${i.toString().padStart(40, '0')}`
              await components.referralDb.createReferral({
                referrer: userAddress,
                invitedUser,
                invitedUserIP: '127.0.0.1'
              })
              await components.referralDb.updateReferralProgress(invitedUser, ReferralProgressStatus.TIER_GRANTED)
            }
          })

          it('should return 400', async () => {
            const longEmail = 'a'.repeat(250) + '@example.com'
            const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
              email: longEmail
            })
            expect(response.status).toBe(400)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Bad request',
              message: 'Email is too long'
            })
          })
        })
      })

      describe('and the email is not a string', () => {
        it('should return 400', async () => {
          const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
            email: 123
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the email is an array', () => {
        it('should return 400', async () => {
          const response = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
            email: ['test@example.com']
          })
          expect(response.status).toBe(400)
        })
      })

      describe('and the same email is set multiple times', () => {
        let validEmail: string

        beforeEach(async () => {
          validEmail = 'test@example.com'

          // Setup: Create enough accepted invites for the user to be able to set email
          for (let i = 0; i < 100; i++) {
            const invitedUser = `0x${i.toString().padStart(40, '0')}`
            await components.referralDb.createReferral({
              referrer: userAddress,
              invitedUser,
              invitedUserIP: '127.0.0.1'
            })
            await components.referralDb.updateReferralProgress(invitedUser, ReferralProgressStatus.TIER_GRANTED)
          }
        })

        describe('and trying to update email within 24 hours', () => {
          it('should return 400', async () => {
            const response1 = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
              email: validEmail
            })
            expect(response1.status).toBe(204)

            const response2 = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
              email: 'newemail@example.com'
            })
            expect(response2.status).toBe(400)
            const body = await response2.json()
            expect(body).toEqual({
              error: 'Bad request',
              message: `Email can only be updated once per day. Last update was less than 24 hours ago for user: ${userAddress}`
            })
          })
        })

        describe('and setting the same email for different users', () => {
          let identity2: Identity
          let userAddress2: string

          beforeEach(async () => {
            identity2 = await createTestIdentity()
            userAddress2 = identity2.realAccount.address.toLowerCase()

            // Setup: Create enough accepted invites for the second user
            for (let i = 100; i < 200; i++) {
              const invitedUser = `0x${i.toString().padStart(40, '0')}`
              await components.referralDb.createReferral({
                referrer: userAddress2,
                invitedUser,
                invitedUserIP: '127.0.0.1'
              })
              await components.referralDb.updateReferralProgress(invitedUser, ReferralProgressStatus.TIER_GRANTED)
            }
          })

          it('should return 204 for both users', async () => {
            const response1 = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
              email: validEmail
            })
            expect(response1.status).toBe(204)

            const response2 = await makeAuthenticatedRequest(components)(identity2, '/v1/referral-email', 'POST', {
              email: validEmail
            })
            expect(response2.status).toBe(204)
          })
        })
      })

      describe('and different users set emails', () => {
        let validEmail: string
        let email2: string
        let identity2: Identity
        let userAddress2: string

        beforeEach(async () => {
          validEmail = 'test@example.com'
          email2 = 'user2@example.com'
          identity2 = await createTestIdentity()
          userAddress2 = identity2.realAccount.address.toLowerCase()

          // Setup: Create enough accepted invites for the user to be able to set email
          for (let i = 0; i < 100; i++) {
            const invitedUser = `0x${i.toString().padStart(40, '0')}`
            await components.referralDb.createReferral({
              referrer: userAddress,
              invitedUser,
              invitedUserIP: '127.0.0.1'
            })
            await components.referralDb.updateReferralProgress(invitedUser, ReferralProgressStatus.TIER_GRANTED)
          }

          // Setup: Create enough accepted invites for the second user
          for (let i = 200; i < 300; i++) {
            const invitedUser = `0x${i.toString().padStart(40, '0')}`
            await components.referralDb.createReferral({
              referrer: userAddress2,
              invitedUser,
              invitedUserIP: '127.0.0.1'
            })
            await components.referralDb.updateReferralProgress(invitedUser, ReferralProgressStatus.TIER_GRANTED)
          }
        })

        it('should return 204 for both users', async () => {
          const response1 = await makeAuthenticatedRequest(components)(identity, '/v1/referral-email', 'POST', {
            email: validEmail
          })
          expect(response1.status).toBe(204)

          const response2 = await makeAuthenticatedRequest(components)(identity2, '/v1/referral-email', 'POST', {
            email: email2
          })
          expect(response2.status).toBe(204)
        })
      })
    })
  })
})
