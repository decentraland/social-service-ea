import { CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { v4 as uuidv4 } from 'uuid'
import { createMockProfile } from '../mocks/profile'
import { Action } from '../../src/types/entities'
import { FriendshipStatus } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { createFriendshipRequest, createOrUpsertActiveFriendship } from './utils/friendships'
import { removeFriendship } from './utils/friendships'
import { Response } from '@well-known-components/interfaces'

test('Get Community Members Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let identity: Identity
  let addressMakingRequest: string
  let communityId: string

  beforeEach(async () => {
    identity = await createTestIdentity()
    addressMakingRequest = identity.realAccount.address.toLowerCase()
    communityId = uuidv4()
  })

  describe('when getting community members', () => {
    const ownerAddress = '0x0000000000000000000000000000000000000001'
    const firstMemberAddress = '0x0000000000000000000000000000000000000002'
    const secondMemberAddress = '0x0000000000000000000000000000000000000003'
    let firstFriendshipId: string
    let secondFriendshipId: string

    beforeEach(async () => {
      communityId = (
        await components.communitiesDb.createCommunity({
          name: 'Test Community',
          description: 'Test Description',
          private: false,
          active: true,
          owner_address: '0x0000000000000000000000000000000000000000'
        })
      ).id

      // Add members to community
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: firstMemberAddress,
        role: CommunityRole.Member
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: secondMemberAddress,
        role: CommunityRole.Member
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })

      // Create friendship requests using utility functions and store IDs
      firstFriendshipId = await createFriendshipRequest(components.friendsDb, [
        addressMakingRequest,
        firstMemberAddress
      ])
      secondFriendshipId = await createOrUpsertActiveFriendship(components.friendsDb, [
        secondMemberAddress,
        addressMakingRequest
      ])

      spyComponents.catalystClient.getProfiles.mockResolvedValue([
        createMockProfile(firstMemberAddress),
        createMockProfile(secondMemberAddress),
        createMockProfile(ownerAddress),
        {
          ...createMockProfile(addressMakingRequest),
          avatars: [
            {
              ...createMockProfile(addressMakingRequest).avatars[0],
              hasClaimedName: false,
              name: '',
              unclaimedName: 'Test User 4'
            }
          ]
        }
      ])
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [
        firstMemberAddress,
        secondMemberAddress,
        ownerAddress
      ])

      // Clean up friendship data using removeFriendship
      await removeFriendship(components.friendsDb, firstFriendshipId, addressMakingRequest)
      await removeFriendship(components.friendsDb, secondFriendshipId, addressMakingRequest)
    })

    describe('when the request is not signed', () => {
      describe('and the community exists but is not public', () => {
        let privateCommunityId: string
        beforeEach(async () => {
          privateCommunityId = (
            await components.communitiesDb.createCommunity({
              name: 'Test Community',
              description: 'Test Description',
              private: true,
              active: true,
              owner_address: '0x0000000000000000000000000000000000000000'
            })
          ).id
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityId)
        })

        it('should return a 404 status code', async () => {
          const { localHttpFetch } = components
          const response = await localHttpFetch.fetch(`/v1/communities/${privateCommunityId}/members`)
          expect(response.status).toBe(404)
          expect(await response.json()).toEqual({
            error: 'Not Found',
            message: `Community not found: ${privateCommunityId}`
          })
        })
      })

      describe('and the community exists and is public', () => {
        let response: Response

        describe('and is requesting all the members', () => {
          beforeEach(async () => {
            const { localHttpFetch } = components
            response = await localHttpFetch.fetch(`/v1/communities/${communityId}/members`)
          })

          it('should return members with a 200 status code', async () => {
            expect(response.status).toBe(200)
            const result = await response.json()

            expect(result.data.results).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  communityId,
                  memberAddress: firstMemberAddress,
                  hasClaimedName: true,
                  joinedAt: expect.any(String),
                  name: `Profile name ${firstMemberAddress}`,
                  role: 'member',
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
                  friendshipStatus: FriendshipStatus.NONE
                }),
                expect.objectContaining({
                  communityId,
                  memberAddress: secondMemberAddress,
                  hasClaimedName: true,
                  joinedAt: expect.any(String),
                  name: `Profile name ${secondMemberAddress}`,
                  role: 'member',
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
                  friendshipStatus: FriendshipStatus.NONE
                }),
                expect.objectContaining({
                  communityId,
                  memberAddress: ownerAddress,
                  hasClaimedName: true,
                  joinedAt: expect.any(String),
                  name: `Profile name ${ownerAddress}`,
                  role: 'owner',
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
                  friendshipStatus: FriendshipStatus.NONE
                })
              ])
            )
          })
        })

        describe('and is requesting only online members', () => {
          beforeEach(async () => {
            spyComponents.peersStats.getConnectedPeers.mockResolvedValue([firstMemberAddress])

            const { localHttpFetch } = components
            response = await localHttpFetch.fetch(`/v1/communities/${communityId}/members?onlyOnline=true`)
          })

          it('should return online members with a 200 status code', async () => {
            expect(response.status).toBe(200)
            const result = await response.json()

            expect(result.data.total).toBe(1)

            expect(result.data.results).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  communityId,
                  memberAddress: firstMemberAddress,
                  hasClaimedName: true,
                  joinedAt: expect.any(String),
                  name: `Profile name ${firstMemberAddress}`,
                  role: 'member',
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
                  friendshipStatus: FriendshipStatus.NONE
                })
              ])
            )
          })
        })
      })
    })

    describe('when the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should return a 404 status code', async () => {
          const nonExistentCommunityId = uuidv4()
          const response = await makeRequest(identity, `/v1/communities/${nonExistentCommunityId}/members`)
          expect(response.status).toBe(404)
          expect(await response.json()).toEqual({
            error: 'Not Found',
            message: `Community not found: ${nonExistentCommunityId}`
          })
        })
      })

      describe('and the community is private', () => {
        let privateCommunityId: string

        beforeEach(async () => {
          // Create a private community
          privateCommunityId = (
            await components.communitiesDb.createCommunity({
              name: 'Private Community',
              description: 'Private Description',
              private: true,
              active: true,
              owner_address: ownerAddress
            })
          ).id

          await components.communitiesDb.addCommunityMember({
            communityId: privateCommunityId,
            memberAddress: ownerAddress,
            role: CommunityRole.Owner
          })
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityId, [ownerAddress])
          await components.communitiesDbHelper.forceCommunityRemoval(privateCommunityId)
        })

        describe('and the user is not a member of the community', () => {
          it('should return a 401 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${privateCommunityId}/members`)
            expect(response.status).toBe(401)
            expect(await response.json()).toEqual({
              error: 'Not Authorized',
              message: "The user doesn't have permission to get community members"
            })
          })
        })

        describe('and the user is a member of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId: privateCommunityId,
              memberAddress: addressMakingRequest,
              role: CommunityRole.Member
            })
          })

          afterEach(async () => {
            await components.communitiesDbHelper.forceCommunityMemberRemoval(privateCommunityId, [addressMakingRequest])
          })

          it('should return a 200 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${privateCommunityId}/members`)
            expect(response.status).toBe(200)
          })
        })
      })

      describe('and the community is public', () => {
        let response: Response

        beforeEach(async () => {
          await components.communitiesDb.addCommunityMember({
            communityId,
            memberAddress: addressMakingRequest,
            role: CommunityRole.Member
          })
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [addressMakingRequest])
        })

        describe('and is requesting all the members', () => {
          beforeEach(async () => {
            response = await makeRequest(identity, `/v1/communities/${communityId}/members?limit=3&page=1`)
          })

          it('should return members with a 200 status code', async () => {
            expect(response.status).toBe(200)
            const result = await response.json()

            expect(result.data.results).toHaveLength(3)

            expect(result.data.results).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  communityId,
                  memberAddress: firstMemberAddress,
                  hasClaimedName: true,
                  joinedAt: expect.any(String),
                  name: `Profile name ${firstMemberAddress}`,
                  role: 'member',
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
                  friendshipStatus: FriendshipStatus.REQUEST_SENT
                }),
                expect.objectContaining({
                  communityId,
                  memberAddress: secondMemberAddress,
                  hasClaimedName: true,
                  joinedAt: expect.any(String),
                  name: `Profile name ${secondMemberAddress}`,
                  role: 'member',
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
                  friendshipStatus: FriendshipStatus.ACCEPTED
                }),
                expect.objectContaining({
                  communityId,
                  memberAddress: ownerAddress,
                  hasClaimedName: true,
                  joinedAt: expect.any(String),
                  name: `Profile name ${ownerAddress}`,
                  role: 'owner',
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
                  friendshipStatus: FriendshipStatus.NONE
                })
              ])
            )
          })

          it('should handle members with no friendship status correctly', async () => {
            const result = await response.json()

            const owner = result.data.results.find((m) => m.memberAddress === ownerAddress)
            expect(owner.friendshipStatus).toBe(FriendshipStatus.NONE)
          })
        })

        describe('and is requesting only online members', () => {
          beforeEach(async () => {
            spyComponents.peersStats.getConnectedPeers.mockResolvedValue([firstMemberAddress])
            response = await makeRequest(identity, `/v1/communities/${communityId}/members?onlyOnline=true`)
          })

          it('should return online members with a 200 status code', async () => {
            expect(response.status).toBe(200)
            const result = await response.json()

            expect(result.data.total).toBe(1)

            expect(result.data.results).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  communityId,
                  memberAddress: firstMemberAddress,
                  hasClaimedName: true,
                  joinedAt: expect.any(String),
                  name: `Profile name ${firstMemberAddress}`,
                  role: 'member',
                  profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org'),
                  friendshipStatus: FriendshipStatus.REQUEST_SENT
                })
              ])
            )
          })
        })
      })

      describe('and the request fails', () => {
        beforeEach(() => {
          spyComponents.community.getCommunityMembers.mockRejectedValue(new Error('Unable to get community members'))
        })

        it('should return a 500 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/members`)
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
