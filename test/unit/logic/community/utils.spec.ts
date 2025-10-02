import { CommunityRole } from '../../../../src/types'
import {
  toCommunityWithUserInformationAndVoiceChat,
  CommunityPrivacyEnum,
  AggregatedCommunityWithMemberAndFriendsData,
  CommunityVoiceChatStatus
} from '../../../../src/logic/community'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { createMockProfile } from '../../../mocks/profile'

describe('Community Utils', () => {
  describe('toCommunityWithUserInformationAndVoiceChat', () => {
    const mockCommunity: AggregatedCommunityWithMemberAndFriendsData = {
      id: 'test-community-id',
      name: 'Test Community',
      description: 'Test Description',
      ownerAddress: '0xowner',
      privacy: CommunityPrivacyEnum.Public,
      active: true,
      ownerName: 'Test Owner',
      isHostingLiveEvent: false,
      role: CommunityRole.Member,
      membersCount: 10,
      friends: ['0xfriend1', '0xfriend2']
    }

    const mockVoiceChatStatus: CommunityVoiceChatStatus = {
      isActive: true,
      participantCount: 5,
      moderatorCount: 2
    }

    const profilesMap = new Map<string, Profile>([
      ['0xfriend1', createMockProfile('0xfriend1')],
      ['0xfriend2', createMockProfile('0xfriend2')]
    ])

    describe('when community is public', () => {
      describe('and the user is a member', () => {
        it('should include voiceChatStatus', () => {
          const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Public, role: CommunityRole.Member }
          const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, mockVoiceChatStatus)

          expect(result.voiceChatStatus).toEqual(mockVoiceChatStatus)
        })
      })

      describe('and the user is not a member', () => {
        it('should include voiceChatStatus', () => {
          const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Public, role: CommunityRole.None }
          const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, mockVoiceChatStatus)

          expect(result.voiceChatStatus).toEqual(mockVoiceChatStatus)
        })
      })

      describe('and the user is a moderator', () => {
        it('should include voiceChatStatus', () => {
          const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Public, role: CommunityRole.Moderator }
          const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, mockVoiceChatStatus)

          expect(result.voiceChatStatus).toEqual(mockVoiceChatStatus)
        })
      })

      describe('and the user is an owner', () => {
        it('should include voiceChatStatus', () => {
          const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Public, role: CommunityRole.Owner }
          const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, mockVoiceChatStatus)

          expect(result.voiceChatStatus).toEqual(mockVoiceChatStatus)
        })
      })
    })

    describe('when community is private', () => {
      describe('and the user is a member', () => {
        it('should include voiceChatStatus', () => {
          const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Private, role: CommunityRole.Member }
          const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, mockVoiceChatStatus)

          expect(result.voiceChatStatus).toEqual(mockVoiceChatStatus)
        })
      })

      describe('and the user is a moderator', () => {
        it('should include voiceChatStatus', () => {
          const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Private, role: CommunityRole.Moderator }
          const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, mockVoiceChatStatus)

          expect(result.voiceChatStatus).toEqual(mockVoiceChatStatus)
        })
      })

      describe('and the user is an owner', () => {
        it('should include voiceChatStatus', () => {
          const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Private, role: CommunityRole.Owner }
          const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, mockVoiceChatStatus)

          expect(result.voiceChatStatus).toEqual(mockVoiceChatStatus)
        })
      })

      describe('and the user is not a member', () => {
        it('should NOT include voiceChatStatus', () => {
          const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Private, role: CommunityRole.None }
          const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, mockVoiceChatStatus)

          expect(result.voiceChatStatus).toEqual({
            isActive: false,
            participantCount: 0,
            moderatorCount: 0
          })
        })

        it('should return null voiceChatStatus even when status is null', () => {
          const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Private, role: CommunityRole.None }
          const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, null)

          expect(result.voiceChatStatus).toEqual({
            isActive: false,
            participantCount: 0,
            moderatorCount: 0
          })
        })
      })
    })

    describe('when voiceChatStatus is null', () => {
      describe('and community is public', () => {
        it('should return null voiceChatStatus', () => {
          const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Public, role: CommunityRole.None }
          const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, null)

          expect(result.voiceChatStatus).toEqual({
            isActive: false,
            participantCount: 0,
            moderatorCount: 0
          })
        })
      })

      describe('and community is private', () => {
        describe('and the user is a member', () => {
          it('should return null voiceChatStatus', () => {
            const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Private, role: CommunityRole.Member }
            const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, null)

            expect(result.voiceChatStatus).toEqual({
              isActive: false,
              participantCount: 0,
              moderatorCount: 0
            })
          })
        })

        describe('and the user is not a member', () => {
          it('should return null voiceChatStatus', () => {
            const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Private, role: CommunityRole.None }
            const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, null)

            expect(result.voiceChatStatus).toEqual({
              isActive: false,
              participantCount: 0,
              moderatorCount: 0
            })
          })
        })
      })
    })

    describe('when checking all data is properly returned', () => {
      it('should return all community data with friends and voiceChatStatus', () => {
        const community = { ...mockCommunity, privacy: CommunityPrivacyEnum.Public, role: CommunityRole.Member }
        const result = toCommunityWithUserInformationAndVoiceChat(community, profilesMap, mockVoiceChatStatus)

        expect(result).toEqual(
          expect.objectContaining({
            id: 'test-community-id',
            name: 'Test Community',
            description: 'Test Description',
            ownerAddress: '0xowner',
            privacy: CommunityPrivacyEnum.Public,
            active: true,
            ownerName: 'Test Owner',
            isHostingLiveEvent: false,
            role: CommunityRole.Member,
            membersCount: 10,
            voiceChatStatus: mockVoiceChatStatus,
            friends: expect.arrayContaining([
              expect.objectContaining({
                address: '0xfriend1',
                hasClaimedName: true
              }),
              expect.objectContaining({
                address: '0xfriend2',
                hasClaimedName: true
              })
            ])
          })
        )
        expect(result.friends).toHaveLength(2)
      })
    })
  })
})
