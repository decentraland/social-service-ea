import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'

test('Get Community Invites Controller', function ({ components, spyComponents }) {
  let makeRequest: any

  describe('and the request is not signed', () => {
    let inviteeAddress: string

    beforeEach(async () => {
      makeRequest = components.localHttpFetch.fetch
      inviteeAddress = '0x1234567890123456789012345678901234567890'
    })

    it('should return a 400 status code', async () => {
      const response = await makeRequest(`/v1/members/${inviteeAddress}/invites`)
      expect(response.status).toBe(400)
    })
  })

  describe('and the request is signed', () => {
    beforeEach(async () => {
      makeRequest = makeAuthenticatedRequest(components)
    })

    describe('and communities exist', () => {
      let inviterCommunityId1: string
      let inviterCommunityId2: string
      let sharedCommunityId: string

      beforeEach(async () => {

        // Create all communities that will be used in subsequent tests
        const result1 = await components.communitiesDb.createCommunity(
          mockCommunity({
            name: 'Inviter Community 1',
            description: 'Description 1',
            owner_address: '0x1111111111111111111111111111111111111111' // Will be updated with actual inviter address in member tests
          })
        )
        inviterCommunityId1 = result1.id

        const result2 = await components.communitiesDb.createCommunity(
          mockCommunity({
            name: 'Inviter Community 2',
            description: 'Description 2',
            owner_address: '0x9999999999999999999999999999999999999999'
          })
        )
        inviterCommunityId2 = result2.id

        const result3 = await components.communitiesDb.createCommunity(
          mockCommunity({
            name: 'Shared Community',
            description: 'Shared Description',
            owner_address: '0x8888888888888888888888888888888888888888'
          })
        )
        sharedCommunityId = result3.id
      })

      afterEach(async () => {
        await components.communitiesDbHelper.forceCommunityRemoval(inviterCommunityId1)
        await components.communitiesDbHelper.forceCommunityRemoval(inviterCommunityId2)
        await components.communitiesDbHelper.forceCommunityRemoval(sharedCommunityId)
      })

      describe('and inviter and invitee are the same user', () => {
        let identity: Identity
        let userAddress: string

        beforeEach(async () => {
          identity = await createTestIdentity()
          userAddress = identity.realAccount.address.toLowerCase()
        })

        it('should return a 400 status code with error message about self-invitation', async () => {
          const response = await makeRequest(identity, `/v1/members/${userAddress}/invites`)
          const body = await response.json()

          expect(response.status).toBe(400)
          expect(body.message).toBe('Users cannot invite themselves')
        })
      })

      describe('and inviter and invitee are different users', () => {
        let inviterIdentity: Identity
        let inviterAddress: string
        let inviteeAddress: string

        beforeEach(async () => {
          inviterIdentity = await createTestIdentity()
          inviterAddress = inviterIdentity.realAccount.address.toLowerCase()
          inviteeAddress = '0x1234567890123456789012345678901234567890'
        })

        describe('and inviter is not a member of any community', () => {
          it('should return 200 status code with empty results', async () => {
            const response = await makeRequest(inviterIdentity, `/v1/members/${inviteeAddress}/invites`)
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body.data).toEqual([])
          })
        })

        describe('and inviter is a member of communities', () => {
          beforeEach(async () => {
            // Add inviter as owner of first community
            await components.communitiesDb.addCommunityMember({
              communityId: inviterCommunityId1,
              memberAddress: inviterAddress,
              role: CommunityRole.Owner
            })

            // Add inviter as member of second community
            await components.communitiesDb.addCommunityMember({
              communityId: inviterCommunityId2,
              memberAddress: inviterAddress,
              role: CommunityRole.Member
            })
          })

          afterEach(async () => {
            await components.communitiesDbHelper.forceCommunityMemberRemoval(inviterCommunityId1, [inviterAddress])
            await components.communitiesDbHelper.forceCommunityMemberRemoval(inviterCommunityId2, [inviterAddress])
          })

          describe('and invitee is not a member of any community', () => {
            it('should return 200 status code with only communities where inviter is owner or moderator', async () => {
              const response = await makeRequest(inviterIdentity, `/v1/members/${inviteeAddress}/invites`)
              const body = await response.json()

              expect(response.status).toBe(200)
              expect(body.data).toHaveLength(1)
              
              // Should only return inviterCommunityId1 where inviter is owner
              expect(body.data).toContainEqual({
                id: inviterCommunityId1,
                name: 'Inviter Community 1'
              })

              // Should NOT return inviterCommunityId2 where inviter is only a member
              expect(body.data).not.toContainEqual(
                expect.objectContaining({ id: inviterCommunityId2 })
              )
            })
          })

          describe('and invitee is a member of some communities', () => {
            beforeEach(async () => {
              // Add both inviter and invitee to the shared community
              await components.communitiesDb.addCommunityMember({
                communityId: sharedCommunityId,
                memberAddress: inviterAddress,
                role: CommunityRole.Member
              })

              await components.communitiesDb.addCommunityMember({
                communityId: sharedCommunityId,
                memberAddress: inviteeAddress,
                role: CommunityRole.Member
              })

              // Add invitee to one of the inviter's communities
              await components.communitiesDb.addCommunityMember({
                communityId: inviterCommunityId1,
                memberAddress: inviteeAddress,
                role: CommunityRole.Member
              })
            })

            afterEach(async () => {
              await components.communitiesDbHelper.forceCommunityMemberRemoval(sharedCommunityId, [inviterAddress, inviteeAddress])
              await components.communitiesDbHelper.forceCommunityMemberRemoval(inviterCommunityId1, [inviteeAddress])
            })

            it('should return 200 status code with only communities where inviter is owner/moderator but invitee is not', async () => {
              const response = await makeRequest(inviterIdentity, `/v1/members/${inviteeAddress}/invites`)
              const body = await response.json()

              expect(response.status).toBe(200)
              expect(body.data).toHaveLength(0)
              
              // Should NOT return any communities because:
              // - inviterCommunityId1: invitee is already a member
              // - inviterCommunityId2: inviter is only a member (not owner/moderator)
              // - sharedCommunityId: invitee is already a member
              expect(body.data).not.toContainEqual(
                expect.objectContaining({ id: inviterCommunityId1 })
              )
              expect(body.data).not.toContainEqual(
                expect.objectContaining({ id: inviterCommunityId2 })
              )
              expect(body.data).not.toContainEqual(
                expect.objectContaining({ id: sharedCommunityId })
              )
            })
          })
        })

        describe('and testing role-based filtering specifically', () => {
          let moderatorCommunityId: string
          let memberOnlyCommunityId: string
          let ownerCommunityId: string

          beforeEach(async () => {
            // Create communities for role testing
            const moderatorCommunity = await components.communitiesDb.createCommunity(
              mockCommunity({
                name: 'Moderator Community',
                description: 'Community where inviter is moderator',
                owner_address: '0x7777777777777777777777777777777777777777'
              })
            )
            moderatorCommunityId = moderatorCommunity.id

            const memberOnlyCommunity = await components.communitiesDb.createCommunity(
              mockCommunity({
                name: 'Member Only Community',
                description: 'Community where inviter is only member',
                owner_address: '0x6666666666666666666666666666666666666666'
              })
            )
            memberOnlyCommunityId = memberOnlyCommunity.id

            const ownerCommunity = await components.communitiesDb.createCommunity(
              mockCommunity({
                name: 'Owner Community',
                description: 'Community where inviter is owner',
                owner_address: inviterAddress
              })
            )
            ownerCommunityId = ownerCommunity.id

            // Add inviter with different roles
            await components.communitiesDb.addCommunityMember({
              communityId: moderatorCommunityId,
              memberAddress: inviterAddress,
              role: CommunityRole.Moderator
            })

            await components.communitiesDb.addCommunityMember({
              communityId: memberOnlyCommunityId,
              memberAddress: inviterAddress,
              role: CommunityRole.Member
            })

            await components.communitiesDb.addCommunityMember({
              communityId: ownerCommunityId,
              memberAddress: inviterAddress,
              role: CommunityRole.Owner
            })
          })

          afterEach(async () => {
            await components.communitiesDbHelper.forceCommunityRemoval(moderatorCommunityId)
            await components.communitiesDbHelper.forceCommunityRemoval(memberOnlyCommunityId)
            await components.communitiesDbHelper.forceCommunityRemoval(ownerCommunityId)
          })

          it('should only return communities where inviter is owner or moderator', async () => {
            const response = await makeRequest(inviterIdentity, `/v1/members/${inviteeAddress}/invites`)
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body.data).toHaveLength(2)
            
            // Should return communities where inviter is owner or moderator
            expect(body.data).toContainEqual(
              expect.objectContaining({
                id: moderatorCommunityId,
                name: 'Moderator Community'
              })
            )
            
            expect(body.data).toContainEqual(
              expect.objectContaining({
                id: ownerCommunityId,
                name: 'Owner Community'
              })
            )

            // Should NOT return community where inviter is only a member
            expect(body.data).not.toContainEqual(
              expect.objectContaining({ id: memberOnlyCommunityId })
            )
          })
        })
      })
    })
  })
})
