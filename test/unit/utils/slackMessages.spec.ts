import { referral100InvitesReachedMessage, referralIpMatchRejectionMessage } from '../../../src/utils/slackMessages'

describe('when referral100InvitesReachedMessage is called', () => {
  let referrer: string
  let isDev: boolean
  let referralMetabaseDashboard: string

  beforeEach(() => {
    referrer = '0x123456789abcdef'
    isDev = false
    referralMetabaseDashboard = 'https://metabase.example.com/dashboard'
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and isDev is false', () => {
    it('should return complete message with production channel and all blocks correctly structured', () => {
      const result = referral100InvitesReachedMessage(referrer, isDev, referralMetabaseDashboard)

      expect(result.channel).toBe('referral-notifications')
      expect(result.text).toBe(`🎉 Referral Milestone Reached! - 100 Invites Tier Achieved by referrer ${referrer}`)
      expect(result.blocks).toHaveLength(4)

      const headerBlock = result.blocks[0]
      expect(headerBlock.type).toBe('header')
      expect(headerBlock.text.type).toBe('plain_text')
      expect(headerBlock.text.text).toBe('🎉 Referral Milestone Reached!')
      expect(headerBlock.text.emoji).toBe(true)

      const sectionBlock = result.blocks[1]
      expect(sectionBlock.type).toBe('section')
      expect(sectionBlock.text.type).toBe('mrkdwn')
      expect(sectionBlock.text.text).toBe(`*🎯 100 Invites Tier Achieved!*\n\n*Referrer Wallet:* \`${referrer}\``)

      const detailsBlock = result.blocks[2]
      expect(detailsBlock.type).toBe('section')
      expect(detailsBlock.text.type).toBe('mrkdwn')
      expect(detailsBlock.text.text).toContain('Referrer has successfully invited 100 users')
      expect(detailsBlock.text.text).toContain('Monitor for email submission from referrer')

      const actionBlock = result.blocks[3]
      expect(actionBlock.type).toBe('actions')
      expect(actionBlock.elements).toHaveLength(1)

      const button = actionBlock.elements[0]
      expect(button.type).toBe('button')
      expect(button.text.text).toBe('View Referral Dashboard')
      expect(button.url).toBe(referralMetabaseDashboard)
      expect(button.style).toBe('primary')
    })
  })

  describe('and isDev is true', () => {
    beforeEach(() => {
      isDev = true
    })

    it('should return message with development channel', () => {
      const result = referral100InvitesReachedMessage(referrer, isDev, referralMetabaseDashboard)

      expect(result.channel).toBe('notifications-dev')
    })
  })
})

describe('when referralIpMatchRejectionMessage is called', () => {
  let referrer: string
  let invitedUser: string
  let invitedUserIP: string
  let isDev: boolean
  let referralMetabaseDashboard: string

  beforeEach(() => {
    referrer = '0x123456789abcdef'
    invitedUser = '0xabcdef123456789'
    invitedUserIP = '192.168.1.100'
    isDev = false
    referralMetabaseDashboard = 'https://metabase.example.com/dashboard'
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and isDev is false', () => {
    beforeEach(() => {
      isDev = false
    })

    it('should return complete message with production channel and all blocks correctly structured', () => {
      const result = referralIpMatchRejectionMessage(
        referrer,
        invitedUser,
        invitedUserIP,
        isDev,
        referralMetabaseDashboard
      )

      expect(result.channel).toBe('referral-notifications')
      expect(result.text).toBe('🚨 IP Match Rejection - Referral blocked due to IP limit exceeded')
      expect(result.blocks).toHaveLength(4)

      const headerBlock = result.blocks[0]
      expect(headerBlock.type).toBe('header')
      expect(headerBlock.text.type).toBe('plain_text')
      expect(headerBlock.text.text).toBe('🚨 IP Match Rejection Detected')
      expect(headerBlock.text.emoji).toBe(true)

      const sectionBlock = result.blocks[1]
      expect(sectionBlock.type).toBe('section')
      expect(sectionBlock.text.type).toBe('mrkdwn')
      expect(sectionBlock.text.text).toBe(
        `*⚠️ Suspicious Activity Detected*\n\n*Invited User:* \`${invitedUser}\`\n*IP Address:* \`${invitedUserIP}\`\n*Referrer:* \`${referrer}\``
      )

      const detailsBlock = result.blocks[2]
      expect(detailsBlock.type).toBe('section')
      expect(detailsBlock.text.type).toBe('mrkdwn')
      expect(detailsBlock.text.text).toContain('IP address has reached maximum of')
      expect(detailsBlock.text.text).toContain('Potential abuse or automated system detected')
      expect(detailsBlock.text.text).toContain('Review IP address activity')

      const actionBlock = result.blocks[3]
      expect(actionBlock.type).toBe('actions')
      expect(actionBlock.elements).toHaveLength(1)

      const button = actionBlock.elements[0]
      expect(button.type).toBe('button')
      expect(button.text.text).toBe('View Referral Dashboard')
      expect(button.url).toBe(referralMetabaseDashboard)
      expect(button.style).toBe('danger')
    })
  })

  describe('and isDev is true', () => {
    beforeEach(() => {
      isDev = true
    })

    it('should return message with development channel', () => {
      const result = referralIpMatchRejectionMessage(
        referrer,
        invitedUser,
        invitedUserIP,
        isDev,
        referralMetabaseDashboard
      )

      expect(result.channel).toBe('notifications-dev')
    })
  })
})
