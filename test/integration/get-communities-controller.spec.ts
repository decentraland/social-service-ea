import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { createMockProfile } from '../mocks/profile'
import { parseExpectedFriends } from '../mocks/friend'
import { mockCommunity } from '../mocks/communities'
import { createOrUpsertActiveFriendship, removeFriendship } from './utils/friendships'
import { CommunityOwnerNotFoundError, CommunityPrivacyEnum } from '../../src/logic/community'

test('Get Communities Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  const parseFriend = parseExpectedFriends()

  describe('when getting communities', () => {
    const friendAddress1 = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
    const friendAddress2 = '0x77c4c17331436d3b8798596e3d7c0d8e1b786aa4'

    let address: string
    let identity: Identity
    let communityId1: string
    let communityId2: string
    let friendshipId1: string
    let friendshipId2: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()

      spyComponents.catalystClient.getProfile.mockResolvedValue(createMockProfile(address))
      spyComponents.catalystClient.getProfiles.mockResolvedValue([
        createMockProfile(friendAddress1),
        createMockProfile(friendAddress2)
      ])

      // Mock the communityOwners.getOwnersNames to return owner names
      spyComponents.communityOwners.getOwnersNames.mockImplementation(async (ownerAddresses: string[]) => {
        const result: Record<string, string> = {}
        ownerAddresses.forEach((ownerAddress) => {
          if (ownerAddress === address) {
            result[ownerAddress] = 'Test Owner'
          } else {
            result[ownerAddress] = `Owner ${ownerAddress}`
          }
        })
        return result
      })

      const result1 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community 1',
          description: 'Test Description 1',
          owner_address: address
        })
      )
      communityId1 = result1.id

      const result2 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community 2',
          description: 'Test Description 2',
          owner_address: address
        })
      )
      communityId2 = result2.id

      await Promise.all(
        [friendAddress1, friendAddress2].map(async (memberAddress) =>
          components.communitiesDb.addCommunityMember({
            communityId: communityId1,
            memberAddress,
            role: CommunityRole.Member
          })
        )
      )

      await components.communitiesDb.addCommunityMember({
        communityId: communityId2,
        memberAddress: friendAddress1,
        role: CommunityRole.Member
      })

      friendshipId1 = await createOrUpsertActiveFriendship(components.friendsDb, [address, friendAddress1])
      friendshipId2 = await createOrUpsertActiveFriendship(components.friendsDb, [address, friendAddress2])
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId1, [friendAddress1, friendAddress2])
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId2, [friendAddress1])

      await components.communitiesDbHelper.forceCommunityRemoval(communityId1)
      await components.communitiesDbHelper.forceCommunityRemoval(communityId2)

      await removeFriendship(components.friendsDb, friendshipId1, address)
      await removeFriendship(components.friendsDb, friendshipId2, address)
    })

    describe('and the request is not signed', () => {
      beforeEach(() => {
        // Mock voice chat status for public information requests
        spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mockImplementation(
          async (communityIds: string[]) => {
            const result: Record<string, any> = {}
            communityIds.forEach((communityId) => {
              if (communityId === communityId1) {
                result[communityId] = { isActive: true, participantCount: 3, moderatorCount: 1 }
              } else if (communityId === communityId2) {
                result[communityId] = { isActive: false, participantCount: 0, moderatorCount: 0 }
              } else {
                result[communityId] = { isActive: false, participantCount: 0, moderatorCount: 0 }
              }
            })
            return result
          }
        )
      })

      it('should respond with a 200 status code and the public communities with owner names', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch('/v1/communities?limit=10&offset=0&search=test')
        const body = await response.json()

        expect(response.status).toBe(200)
        const relevantResults = body.data.results.filter((c: any) => [communityId1, communityId2].includes(c.id))
        expect(relevantResults).toHaveLength(2)
        expect(relevantResults).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: communityId1,
              name: 'Test Community 1',
              description: 'Test Description 1',
              ownerAddress: address,
              ownerName: 'Test Owner',
              privacy: CommunityPrivacyEnum.Public,
              active: true,
              membersCount: 2
            }),
            expect.objectContaining({
              id: communityId2,
              name: 'Test Community 2',
              description: 'Test Description 2',
              ownerAddress: address,
              ownerName: 'Test Owner',
              privacy: CommunityPrivacyEnum.Public,
              active: true,
              membersCount: 1
            })
          ])
        )
      })

      it('should include voiceChatStatus in public community responses', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch('/v1/communities?limit=10&offset=0&search=test')
        const body = await response.json()

        expect(response.status).toBe(200)
        const relevantResults = body.data.results.filter((c: any) => [communityId1, communityId2].includes(c.id))
        expect(relevantResults).toHaveLength(2)

        // Find communities by ID to check their voice chat status
        const community1 = relevantResults.find((c: any) => c.id === communityId1)
        const community2 = relevantResults.find((c: any) => c.id === communityId2)

        expect(community1).toEqual(
          expect.objectContaining({
            id: communityId1,
            voiceChatStatus: {
              isActive: true,
              participantCount: 3,
              moderatorCount: 1
            }
          })
        )

        expect(community2).toEqual(
          expect.objectContaining({
            id: communityId2,
            voiceChatStatus: {
              isActive: false,
              participantCount: 0,
              moderatorCount: 0
            }
          })
        )

        // Verify that the batch method was called with at least our test communities
        expect(spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalled()
        const callArgs = spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mock.calls[0][0]
        expect(callArgs).toContain(communityId1)
        expect(callArgs).toContain(communityId2)
      })
    })

    describe('and the request is signed', () => {
      describe('when getting all communities', () => {
        it('should return all communities with correct role, friends information, and owner names', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&search=test')
          const body = await response.json()

          const friend1Profile = createMockProfile(friendAddress1)
          const friend2Profile = createMockProfile(friendAddress2)

          expect(response.status).toBe(200)
          const relevantResults = body.data.results.filter((c: any) => [communityId1, communityId2].includes(c.id))
          expect(relevantResults).toHaveLength(2)
          expect(relevantResults).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: communityId1,
                name: 'Test Community 1',
                description: 'Test Description 1',
                ownerAddress: address,
                ownerName: 'Test Owner',
                privacy: CommunityPrivacyEnum.Public,
                active: true,
                role: CommunityRole.None,
                membersCount: 2,
                friends: expect.arrayContaining([parseFriend(friend1Profile), parseFriend(friend2Profile)])
              }),
              expect.objectContaining({
                id: communityId2,
                name: 'Test Community 2',
                description: 'Test Description 2',
                ownerAddress: address,
                ownerName: 'Test Owner',
                privacy: CommunityPrivacyEnum.Public,
                active: true,
                role: CommunityRole.None,
                membersCount: 1,
                friends: expect.arrayContaining([parseFriend(friend1Profile)])
              })
            ])
          )
        })

        describe('when sorting by ranking', () => {
          let editorChoiceCommunityId: string
          let highScoreCommunityId: string
          let lowScoreCommunityId: string
          let editorChoiceHighScoreId: string

          beforeEach(async () => {
            const editorChoiceResult = await components.communitiesDb.createCommunity(
              mockCommunity({
                name: 'Editor Choice Community',
                description: 'Editor Choice Description',
                owner_address: address
              })
            )
            editorChoiceCommunityId = editorChoiceResult.id
            await components.communitiesDb.setEditorChoice(editorChoiceCommunityId, true)
            await components.communitiesDb.updateCommunityRankingScore(editorChoiceCommunityId, 0.3)

            const highScoreResult = await components.communitiesDb.createCommunity(
              mockCommunity({
                name: 'High Score Community',
                description: 'High Score Description',
                owner_address: address
              })
            )
            highScoreCommunityId = highScoreResult.id
            await components.communitiesDb.updateCommunityRankingScore(highScoreCommunityId, 0.8)

            const lowScoreResult = await components.communitiesDb.createCommunity(
              mockCommunity({
                name: 'Low Score Community',
                description: 'Low Score Description',
                owner_address: address
              })
            )
            lowScoreCommunityId = lowScoreResult.id
            await components.communitiesDb.updateCommunityRankingScore(lowScoreCommunityId, 0.1)

            const editorChoiceHighScoreResult = await components.communitiesDb.createCommunity(
              mockCommunity({
                name: 'Editor Choice High Score',
                description: 'Editor Choice High Score Description',
                owner_address: address
              })
            )
            editorChoiceHighScoreId = editorChoiceHighScoreResult.id
            await components.communitiesDb.setEditorChoice(editorChoiceHighScoreId, true)
            await components.communitiesDb.updateCommunityRankingScore(editorChoiceHighScoreId, 0.9)

            spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mockImplementation(
              async (communityIds: string[]) => {
                const result: Record<string, any> = {}
                communityIds.forEach((id) => {
                  result[id] = { isActive: false, participantCount: 0, moderatorCount: 0 }
                })
                return result
              }
            )
          })

          afterEach(async () => {
            const communitiesToClean = [
              editorChoiceCommunityId,
              highScoreCommunityId,
              lowScoreCommunityId,
              editorChoiceHighScoreId
            ]

            await Promise.allSettled(
              communitiesToClean.map(async (communityId) => {
                if (communityId) {
                  await components.communitiesDbHelper.forceCommunityRemoval(communityId)
                }
              })
            )
          })

          it('should prioritize editors_choice communities over non-editors-choice regardless of score when sorting by ranking', async () => {
            const { communities: communitiesData } = await components.communities.getCommunities(address, {
              pagination: { limit: 20, offset: 0 },
              sortBy: 'ranking'
            })

            const expectedOrder = [editorChoiceCommunityId, highScoreCommunityId]
            const relevantCommunities = communitiesData.filter((c: any) => expectedOrder.includes(c.id))

            expect(relevantCommunities).toEqual(expectedOrder.map((id) => expect.objectContaining({ id })))
          })

          it('should sort by ranking_score within editors_choice communities when sorting by ranking', async () => {
            const { communities: communitiesData } = await components.communities.getCommunities(address, {
              pagination: { limit: 20, offset: 0 },
              sortBy: 'ranking'
            })

            const expectedOrder = [editorChoiceHighScoreId, editorChoiceCommunityId]
            const relevantCommunities = communitiesData.filter((c: any) => expectedOrder.includes(c.id))

            expect(relevantCommunities).toEqual(expectedOrder.map((id) => expect.objectContaining({ id })))
          })

          it('should sort by ranking_score for non-editors-choice communities when sorting by ranking', async () => {
            const { communities: communitiesData } = await components.communities.getCommunities(address, {
              pagination: { limit: 20, offset: 0 },
              sortBy: 'ranking'
            })

            const expectedOrder = [highScoreCommunityId, lowScoreCommunityId]
            const relevantCommunities = communitiesData.filter((c: any) => expectedOrder.includes(c.id))

            expect(relevantCommunities).toEqual(expectedOrder.map((id) => expect.objectContaining({ id })))
          })
        })
      })

      describe('when filtering by membership', () => {
        let communityId3: string

        beforeEach(async () => {
          const result3 = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Test Community 3',
              description: 'Test Description 3',
              owner_address: address
            })
          )
          communityId3 = result3.id

          await components.communitiesDb.addCommunityMember({
            communityId: communityId1,
            memberAddress: address,
            role: CommunityRole.Member
          })

          await components.communitiesDb.addCommunityMember({
            communityId: communityId3,
            memberAddress: address,
            role: CommunityRole.Moderator
          })
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId1, [address])
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId3, [address])

          await components.communitiesDbHelper.forceCommunityRemoval(communityId3)
        })

        it('should return only member communities sorted by role with owner names', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&onlyMemberOf=true')
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(2)
          expect(body.data.results[0]).toEqual(
            expect.objectContaining({
              id: communityId3,
              name: 'Test Community 3',
              ownerName: 'Test Owner',
              role: CommunityRole.Moderator
            })
          )
          expect(body.data.results[1]).toEqual(
            expect.objectContaining({
              id: communityId1,
              name: 'Test Community 1',
              ownerName: 'Test Owner',
              role: CommunityRole.Member
            })
          )
          expect(body.data.total).toBe(2)
        })

        it('should return all communities sorted by membersCount with owner names when onlyMemberOf=false', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&onlyMemberOf=false')
          const body = await response.json()

          expect(response.status).toBe(200)
          const relevantResults = body.data.results.filter((c: any) =>
            [communityId1, communityId2, communityId3].includes(c.id)
          )
          expect(relevantResults).toHaveLength(3)
          expect(relevantResults.every((community) => community.ownerName === 'Test Owner')).toBe(true)
        })
      })

      describe('when filtering by active voice chat', () => {
        beforeEach(() => {
          // Mock voice chat status for the communities
          spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockImplementation(async (communityId: string) => {
            if (communityId === communityId1) {
              return { isActive: true, participantCount: 5, moderatorCount: 2 }
            } else if (communityId === communityId2) {
              return { isActive: false, participantCount: 0, moderatorCount: 0 }
            }
            return null
          })

          // Mock batch voice chat status method
          spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mockImplementation(
            async (communityIds: string[]) => {
              const result: Record<string, any> = {}
              communityIds.forEach((communityId) => {
                if (communityId === communityId1) {
                  result[communityId] = { isActive: true, participantCount: 5, moderatorCount: 2 }
                } else if (communityId === communityId2) {
                  result[communityId] = { isActive: false, participantCount: 0, moderatorCount: 0 }
                } else {
                  result[communityId] = { isActive: false, participantCount: 0, moderatorCount: 0 }
                }
              })
              return result
            }
          )

          // Mock getAllActiveCommunityVoiceChats method
          spyComponents.commsGatekeeper.getAllActiveCommunityVoiceChats.mockImplementation(async () => {
            return [{ communityId: communityId1, participantCount: 5, moderatorCount: 2 }]
          })
        })

        it('should return only communities with active voice chat when onlyWithActiveVoiceChat=true', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&onlyWithActiveVoiceChat=true')
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(1)
          expect(body.data.results[0].id).toBe(communityId1)
          expect(body.data.total).toBe(1)

          // Verify that the comms gatekeeper was called to get active voice chats first
          expect(spyComponents.commsGatekeeper.getAllActiveCommunityVoiceChats).toHaveBeenCalled()
          // Verify getCommunitiesVoiceChatStatus is NOT called when filtering (we reuse the data)
          expect(spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus).not.toHaveBeenCalled()
        })

        it('should return all communities when onlyWithActiveVoiceChat=false', async () => {
          const response = await makeRequest(
            identity,
            '/v1/communities?limit=10&offset=0&onlyWithActiveVoiceChat=false'
          )
          const body = await response.json()

          expect(response.status).toBe(200)
          const relevantResults = body.data.results.filter((c: any) => [communityId1, communityId2].includes(c.id))
          expect(relevantResults).toHaveLength(2)

          // Verify getAllActiveCommunityVoiceChats is NOT called when not filtering
          expect(spyComponents.commsGatekeeper.getAllActiveCommunityVoiceChats).not.toHaveBeenCalled()
          // Verify getCommunitiesVoiceChatStatus IS called when not filtering
          expect(spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalled()
          const callArgs = spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mock.calls[0][0]
          expect(callArgs).toContain(communityId1)
          expect(callArgs).toContain(communityId2)
        })

        it('should return all communities when onlyWithActiveVoiceChat is not provided', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0')
          const body = await response.json()

          expect(response.status).toBe(200)
          const relevantResults = body.data.results.filter((c: any) => [communityId1, communityId2].includes(c.id))
          expect(relevantResults).toHaveLength(2)

          // Verify getAllActiveCommunityVoiceChats is NOT called when not filtering
          expect(spyComponents.commsGatekeeper.getAllActiveCommunityVoiceChats).not.toHaveBeenCalled()
          // Verify getCommunitiesVoiceChatStatus IS called when not filtering
          expect(spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalled()
          const callArgs = spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mock.calls[0][0]
          expect(callArgs).toContain(communityId1)
          expect(callArgs).toContain(communityId2)
        })

        it('should include voiceChatStatus in all community responses', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0')
          const body = await response.json()

          expect(response.status).toBe(200)
          const relevantResults = body.data.results.filter((c: any) => [communityId1, communityId2].includes(c.id))
          expect(relevantResults).toHaveLength(2)

          // Find communities by ID to check their voice chat status
          const community1 = relevantResults.find((c: any) => c.id === communityId1)
          const community2 = relevantResults.find((c: any) => c.id === communityId2)

          expect(community1).toEqual(
            expect.objectContaining({
              id: communityId1,
              voiceChatStatus: {
                isActive: true,
                participantCount: 5,
                moderatorCount: 2
              }
            })
          )

          expect(community2).toEqual(
            expect.objectContaining({
              id: communityId2,
              voiceChatStatus: {
                isActive: false,
                participantCount: 0,
                moderatorCount: 0
              }
            })
          )

          // Verify that the batch method was called with at least our test communities
          expect(spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus).toHaveBeenCalled()
          const callArgs = spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mock.calls[0][0]
          expect(callArgs).toContain(communityId1)
          expect(callArgs).toContain(communityId2)
        })

        describe('when voice chat status check fails', () => {
          beforeEach(() => {
            // Mock one success and one failure
            spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockImplementation(
              async (communityId: string) => {
                if (communityId === communityId1) {
                  return { isActive: true, participantCount: 5, moderatorCount: 2 }
                } else if (communityId === communityId2) {
                  throw new Error('Voice chat service unavailable')
                }
                return null
              }
            )

            // Mock batch method to simulate one success and one failure
            spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mockImplementation(
              async (communityIds: string[]) => {
                const result: Record<string, any> = {}
                communityIds.forEach((communityId) => {
                  if (communityId === communityId1) {
                    result[communityId] = { isActive: true, participantCount: 5, moderatorCount: 2 }
                  } else if (communityId === communityId2) {
                    // When community2 fails, it gets marked as inactive in our batch implementation
                    result[communityId] = { isActive: false, participantCount: 0, moderatorCount: 0 }
                  } else {
                    result[communityId] = { isActive: false, participantCount: 0, moderatorCount: 0 }
                  }
                })
                return result
              }
            )

            // Mock getAllActiveCommunityVoiceChats to return only community1
            spyComponents.commsGatekeeper.getAllActiveCommunityVoiceChats.mockImplementation(async () => {
              return [{ communityId: communityId1, participantCount: 5, moderatorCount: 2 }]
            })
          })

          it('should exclude communities where status check fails', async () => {
            const response = await makeRequest(
              identity,
              '/v1/communities?limit=10&offset=0&onlyWithActiveVoiceChat=true'
            )
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body.data.results).toHaveLength(1)
            expect(body.data.results[0].id).toBe(communityId1)
            expect(body.data.total).toBe(1)
          })
        })

        describe('when filtering private communities with active voice chat', () => {
          let privateCommunityId: string
          let publicCommunityId: string
          let nonMemberIdentity: Identity

          beforeEach(async () => {
            nonMemberIdentity = await createTestIdentity()

            // Create a private community
            const privateResult = await components.communitiesDb.createCommunity(
              mockCommunity({
                name: 'Private Test Community',
                description: 'Private Test Description',
                owner_address: address,
                private: true
              })
            )
            privateCommunityId = privateResult.id

            // Add current user as member of private community
            await components.communitiesDb.addCommunityMember({
              communityId: privateCommunityId,
              memberAddress: address,
              role: CommunityRole.Member
            })

            // Create a public community
            const publicResult = await components.communitiesDb.createCommunity(
              mockCommunity({
                name: 'Public Test Community',
                description: 'Public Test Description',
                owner_address: address,
                private: false
              })
            )
            publicCommunityId = publicResult.id

            // Mock both communities to have active voice chat
            spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mockImplementation(
              async (communityIds: string[]) => {
                const result: Record<string, any> = {}
                communityIds.forEach((communityId) => {
                  result[communityId] = { isActive: true, participantCount: 3, moderatorCount: 1 }
                })
                return result
              }
            )

            // Mock getAllActiveCommunityVoiceChats to return both communities
            spyComponents.commsGatekeeper.getAllActiveCommunityVoiceChats.mockImplementation(async () => {
              return [
                { communityId: privateCommunityId, participantCount: 3, moderatorCount: 1 },
                { communityId: publicCommunityId, participantCount: 3, moderatorCount: 1 }
              ]
            })
          })

          afterEach(async () => {
            await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityId, [address])
            await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityId)
            await components.communitiesDbHelper.forceCommunityRemoval(publicCommunityId)
          })

          it('should return both private and public communities for member when onlyWithActiveVoiceChat=true', async () => {
            const response = await makeRequest(
              identity,
              '/v1/communities?limit=10&offset=0&onlyWithActiveVoiceChat=true'
            )
            const body = await response.json()

            expect(response.status).toBe(200)
            const communityIds = body.data.results.map((c: any) => c.id)
            expect(communityIds).toContain(privateCommunityId)
            expect(communityIds).toContain(publicCommunityId)
          })

          it('should return only public communities for non-member when onlyWithActiveVoiceChat=true', async () => {
            const response = await makeRequest(
              nonMemberIdentity,
              '/v1/communities?limit=10&offset=0&onlyWithActiveVoiceChat=true'
            )
            const body = await response.json()

            expect(response.status).toBe(200)
            const communityIds = body.data.results.map((c: any) => c.id)
            expect(communityIds).not.toContain(privateCommunityId)
            expect(communityIds).toContain(publicCommunityId)
          })

          it('should return all communities (including private) for members when onlyWithActiveVoiceChat=false', async () => {
            const response = await makeRequest(
              identity,
              '/v1/communities?limit=10&offset=0&onlyWithActiveVoiceChat=false'
            )
            const body = await response.json()

            expect(response.status).toBe(200)
            const communityIds = body.data.results.map((c: any) => c.id)
            expect(communityIds).toContain(privateCommunityId)
            expect(communityIds).toContain(publicCommunityId)
          })

          it('should include voiceChatStatus for private community when user is a member', async () => {
            const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0')
            const body = await response.json()

            expect(response.status).toBe(200)

            const privateCommunity = body.data.results.find((c: any) => c.id === privateCommunityId)
            expect(privateCommunity).toBeDefined()
            expect(privateCommunity.voiceChatStatus).toEqual({
              isActive: true,
              participantCount: 3,
              moderatorCount: 1
            })
          })

          it('should NOT include voiceChatStatus for private community when user is NOT a member', async () => {
            const response = await makeRequest(nonMemberIdentity, '/v1/communities?limit=10&offset=0')
            const body = await response.json()

            expect(response.status).toBe(200)

            // Private community should appear in results (if filtering allows it)
            const privateCommunity = body.data.results.find((c: any) => c.id === privateCommunityId)
            if (privateCommunity) {
              // If the private community is returned, voiceChatStatus should be null
              expect(privateCommunity.voiceChatStatus).toEqual({
                isActive: false,
                participantCount: 0,
                moderatorCount: 0
              })
            }
          })

          it('should include voiceChatStatus for public community regardless of membership', async () => {
            const response = await makeRequest(nonMemberIdentity, '/v1/communities?limit=10&offset=0')
            const body = await response.json()

            expect(response.status).toBe(200)

            const publicCommunity = body.data.results.find((c: any) => c.id === publicCommunityId)
            expect(publicCommunity).toBeDefined()
            expect(publicCommunity.voiceChatStatus).toEqual({
              isActive: true,
              participantCount: 3,
              moderatorCount: 1
            })
          })
        })
      })

      describe('when filtering by unlisted communities', () => {
        let unlistedCommunityId: string
        let listedCommunityId: string

        beforeEach(async () => {
          // Create an unlisted community
          const unlistedResult = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Unlisted Community',
              description: 'Unlisted Description',
              owner_address: address,
              unlisted: true
            })
          )
          unlistedCommunityId = unlistedResult.id

          // Create a listed community
          const listedResult = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Listed Community',
              description: 'Listed Description',
              owner_address: address,
              unlisted: false
            })
          )
          listedCommunityId = listedResult.id

          // Mock voice chat status for all communities
          spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockImplementation(async () => {
            return { isActive: false, participantCount: 0, moderatorCount: 0 }
          })

          spyComponents.commsGatekeeper.getCommunitiesVoiceChatStatus.mockImplementation(
            async (communityIds: string[]) => {
              const result: Record<string, any> = {}
              communityIds.forEach((id) => {
                result[id] = { isActive: false, participantCount: 0, moderatorCount: 0 }
              })
              return result
            }
          )
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityRemoval(unlistedCommunityId)
          await components.communitiesDbHelper.forceCommunityRemoval(listedCommunityId)
        })

        it('should exclude unlisted communities from public listings', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0')
          const body = await response.json()

          expect(response.status).toBe(200)
          const unlistedCommunity = body.data.results.find((c: any) => c.id === unlistedCommunityId)
          const listedCommunity = body.data.results.find((c: any) => c.id === listedCommunityId)

          expect(unlistedCommunity).toBeUndefined()
          expect(listedCommunity).toBeDefined()
        })

        it('should allow direct access to unlisted communities via GET /v1/communities/{id}', async () => {
          // Mock owner name for the unlisted community
          spyComponents.communityOwners.getOwnerName.mockResolvedValueOnce('Unlisted Owner')

          // Mock events
          spyComponents.communityEvents.isCurrentlyHostingEvents.mockResolvedValueOnce(false)

          const response = await makeRequest(identity, `/v1/communities/${unlistedCommunityId}`)
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.id).toBe(unlistedCommunityId)
          expect(body.data.name).toBe('Unlisted Community')
        })

        it('should include unlisted communities in results when user is a member', async () => {
          // Add user as member to unlisted community
          await components.communitiesDb.addCommunityMember({
            communityId: unlistedCommunityId,
            memberAddress: address,
            role: CommunityRole.Member
          })

          // When filtering by membership, unlisted communities should be included
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&onlyMemberOf=true')
          const body = await response.json()

          expect(response.status).toBe(200)
          const unlistedCommunity = body.data.results.find((c: any) => c.id === unlistedCommunityId)
          expect(unlistedCommunity).toBeDefined()

          await components.communitiesDbHelper.forceCommunityMemberRemoval(unlistedCommunityId, [address])
        })

        it('should exclude unlisted communities from public information endpoint', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch('/v1/communities?limit=10&offset=0')
          const body = await response.json()

          expect(response.status).toBe(200)
          const unlistedCommunity = body.data.results.find((c: any) => c.id === unlistedCommunityId)
          const listedCommunity = body.data.results.find((c: any) => c.id === listedCommunityId)

          expect(unlistedCommunity).toBeUndefined()
          expect(listedCommunity).toBeDefined()
        })
      })

      describe('when filtering by roles', () => {
        let communityId4: string

        beforeEach(async () => {
          const result4 = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Test Community 4',
              description: 'Test Description 4',
              owner_address: '0x9876543210987654321098765432109876543210'
            })
          )
          communityId4 = result4.id

          // Add user to communities with different roles
          await components.communitiesDb.addCommunityMember({
            communityId: communityId1,
            memberAddress: address,
            role: CommunityRole.Member
          })

          await components.communitiesDb.addCommunityMember({
            communityId: communityId4,
            memberAddress: address,
            role: CommunityRole.Owner
          })
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId1, [address])
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId4, [address])

          await components.communitiesDbHelper.forceCommunityRemoval(communityId4)
        })

        describe('when filtering by single role', () => {
          describe('with owner role', () => {
            let queryParams: string

            beforeEach(() => {
              queryParams = 'limit=10&offset=0&roles=owner'
            })

            it('should return only communities where user has owner role', async () => {
              const response = await makeRequest(identity, `/v1/communities?${queryParams}`)
              const body = await response.json()

              expect(response.status).toBe(200)
              expect(body.data.results).toHaveLength(1)
              expect(body.data.results[0]).toEqual(
                expect.objectContaining({
                  id: communityId4,
                  name: 'Test Community 4',
                  role: CommunityRole.Owner
                })
              )
              expect(body.data.total).toBe(1)
            })

            describe('and filtering with onlyMemberOf filter', () => {
              beforeEach(() => {
                queryParams += '&onlyMemberOf=true'
              })

              it('should respond 200 ok and return filtered communities', async () => {
                const response = await makeRequest(identity, `/v1/communities?${queryParams}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.results).toHaveLength(1)
                expect(body.data.results[0]).toEqual(
                  expect.objectContaining({
                    id: communityId4,
                    name: 'Test Community 4',
                    role: CommunityRole.Owner
                  })
                )
                expect(body.data.total).toBe(1)
              })
            })
          })

          describe('with member role', () => {
            let queryParams: string

            beforeEach(() => {
              queryParams = 'limit=10&offset=0&roles=member'
            })

            it('should return only communities where user has member role', async () => {
              const response = await makeRequest(identity, `/v1/communities?${queryParams}`)
              const body = await response.json()

              expect(response.status).toBe(200)
              expect(body.data.results).toHaveLength(1)
              expect(body.data.results[0]).toEqual(
                expect.objectContaining({
                  id: communityId1,
                  name: 'Test Community 1',
                  role: CommunityRole.Member
                })
              )
              expect(body.data.total).toBe(1)
            })

            describe('and filtering with search filter', () => {
              beforeEach(() => {
                queryParams += '&search=Community'
              })

              it('should respond 200 ok and return filtered communities', async () => {
                const response = await makeRequest(identity, `/v1/communities?${queryParams}`)
                const body = await response.json()

                expect(response.status).toBe(200)
                expect(body.data.results).toHaveLength(1)
                expect(body.data.results[0]).toEqual(
                  expect.objectContaining({
                    id: communityId1,
                    name: 'Test Community 1',
                    role: CommunityRole.Member
                  })
                )
                expect(body.data.total).toBe(1)
              })
            })
          })

          describe('with moderator role', () => {
            let queryParams: string

            beforeEach(() => {
              queryParams = 'limit=10&offset=0&roles=moderator'
            })

            it('should return empty results since user has no moderator role', async () => {
              const response = await makeRequest(identity, `/v1/communities?${queryParams}`)
              const body = await response.json()

              expect(response.status).toBe(200)
              expect(body.data.results).toHaveLength(0)
              expect(body.data.total).toBe(0)
            })
          })
        })

        describe('when filtering by multiple roles', () => {
          let queryParams: string

          beforeEach(() => {
            queryParams = 'limit=10&offset=0&roles=owner&roles=member'
          })

          it('should return communities where user has owner or member role', async () => {
            const response = await makeRequest(identity, `/v1/communities?${queryParams}`)
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body.data.results).toHaveLength(2)

            const communityIds = body.data.results.map((community: any) => community.id)
            expect(communityIds).toContain(communityId1)
            expect(communityIds).toContain(communityId4)

            const roles = body.data.results.map((community: any) => community.role)
            expect(roles).toContain(CommunityRole.Member)
            expect(roles).toContain(CommunityRole.Owner)

            expect(body.data.total).toBe(2)
          })
        })

        describe('when filtering with empty roles parameter', () => {
          let queryParams: string

          beforeEach(() => {
            queryParams = 'limit=10&offset=0&roles='
          })

          it('should handle empty roles parameter gracefully', async () => {
            const response = await makeRequest(identity, `/v1/communities?${queryParams}`)
            const body = await response.json()

            expect(response.status).toBe(200)
            const relevantResults = body.data.results.filter((c: any) =>
              [communityId1, communityId2, communityId4].includes(c.id)
            )
            expect(relevantResults).toHaveLength(3) // All communities (no role filtering)
          })
        })

        describe('when filtering with multiple empty roles parameters', () => {
          let queryParams: string

          beforeEach(() => {
            queryParams = 'limit=10&offset=0&roles=&roles='
          })

          it('should handle multiple empty roles parameters gracefully', async () => {
            const response = await makeRequest(identity, `/v1/communities?${queryParams}`)
            const body = await response.json()

            expect(response.status).toBe(200)
            const relevantResults = body.data.results.filter((c: any) =>
              [communityId1, communityId2, communityId4].includes(c.id)
            )
            expect(relevantResults).toHaveLength(3) // All communities (no role filtering)
          })
        })

        describe('when filtering with invalid roles parameter', () => {
          let queryParams: string

          beforeEach(() => {
            queryParams = 'limit=10&offset=0&roles=owner&roles=invalid'
          })

          it('should handle invalid roles parameter gracefully', async () => {
            const response = await makeRequest(identity, `/v1/communities?${queryParams}`)
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body.data.results).toHaveLength(1)
            expect(body.data.total).toBe(1)

            // Verify that only the valid role (owner) was applied
            expect(body.data.results[0]).toEqual(
              expect.objectContaining({
                id: communityId4,
                name: 'Test Community 4',
                role: CommunityRole.Owner
              })
            )
          })
        })
      })

      describe('and the query fails', () => {
        beforeEach(() => {
          spyComponents.communitiesDb.getCommunities.mockRejectedValue(new Error('Unable to get communities'))
        })

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, '/v1/communities')
          expect(response.status).toBe(500)
        })
      })

      describe('and owner profile retrieval fails', () => {
        beforeEach(() => {
          spyComponents.communityOwners.getOwnersNames.mockRejectedValue(
            new CommunityOwnerNotFoundError(communityId1, address)
          )
        })

        it('should respond with a 404 status code', async () => {
          const response = await makeRequest(identity, '/v1/communities')
          expect(response.status).toBe(404)
        })
      })

      describe('and different owners have different profile names', () => {
        const differentOwnerAddress = '0x9999999999999999999999999999999999999999'
        let communityId4: string

        beforeEach(async () => {
          // Mock different owner name for the new community
          spyComponents.communityOwners.getOwnersNames.mockImplementation(async (ownerAddresses: string[]) => {
            const result: Record<string, string> = {}
            ownerAddresses.forEach((ownerAddress) => {
              if (ownerAddress === address) {
                result[ownerAddress] = 'Test Owner'
              } else if (ownerAddress === differentOwnerAddress) {
                result[ownerAddress] = 'Different Owner'
              } else {
                result[ownerAddress] = `Owner ${ownerAddress}`
              }
            })
            return result
          })

          const result4 = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Test Community 4',
              description: 'Test Description 4',
              owner_address: differentOwnerAddress
            })
          )
          communityId4 = result4.id
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityRemoval(communityId4)
        })

        it('should return communities with correct owner names for each owner', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0')
          const body = await response.json()

          expect(response.status).toBe(200)
          const relevantResults = body.data.results.filter((c: any) =>
            [communityId1, communityId2, communityId4].includes(c.id)
          )
          expect(relevantResults).toHaveLength(3)

          const originalOwnerCommunities = relevantResults.filter(
            (community: any) => community.ownerAddress === address
          )
          const differentOwnerCommunities = relevantResults.filter(
            (community: any) => community.ownerAddress === differentOwnerAddress
          )

          expect(originalOwnerCommunities.every((community: any) => community.ownerName === 'Test Owner')).toBe(true)
          expect(differentOwnerCommunities.every((community: any) => community.ownerName === 'Different Owner')).toBe(
            true
          )
        })
      })
    })
  })
})
