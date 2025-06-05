import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/community'
import { randomUUID } from 'crypto'

test('Unban Member Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when unbanning a member from a community', () => {
    let identity: Identity
    let unbannerAddress: string
    let communityId: string
    let targetMemberAddress: string
    let targetModeratorAddress: string
    let targetOwnerAddress: string
    let nonMemberAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      unbannerAddress = identity.realAccount.address.toLowerCase()
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
        unbannerAddress,
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
            method: 'DELETE'
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
            'DELETE'
          )
          expect(response.status).toBe(404)
        })
      })

      describe('and the address is invalid', () => {
        it('should respond with a 400 status code when trying to unban with an invalid address', async () => {
          const response = await makeRequest(
            identity,
            `/v1/communities/${communityId}/members/invalid-address/bans`,
            'DELETE'
          )
          expect(response.status).toBe(400)
        })
      })

      describe('and the community exists', () => {
        describe('and the unbanner is not a member of the community', () => {
          it('should respond with a 401 status code', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${unbannerAddress} doesn't have permission to unban ${targetMemberAddress} from community ${communityId}`
            })
          })
        })

        describe('and the target user is not banned', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: unbannerAddress,
              role: CommunityRole.Moderator
            })
          })

          it('should respond with a 204 status code', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${nonMemberAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(204)
          })
        })

        describe('and the unbanner is a member of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: unbannerAddress,
              role: CommunityRole.Member
            })
          })

          it('should respond with a 401 status code when trying to unban another member', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${unbannerAddress} doesn't have permission to unban ${targetMemberAddress} from community ${communityId}`
            })
          })
        })

        describe('and the unbanner is a moderator of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: unbannerAddress,
              role: CommunityRole.Moderator
            })
          })

          it('should respond with a 204 status code when unbanning a member', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(204)
          })

          it('should respond with a 401 status code when trying to unban another moderator', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetModeratorAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${unbannerAddress} doesn't have permission to unban ${targetModeratorAddress} from community ${communityId}`
            })
          })

          it('should respond with a 401 status code when trying to unban an owner', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetOwnerAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${unbannerAddress} doesn't have permission to unban ${targetOwnerAddress} from community ${communityId}`
            })
          })
        })

        describe('and the unbanner is the owner of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: unbannerAddress,
              role: CommunityRole.Owner
            })
          })

          it('should respond with a 204 status code when unbanning a member', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(204)
          })

          it('should respond with a 204 status code when unbanning a moderator', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetModeratorAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(204)
          })

          it('should respond with a 401 status code when trying to unban another owner', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetOwnerAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${unbannerAddress} doesn't have permission to unban ${targetOwnerAddress} from community ${communityId}`
            })
          })
        })

        describe('and an error occurs', () => {
          const testTargetAddress = '0x0000000000000000000000000000000000000004'

          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: unbannerAddress,
              role: CommunityRole.Moderator
            })
            spyComponents.community.unbanMember.mockRejectedValue(new Error('Unable to unban member'))
          })

          it('should respond with a 500 status code', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${testTargetAddress}/bans`,
              'DELETE'
            )
            expect(response.status).toBe(500)
          })
        })
      })
    })
  })
})
