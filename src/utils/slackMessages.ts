const referral100InvitesReachedMessage = (referrer: string, isDev: boolean, referralMetabaseDashboard: string) => {
  return {
    channel: isDev ? 'notifications-dev' : 'referral-notifications',
    text: `🎉 Referral Milestone Reached! - 100 Invites Tier Achieved by referrer ${referrer}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎉 Referral Milestone Reached!',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🎯 100 Invites Tier Achieved!*\n\n*Referrer Wallet:* \`${referrer}\``
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📊 Details:*\n• Referrer has successfully invited 100 users\n• Tier milestone unlocked\n• Ready for outreach and communication\n\n*💬 Next Steps:*\n• Monitor for email submission from referrer`
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
            url: referralMetabaseDashboard,
            style: 'primary'
          }
        ]
      }
    ]
  }
}

const referralIpMatchRejectionMessage = (
  referrer: string,
  invitedUser: string,
  invitedUserIP: string,
  isDev: boolean,
  referralMetabaseDashboard: string,
  maxIpMatches: number
) => {
  return {
    channel: isDev ? 'notifications-dev' : 'referral-notifications',
    text: `🚨 IP Match Rejection - Referral blocked due to IP limit exceeded`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 IP Match Rejection Detected',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*⚠️ Suspicious Activity Detected*\n\n*Invited User:* \`${invitedUser}\`\n*IP Address:* \`${invitedUserIP}\`\n*Referrer:* \`${referrer}\``
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📊 Details:*\n• IP address has reached maximum of ${maxIpMatches} referrals\n• Potential abuse or automated system detected\n• Referral automatically rejected\n\n*🔍 Next Steps:*\n• Monitor for similar patterns\n• Review IP address activity`
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
            url: referralMetabaseDashboard,
            style: 'danger'
          }
        ]
      }
    ]
  }
}

const referralSuspiciousTimingMessage = (
  referrer: string,
  newInvitedUser: string,
  previousInvitedUser: string,
  timeDifferenceMins: number,
  newInvitationTime: string,
  previousInvitationTime: string,
  isDev: boolean,
  referralMetabaseDashboard: string
) => {
  return {
    channel: isDev ? 'notifications-dev' : 'referral-notifications',
    text: `⚠️ Suspicious Referral Timing - Multiple invitations within 5 minutes`,
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
          text: `*🕒 Rapid Invitations Detected*\n\n*Referrer:* \`${referrer}\`\n*Time Between Invitations:* ${timeDifferenceMins} minutes`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📊 Invitation Details:*\n*New Invited User:* \`${newInvitedUser}\`\n*Time:* ${newInvitationTime}\n\n*Previous Invited User:* \`${previousInvitedUser}\`\n*Time:* ${previousInvitationTime}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🔍 Analysis:*\n• Two invitations created within ${timeDifferenceMins} minutes\n• Potential automated behavior or coordination\n• May require manual review`
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
            url: referralMetabaseDashboard,
            style: 'primary'
          }
        ]
      }
    ]
  }
}

export { referral100InvitesReachedMessage, referralIpMatchRejectionMessage, referralSuspiciousTimingMessage }
