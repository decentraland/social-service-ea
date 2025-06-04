import { CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { v4 as uuidv4 } from 'uuid'
import { createMockProfile } from '../mocks/profile'

test('Get Banned Members Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let identity: Identity
  let addressMakingRequest: string
  let communityId: string

  beforeEach(async () => {
    identity = await createTestIdentity()
    addressMakingRequest = identity.realAccount.address.toLowerCase()
    communityId = uuidv4()
  })

  describe('when community does not exists', () => {
    it('should respond with a 404 status code', async () => {
      const response = await makeRequest(identity, `/v1/communities/${communityId}/bans`)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: 'Not Found',
        message: `Community not found: ${communityId}`
      })
    })
  })

  describe('when community exists and has banned members', () => {
    const ownerAddress = '0x0000000000000000000000000000000000000001'
    const firstBannedAddress = '0x0000000000000000000000000000000000000002'
    const secondBannedAddress = '0x0000000000000000000000000000000000000003'

    beforeEach(async () => {
      communityId = (
        await components.communitiesDb.createCommunity({
          name: 'Test Community',
          description: 'Test Description',
          private: false,
          active: true,
          owner_address: ownerAddress
        })
      ).id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })

      await components.communitiesDb.banMemberFromCommunity(communityId, ownerAddress, firstBannedAddress)
      await components.communitiesDb.banMemberFromCommunity(communityId, ownerAddress, secondBannedAddress)
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [
        firstBannedAddress,
        secondBannedAddress,
        ownerAddress
      ])
    })

    describe('but the user is not a member of the community', () => {
      it('should respond with a 401 status code', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/bans`)
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({
          error: 'Not Authorized',
          message: "The user doesn't have permission to get banned members"
        })
      })
    })

    describe('and the user is a member without ban permissions', () => {
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

      it('should respond with a 401 status code', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/bans`)
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({
          error: 'Not Authorized',
          message: "The user doesn't have permission to get banned members"
        })
      })
    })

    describe('and the user has ban permissions', () => {
      beforeEach(async () => {
        spyComponents.catalystClient.getProfiles.mockResolvedValue([
          createMockProfile(firstBannedAddress),
          createMockProfile(secondBannedAddress)
        ])

        await components.communitiesDb.addCommunityMember({
          communityId,
          memberAddress: addressMakingRequest,
          role: CommunityRole.Moderator
        })
      })

      afterEach(async () => {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [addressMakingRequest])
      })

      it('should respond with a 200 status code and the correct banned members', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/bans`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          data: {
            limit: 100,
            page: 1,
            pages: 1,
            results: [
              {
                communityId,
                memberAddress: firstBannedAddress,
                hasClaimedName: true,
                bannedAt: expect.any(String),
                name: `Profile name ${firstBannedAddress}`,
                profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org')
              },
              {
                communityId,
                memberAddress: secondBannedAddress,
                hasClaimedName: true,
                bannedAt: expect.any(String),
                name: `Profile name ${secondBannedAddress}`,
                profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org')
              }
            ],
            total: 2
          }
        })
      })

      it('should return with a 200 and the correct members when the request is made with pagination', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/bans?limit=1&page=1`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          data: {
            limit: 1,
            page: 1,
            pages: 2,
            results: [
              {
                communityId,
                memberAddress: firstBannedAddress,
                hasClaimedName: true,
                bannedAt: expect.any(String),
                name: `Profile name ${firstBannedAddress}`,
                profilePictureUrl: expect.stringContaining('https://profile-images.decentraland.org')
              }
            ],
            total: 2
          }
        })
      })
    })
  })
})
