import {
  referralSuspiciousTimingMessage,
  referralIpMatchRejectionMessage,
  referral100InvitesReachedMessage
} from '../../../src/utils/slackMessages'

describe('slackMessages', () => {
  describe('referralSuspiciousTimingMessage', () => {
    const mockParams = {
      referrer: '0x1234567890123456789012345678901234567890',
      newInvitedUser: '0x0987654321098765432109876543210987654321',
      previousInvitedUser: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      timeDifferenceMins: 2.5,
      newInvitationTime: '2023-12-01T10:05:00.000Z',
      previousInvitationTime: '2023-12-01T10:02:30.000Z',
      referralMetabaseDashboard: 'https://dashboard.decentraland.systems/1234'
    }

    describe('in development environment', () => {
      it('should return correct Slack message structure for dev channel', () => {
        const result = referralSuspiciousTimingMessage(
          mockParams.referrer,
          mockParams.newInvitedUser,
          mockParams.previousInvitedUser,
          mockParams.timeDifferenceMins,
          mockParams.newInvitationTime,
          mockParams.previousInvitationTime,
          true, // isDev
          mockParams.referralMetabaseDashboard
        )

        expect(result).toEqual({
          channel: 'notifications-dev',
          text: '⚠️ Suspicious Referral Timing - Multiple invitations within 5 minutes',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '⚠️ Suspicious Referral Timing',
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*🕒 Rapid Invitations Detected*\n\n*Referrer:* \`${mockParams.referrer}\`\n*Time Between Invitations:* ${mockParams.timeDifferenceMins} minutes`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*📊 Invitation Details:*\n*New Invited User:* \`${mockParams.newInvitedUser}\`\n*Time:* ${mockParams.newInvitationTime}\n\n*Previous Invited User:* \`${mockParams.previousInvitedUser}\`\n*Time:* ${mockParams.previousInvitationTime}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*🔍 Analysis:*\n• Two invitations created within ${mockParams.timeDifferenceMins} minutes\n• Potential automated behavior or coordination\n• May require manual review`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View Referral Dashboard',
                    emoji: true
                  },
                  url: mockParams.referralMetabaseDashboard,
                  style: 'primary'
                }
              ]
            }
          ]
        })
      })
    })

    describe('in production environment', () => {
      it('should return correct Slack message structure for production channel', () => {
        const result = referralSuspiciousTimingMessage(
          mockParams.referrer,
          mockParams.newInvitedUser,
          mockParams.previousInvitedUser,
          mockParams.timeDifferenceMins,
          mockParams.newInvitationTime,
          mockParams.previousInvitationTime,
          false, // isDev
          mockParams.referralMetabaseDashboard
        )

        expect(result.channel).toBe('referral-notifications')
        expect(result.text).toBe('⚠️ Suspicious Referral Timing - Multiple invitations within 5 minutes')
        expect(result.blocks).toHaveLength(5)
      })
    })

    describe('with different time differences', () => {
      it('should handle decimal minutes correctly', () => {
        const result = referralSuspiciousTimingMessage(
          mockParams.referrer,
          mockParams.newInvitedUser,
          mockParams.previousInvitedUser,
          0.25, // 15 seconds
          mockParams.newInvitationTime,
          mockParams.previousInvitationTime,
          true,
          mockParams.referralMetabaseDashboard
        )

        expect(result.blocks[1].text.text).toContain('0.25 minutes')
        expect(result.blocks[3].text.text).toContain('0.25 minutes')
      })

      it('should handle whole number minutes correctly', () => {
        const result = referralSuspiciousTimingMessage(
          mockParams.referrer,
          mockParams.newInvitedUser,
          mockParams.previousInvitedUser,
          4, // 4 minutes
          mockParams.newInvitationTime,
          mockParams.previousInvitationTime,
          true,
          mockParams.referralMetabaseDashboard
        )

        expect(result.blocks[1].text.text).toContain('4 minutes')
        expect(result.blocks[3].text.text).toContain('4 minutes')
      })
    })

    describe('with edge case scenarios', () => {
      it('should handle very short time differences', () => {
        const result = referralSuspiciousTimingMessage(
          mockParams.referrer,
          mockParams.newInvitedUser,
          mockParams.previousInvitedUser,
          0.01, // Less than a second
          mockParams.newInvitationTime,
          mockParams.previousInvitationTime,
          true,
          mockParams.referralMetabaseDashboard
        )

        expect(result.blocks[1].text.text).toContain('0.01 minutes')
      })

      it('should handle maximum time difference (just under 5 minutes)', () => {
        const result = referralSuspiciousTimingMessage(
          mockParams.referrer,
          mockParams.newInvitedUser,
          mockParams.previousInvitedUser,
          4.99,
          mockParams.newInvitationTime,
          mockParams.previousInvitationTime,
          true,
          mockParams.referralMetabaseDashboard
        )

        expect(result.blocks[1].text.text).toContain('4.99 minutes')
      })
    })

    describe('with different user addresses', () => {
      it('should handle different address formats correctly', () => {
        const upperCaseReferrer = '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD'
        const lowerCaseInvited = '0x1234567890123456789012345678901234567890'

        const result = referralSuspiciousTimingMessage(
          upperCaseReferrer,
          lowerCaseInvited,
          mockParams.previousInvitedUser,
          mockParams.timeDifferenceMins,
          mockParams.newInvitationTime,
          mockParams.previousInvitationTime,
          true,
          mockParams.referralMetabaseDashboard
        )

        expect(result.blocks[1].text.text).toContain(upperCaseReferrer)
        expect(result.blocks[2].text.text).toContain(lowerCaseInvited)
      })
    })
  })

  describe('existing message functions integrity', () => {
    describe('referralIpMatchRejectionMessage', () => {
      it('should still work correctly', () => {
        const result = referralIpMatchRejectionMessage(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321',
          '192.168.1.1',
          true,
          'https://dashboard.decentraland.systems/1234'
        )

        expect(result.channel).toBe('notifications-dev')
        expect(result.text).toContain('IP Match Rejection')
        expect(result.blocks).toHaveLength(4)
      })
    })

    describe('referral100InvitesReachedMessage', () => {
      it('should still work correctly', () => {
        const result = referral100InvitesReachedMessage(
          '0x1234567890123456789012345678901234567890',
          true,
          'https://dashboard.decentraland.systems/1234'
        )

        expect(result.channel).toBe('notifications-dev')
        expect(result.text).toContain('100 Invites Tier Achieved')
        expect(result.blocks).toHaveLength(4)
      })
    })
  })
})