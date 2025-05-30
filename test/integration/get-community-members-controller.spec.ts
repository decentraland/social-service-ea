import { CommunityRole } from '../../src/types/entities'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { v4 as uuidv4 } from 'uuid'

test('Get Community Members Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let identity: Identity
  let addressMakingRequest: string
  let communityId

  beforeEach(async () => {
    identity = await createTestIdentity()
    addressMakingRequest = identity.realAccount.address.toLowerCase()
    communityId = uuidv4()
  })

  describe('when community does not exists', () => {
    it('should respond with a 404 status code', async () => {
      const response = await makeRequest(identity, `/v1/communities/${communityId}/members`)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: 'Not Found',
        message: `Community not found: ${communityId}`
      })
    })
  })

  describe('when community exists and has members', () => {
    const ownerAddress = '0x0000000000000000000000000000000000000001'
    const firstMemberAddress = '0x0000000000000000000000000000000000000002'
    const secondMemberAddress = '0x0000000000000000000000000000000000000003'

    beforeEach(async () => {
      communityId = (await components.communitiesDb.createCommunity({
        name: 'Test Community',
        description: 'Test Description',
        private: false,
        active: true,
        owner_address: '0x0000000000000000000000000000000000000000'
      })).id

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
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [firstMemberAddress, secondMemberAddress, ownerAddress])
    })

    describe('but the user is not a member of the community', () => {
      it('should respond with a 401 status code', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/members`)
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({
          error: 'Not Authorized',
          message: 'The user doesn\'t have permission to get community members'
        })
      })
    })

    describe('and the request is made by a member of the community', () => {
      beforeEach(async () => {
        spyComponents.catalystClient.getProfiles.mockResolvedValue([
            { 
            avatars: [
              {
                ethAddress: firstMemberAddress,
                hasClaimedName: true,
                name: 'Test User',
              }
            ]
          },
          {
            avatars: [
              {
                ethAddress: secondMemberAddress,
                hasClaimedName: true,
                name: 'Test User 2',
              }
            ]
          },
          {
            avatars: [
              {
                ethAddress: ownerAddress,
                hasClaimedName: true,
                name: 'Test User 3',
              }
            ]
          },
          {
            avatars: [
              {
                ethAddress: addressMakingRequest,
                hasClaimedName: false,
                name: '',
              }
            ]
          }
        ])

        await components.communitiesDb.addCommunityMember({
          communityId,
          memberAddress: addressMakingRequest,
          role: CommunityRole.Member
        })
      })

      afterEach(async () => {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [addressMakingRequest])
      })

      it('should respond with a 200 status code and the correct members', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/members`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          data: {
            limit: 100,
            page: 1,
            pages: 1,
            results: [
              {
                communityId,
                memberAddress: firstMemberAddress,
                hasClaimedName: true,
                joinedAt: expect.any(String),
                name: 'Test User',
                role: 'member',
              },
              {
                communityId,
                memberAddress: secondMemberAddress,
                hasClaimedName: true,
                joinedAt: expect.any(String),
                name: 'Test User 2',
                role: 'member',
              },
              {
                communityId,
                memberAddress: ownerAddress,
                hasClaimedName: true,
                joinedAt: expect.any(String),
                name: 'Test User 3',
                role: 'owner',
              },
              {
                communityId,
                memberAddress: addressMakingRequest,
                hasClaimedName: false,
                joinedAt: expect.any(String),
                name: '',
                role: 'member',
              },
            ],
            total: '4',
          }
        })
      })

      it('should return with a 200 and the correct members when the request is made with pagination', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/members?limit=2&page=1`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          data: {
            limit: 2,
            page: 1,
            pages: 2,
            results: [
              {
                communityId,
                memberAddress: firstMemberAddress,
                hasClaimedName: true,
                joinedAt: expect.any(String),
                name: 'Test User',
                role: 'member',
              },
              {
                communityId,
                memberAddress: secondMemberAddress,
                hasClaimedName: true,
                joinedAt: expect.any(String),
                name: 'Test User 2',
                role: 'member',
              },
            ],
            total: '4',
          }
        })
      })
    })
  })
})
