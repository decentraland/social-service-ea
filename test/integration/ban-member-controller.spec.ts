import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'
import { randomUUID } from 'crypto'
import { Events } from '@dcl/schemas'

test('Ban Member Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when banning a member from a community', () => {
    let identity: Identity
    let bannerAddress: string
    let communityId: string
    let targetMemberAddress: string
    let targetModeratorAddress: string
    let targetOwnerAddress: string
    let nonMemberAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      bannerAddress = identity.realAccount.address.toLowerCase()
      targetMemberAddress = '0x0000000000000000000000000000000000000001'
      targetModeratorAddress = '0x0000000000000000000000000000000000000002'
      targetOwnerAddress = '0x0000000000000000000000000000000000000003'
      nonMemberAddress = '0x0000000000000000000000000000000000000004'

      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: targetOwnerAddress
        })
      )
      communityId = result.id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: targetOwnerAddress,
        role: CommunityRole.Owner
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: targetModeratorAddress,
        role: CommunityRole.Moderator
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: targetMemberAddress,
        role: CommunityRole.Member
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [
        bannerAddress,
        targetMemberAddress,
        targetModeratorAddress,
        targetOwnerAddress,
        nonMemberAddress
      ])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(
          `/v1/communities/${communityId}/members/${targetMemberAddress}/bans`,
          {
            method: 'POST'
          }
        )
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(
            identity,
            `/v1/communities/${nonExistentId}/members/${targetMemberAddress}/bans`,
            'POST'
          )
          expect(response.status).toBe(404)
        })
      })

      describe('and the address is invalid', () => {
        it('should respond with a 400 status code when trying to ban with an invalid address', async () => {
          const response = await makeRequest(
            identity,
            `/v1/communities/${communityId}/members/invalid-address/bans`,
            'POST'
          )
          expect(response.status).toBe(400)
        })
      })

      describe('and the community exists', () => {
        describe('and the banner is not a member of the community', () => {
          it('should respond with a 401 status code', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}/bans`,
              'POST'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${bannerAddress} doesn't have permission to ban ${targetMemberAddress} from community ${communityId}`
            })
          })
        })

        describe('and the target user is not a member of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: bannerAddress,
              role: CommunityRole.Moderator
            })
          })

          it('should respond with a 204 status code when banning a non-member', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${nonMemberAddress}/bans`,
              'POST'
            )
            expect(response.status).toBe(204)
          })
        })

        describe('and the banner is a member of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: bannerAddress,
              role: CommunityRole.Member
            })
          })

          it('should respond with a 401 status code when trying to ban another member', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}/bans`,
              'POST'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${bannerAddress} doesn't have permission to ban ${targetMemberAddress} from community ${communityId}`
            })
          })
        })

        describe('and the banner is a moderator of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: bannerAddress,
              role: CommunityRole.Moderator
            })
          })

          it('should respond with a 204 status code when banning a member', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}/bans`,
              'POST'
            )
            expect(response.status).toBe(204)
          })

          it('should publish event to notify member ban', async () => {
            await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}/bans`,
              'POST'
            )
            
            expect(spyComponents.sns.publishMessage).toHaveBeenCalledWith({
              type: Events.Type.COMMUNITY,
              subType: Events.SubType.Community.MEMBER_BANNED,
              key: expect.stringContaining(`${communityId}-${targetMemberAddress}-`),
              timestamp: expect.any(Number),
              metadata: {
                id: communityId,
                name: "Test Community",
                memberAddress: targetMemberAddress,
                thumbnailUrl: expect.stringContaining(`/social/communities/${communityId}/raw-thumbnail.png`)
              }
            })
          })

          it('should respond with a 401 status code when trying to ban another moderator', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetModeratorAddress}/bans`,
              'POST'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${bannerAddress} doesn't have permission to ban ${targetModeratorAddress} from community ${communityId}`
            })
          })

          it('should respond with a 401 status code when trying to ban an owner', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetOwnerAddress}/bans`,
              'POST'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${bannerAddress} doesn't have permission to ban ${targetOwnerAddress} from community ${communityId}`
            })
          })
        })

        describe('and the banner is the owner of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: bannerAddress,
              role: CommunityRole.Owner
            })
          })

          it('should respond with a 204 status code when banning a member', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}/bans`,
              'POST'
            )
            expect(response.status).toBe(204)
          })

          it('should respond with a 204 status code when banning a moderator', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetModeratorAddress}/bans`,
              'POST'
            )
            expect(response.status).toBe(204)
          })

          it('should respond with a 401 status code when trying to ban another owner', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetOwnerAddress}/bans`,
              'POST'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${bannerAddress} doesn't have permission to ban ${targetOwnerAddress} from community ${communityId}`
            })
          })
        })

        describe('and an error occurs', () => {
          const testTargetAddress = '0x0000000000000000000000000000000000000004'

          beforeEach(async () => {
            spyComponents.communityBans.banMember.mockRejectedValue(new Error('Unable to ban member'))
          })

          it('should respond with a 500 status code', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${testTargetAddress}/bans`,
              'POST'
            )
            expect(response.status).toBe(500)
          })
        })
      })
    })
  })
})
