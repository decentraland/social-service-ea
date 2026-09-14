import { CommunityRole } from '../../../../src/types'
import {
  toCommunityWithUserInformationAndVoiceChat,
  toCommunityWithMembersCount,
  toCommunityWithMembersCountV2,
  toPublicCommunityWithVoiceChat,
  toPublicCommunityWithVoiceChatV2,
  AggregatedCommunityWithMemberAndVoiceChatData,
  AggregatedCommunityWithMemberAndVoiceChatDataV2,
  CommunityPublicInformationWithVoiceChat,
  CommunityPublicInformationWithVoiceChatV2,
  CommunityPrivacyEnum,
  AggregatedCommunityWithMemberAndFriendsData,
  Community,
  CommunityVoiceChatStatus,
  CommunityVisibilityEnum
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
      visibility: CommunityVisibilityEnum.All,
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

  describe('when mapping a single community that has a live voice chat', () => {
    let baseCommunity: Community
    let activeVoiceChatStatus: CommunityVoiceChatStatus
    let membersCount: number

    beforeEach(() => {
      baseCommunity = {
        id: 'test-community-id',
        name: 'Test Community',
        description: 'Test Description',
        ownerAddress: '0xowner',
        privacy: CommunityPrivacyEnum.Public,
        visibility: CommunityVisibilityEnum.All,
        active: true
      }
      activeVoiceChatStatus = { isActive: true, participantCount: 5, moderatorCount: 2 }
      membersCount = 10
    })

    describe('and the community is private', () => {
      let privateCommunity: Community

      beforeEach(() => {
        privateCommunity = { ...baseCommunity, privacy: CommunityPrivacyEnum.Private }
      })

      describe('and the caller is authenticated but not a member', () => {
        let result: AggregatedCommunityWithMemberAndVoiceChatData
        let resultV2: AggregatedCommunityWithMemberAndVoiceChatDataV2

        beforeEach(() => {
          result = toCommunityWithMembersCount(
            { ...privateCommunity, ownerName: 'Test Owner', isHostingLiveEvent: false, role: CommunityRole.None },
            membersCount,
            activeVoiceChatStatus
          )
          resultV2 = toCommunityWithMembersCountV2(
            { ...privateCommunity, isHostingLiveEvent: false, role: CommunityRole.None },
            membersCount,
            activeVoiceChatStatus
          )
        })

        it('should hide the voice chat status from the v1 response', () => {
          expect(result.voiceChatStatus).toBeNull()
        })

        it('should hide the voice chat status from the v2 response', () => {
          expect(resultV2.voiceChatStatus).toBeNull()
        })

        it('should still expose the community name, description and owner address', () => {
          expect(result).toEqual(
            expect.objectContaining({
              name: 'Test Community',
              description: 'Test Description',
              ownerAddress: '0xowner'
            })
          )
        })

        describe('and a caller who may see the status is served a community with no live voice chat', () => {
          let visibleCallerWithoutVoiceChat: AggregatedCommunityWithMemberAndVoiceChatData

          beforeEach(() => {
            visibleCallerWithoutVoiceChat = toCommunityWithMembersCount(
              { ...privateCommunity, ownerName: 'Test Owner', isHostingLiveEvent: false, role: CommunityRole.Member },
              membersCount,
              null
            )
          })

          it('should be indistinguishable from the hidden live voice chat', () => {
            expect(result.voiceChatStatus).toEqual(visibleCallerWithoutVoiceChat.voiceChatStatus)
          })
        })
      })

      describe('and the caller is a member', () => {
        let result: AggregatedCommunityWithMemberAndVoiceChatData
        let resultV2: AggregatedCommunityWithMemberAndVoiceChatDataV2

        beforeEach(() => {
          result = toCommunityWithMembersCount(
            { ...privateCommunity, ownerName: 'Test Owner', isHostingLiveEvent: false, role: CommunityRole.Member },
            membersCount,
            activeVoiceChatStatus
          )
          resultV2 = toCommunityWithMembersCountV2(
            { ...privateCommunity, isHostingLiveEvent: false, role: CommunityRole.Member },
            membersCount,
            activeVoiceChatStatus
          )
        })

        it('should expose the real voice chat status in the v1 response', () => {
          expect(result.voiceChatStatus).toEqual(activeVoiceChatStatus)
        })

        it('should expose the real voice chat status in the v2 response', () => {
          expect(resultV2.voiceChatStatus).toEqual(activeVoiceChatStatus)
        })
      })

      describe('and the caller is a moderator', () => {
        let result: AggregatedCommunityWithMemberAndVoiceChatData

        beforeEach(() => {
          result = toCommunityWithMembersCount(
            { ...privateCommunity, ownerName: 'Test Owner', isHostingLiveEvent: false, role: CommunityRole.Moderator },
            membersCount,
            activeVoiceChatStatus
          )
        })

        it('should expose the real voice chat status', () => {
          expect(result.voiceChatStatus).toEqual(activeVoiceChatStatus)
        })
      })

      describe('and the caller is the owner', () => {
        let result: AggregatedCommunityWithMemberAndVoiceChatData

        beforeEach(() => {
          result = toCommunityWithMembersCount(
            { ...privateCommunity, ownerName: 'Test Owner', isHostingLiveEvent: false, role: CommunityRole.Owner },
            membersCount,
            activeVoiceChatStatus
          )
        })

        it('should expose the real voice chat status', () => {
          expect(result.voiceChatStatus).toEqual(activeVoiceChatStatus)
        })
      })

      describe('and the caller is not authenticated', () => {
        let publicResult: CommunityPublicInformationWithVoiceChat
        let publicResultV2: CommunityPublicInformationWithVoiceChatV2

        beforeEach(() => {
          publicResult = toPublicCommunityWithVoiceChat(
            { ...privateCommunity, ownerName: 'Test Owner', isHostingLiveEvent: false, membersCount },
            activeVoiceChatStatus
          )
          publicResultV2 = toPublicCommunityWithVoiceChatV2(
            { ...privateCommunity, isHostingLiveEvent: false, membersCount },
            activeVoiceChatStatus
          )
        })

        it('should hide the voice chat status from the v1 response', () => {
          expect(publicResult.voiceChatStatus).toBeNull()
        })

        it('should hide the voice chat status from the v2 response', () => {
          expect(publicResultV2.voiceChatStatus).toBeNull()
        })

        it('should still expose the community name, description and owner address', () => {
          expect(publicResult).toEqual(
            expect.objectContaining({
              name: 'Test Community',
              description: 'Test Description',
              ownerAddress: '0xowner'
            })
          )
        })
      })
    })

    describe('and the community is public', () => {
      describe('and the caller is authenticated but not a member', () => {
        let result: AggregatedCommunityWithMemberAndVoiceChatData
        let resultV2: AggregatedCommunityWithMemberAndVoiceChatDataV2

        beforeEach(() => {
          result = toCommunityWithMembersCount(
            { ...baseCommunity, ownerName: 'Test Owner', isHostingLiveEvent: false, role: CommunityRole.None },
            membersCount,
            activeVoiceChatStatus
          )
          resultV2 = toCommunityWithMembersCountV2(
            { ...baseCommunity, isHostingLiveEvent: false, role: CommunityRole.None },
            membersCount,
            activeVoiceChatStatus
          )
        })

        it('should expose the real voice chat status in the v1 response', () => {
          expect(result.voiceChatStatus).toEqual(activeVoiceChatStatus)
        })

        it('should expose the real voice chat status in the v2 response', () => {
          expect(resultV2.voiceChatStatus).toEqual(activeVoiceChatStatus)
        })
      })

      describe('and the caller is not authenticated', () => {
        let publicResult: CommunityPublicInformationWithVoiceChat
        let publicResultV2: CommunityPublicInformationWithVoiceChatV2

        beforeEach(() => {
          publicResult = toPublicCommunityWithVoiceChat(
            { ...baseCommunity, ownerName: 'Test Owner', isHostingLiveEvent: false, membersCount },
            activeVoiceChatStatus
          )
          publicResultV2 = toPublicCommunityWithVoiceChatV2(
            { ...baseCommunity, isHostingLiveEvent: false, membersCount },
            activeVoiceChatStatus
          )
        })

        it('should expose the real voice chat status in the v1 response', () => {
          expect(publicResult.voiceChatStatus).toEqual(activeVoiceChatStatus)
        })

        it('should expose the real voice chat status in the v2 response', () => {
          expect(publicResultV2.voiceChatStatus).toEqual(activeVoiceChatStatus)
        })

        it('should return the members count as a number', () => {
          expect(publicResult.membersCount).toBe(10)
        })
      })
    })
  })
})
