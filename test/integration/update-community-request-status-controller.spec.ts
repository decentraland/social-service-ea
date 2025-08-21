import { CommunityRequestType, CommunityRequestStatus } from '../../src/logic/community'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'
import { CommunityRole } from '../../src/types'

test('Update Community Request Status Controller', function ({ components, spyComponents }) {
  let makeRequest: any

  describe('when the request is not signed', () => {
    let communityId: string
    let requestId: string

    beforeEach(async () => {
      makeRequest = components.localHttpFetch.fetch
      communityId = '00000000-0000-0000-0000-000000000000'
      requestId = '11111111-1111-1111-1111-111111111111'
    })

    it('should return a 400 status code', async () => {
      const response = await makeRequest(`/v1/communities/${communityId}/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intention: 'accepted' })
      })
      expect(response.status).toBe(400)
    })
  })

  describe('when the request is signed', () => {
    let identity: Identity
    let userAddress: string

    beforeEach(async () => {
      makeRequest = makeAuthenticatedRequest(components)
      identity = await createTestIdentity()
      userAddress = identity.realAccount.address.toLowerCase()
    })

    describe('when the community does not exist', () => {
      let nonExistentCommunityId: string
      let requestId: string

      beforeEach(async () => {
        nonExistentCommunityId = '00000000-0000-0000-0000-000000000000'
        requestId = '11111111-1111-1111-1111-111111111111'
      })

      it('should return a 404 status code', async () => {
        const response = await makeRequest(identity, `/v1/communities/${nonExistentCommunityId}/requests/${requestId}`, 'PATCH', { intention: 'accepted' })

        expect(response.status).toBe(404)
      })
    })

    describe('when the community exists', () => {
      let communityId: string
      let ownerIdentity: Identity
      let ownerAddress: string

      beforeEach(async () => {
        ownerIdentity = await createTestIdentity()
        ownerAddress = ownerIdentity.realAccount.address.toLowerCase()

        // Create community with the owner
        const result = await components.communitiesDb.createCommunity(
          mockCommunity({
            name: 'Test Community',
            description: 'Test Description',
            owner_address: ownerAddress,
            private: false
          })
        )
        communityId = result.id

        // Add owner as member with Owner role
        await components.communitiesDb.addCommunityMember({
          communityId,
          memberAddress: ownerAddress,
          role: CommunityRole.Owner
        })
      })

      afterEach(async () => {
        await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [ownerAddress])
        await components.communitiesDbHelper.forceCommunityRemoval(communityId)
      })

      describe('when the request does not exist', () => {
        let nonExistentRequestId: string

        beforeEach(async () => {
          nonExistentRequestId = '11111111-1111-1111-1111-111111111111'
        })

        it('should return a 404 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/requests/${nonExistentRequestId}`, 'PATCH', { intention: 'accepted' })
          expect(response.status).toBe(404)
        })
      })

      describe('when the request exists but is not pending', () => {
        let requestId: string
        let memberAddress: string

        beforeEach(async () => {
          memberAddress = '0x1111111111111111111111111111111111111111'
          
          // Create a request
          const request = await components.communitiesDb.createCommunityRequest(
            communityId,
            memberAddress,
            CommunityRequestType.RequestToJoin
          )
          requestId = request.id

          // Update the request status to accepted (non-pending) using helper
          await components.communitiesDbHelper.updateCommunityRequestStatus(requestId, CommunityRequestStatus.Accepted)
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityRequestRemoval(requestId)
        })

        it('should return a 404 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/requests/${requestId}`, 'PATCH', { intention: 'accepted' })
          expect(response.status).toBe(404)
        })
      })

      describe('when the intention is invalid', () => {
        let requestId: string
        let memberAddress: string

        beforeEach(async () => {
          memberAddress = '0x1111111111111111111111111111111111111111'
          
          const request = await components.communitiesDb.createCommunityRequest(
            communityId,
            memberAddress,
            CommunityRequestType.RequestToJoin
          )
          requestId = request.id
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityRequestRemoval(requestId)
        })

        describe('and intention is "pending"', () => {
          let intention: CommunityRequestStatus

          beforeEach(async () => {
            intention = CommunityRequestStatus.Pending
          })

          it('should return a 400 status code with validation message', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/requests/${requestId}`, 'PATCH', { intention })
            expect(response.status).toBe(400)
          })
        })

        describe('and intention is missing', () => {
          it('should return a 400 status code with validation message', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/requests/${requestId}`, 'PATCH', {})
            expect(response.status).toBe(400)
          })
        })

        describe('and intention is not a valid enum value', () => {
          it('should return a 400 status code with validation message', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/requests/${requestId}`, 'PATCH', { intention: 'invalid' })
            expect(response.status).toBe(400)
          })
        })
      })

      describe('when the request exists and is pending', () => {
        describe('when the request is an invite', () => {
          let inviteRequestId: string
          let invitedUserIdentity: Identity
          let invitedUserAddress: string

          beforeEach(async () => {
            invitedUserIdentity = await createTestIdentity()
            invitedUserAddress = invitedUserIdentity.realAccount.address.toLowerCase()

            // Create an invite request
            const request = await components.communitiesDb.createCommunityRequest(
              communityId,
              invitedUserAddress,
              CommunityRequestType.Invite
            )
            inviteRequestId = request.id
          })

          afterEach(async () => {
            // Clean up any community members that might have been added
            await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [invitedUserAddress])
            // Clean up request if it still exists
            await components.communitiesDbHelper.forceCommunityRequestRemoval(inviteRequestId)
          })

          describe('when the caller is the invited user', () => {
            describe('and the intention is "accepted"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Accepted
              })

              it('should return a 204 status code', async () => {
                const response = await makeRequest(invitedUserIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(204)
              })

              it('should add the user to the community', async () => {
                await makeRequest(invitedUserIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })

                const memberRole = await components.communitiesDb.getCommunityMemberRole(communityId, invitedUserAddress)
                expect(memberRole).toBe(CommunityRole.Member)
              })

              it('should remove the request', async () => {
                await makeRequest(invitedUserIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })

                const request = await components.communitiesDb.getCommunityRequest(inviteRequestId)
                expect(request).toBeUndefined()
              })
            })

            describe('and the intention is "rejected"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Rejected
              })

              it('should return a 204 status code', async () => {
                const response = await makeRequest(invitedUserIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(204)
              })

              it('should not add the user to the community', async () => {
                await makeRequest(invitedUserIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })

                const memberRole = await components.communitiesDb.getCommunityMemberRole(communityId, invitedUserAddress)
                expect(memberRole).toBe(CommunityRole.None)
              })

              it('should remove the request', async () => {
                await makeRequest(invitedUserIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })

                const request = await components.communitiesDb.getCommunityRequest(inviteRequestId)
                expect(request).toBeUndefined()
              })
            })

            describe('and the intention is "cancelled"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Cancelled
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(invitedUserIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })
          })

          describe('when the caller has community owner privileges', () => {
            describe('and the intention is "accepted"', () => {
              it('should return a 401 status code', async () => {
                const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention: CommunityRequestStatus.Accepted })
                expect(response.status).toBe(401)
              })
            })

            describe('and the intention is "rejected"', () => {
              it('should return a 401 status code', async () => {
                const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention: CommunityRequestStatus.Rejected })
                expect(response.status).toBe(401)
              })
            })

            describe('and the intention is "cancelled"', () => {
              it('should return a 204 status code', async () => {
                const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention: CommunityRequestStatus.Cancelled })
                expect(response.status).toBe(204)
              })

              it('should not add the user to the community', async () => {
                await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention: CommunityRequestStatus.Cancelled })

                const memberRole = await components.communitiesDb.getCommunityMemberRole(communityId, invitedUserAddress)
                expect(memberRole).toBe(CommunityRole.None)
              })

              it('should remove the request', async () => {
                await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention: CommunityRequestStatus.Cancelled })

                const request = await components.communitiesDb.getCommunityRequest(inviteRequestId)
                expect(request).toBeUndefined()
              })
            })
          })

          describe('when the caller has community moderator privileges', () => {
            let moderatorIdentity: Identity
            let moderatorAddress: string

            beforeEach(async () => {
              moderatorIdentity = await createTestIdentity()
              moderatorAddress = moderatorIdentity.realAccount.address.toLowerCase()

              // Add moderator as member with Moderator role
              await components.communitiesDb.addCommunityMember({
                communityId,
                memberAddress: moderatorAddress,
                role: CommunityRole.Moderator
              })
            })

            afterEach(async () => {
              await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [moderatorAddress])
            })

            describe('and the intention is "accepted"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Accepted
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })

            describe('and the intention is "rejected"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Rejected
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })

            describe('and the intention is "cancelled"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Cancelled
              })

              it('should return a 204 status code', async () => {
                const response = await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(204)
              })

              it('should not add the user to the community', async () => {
                await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })

                const memberRole = await components.communitiesDb.getCommunityMemberRole(communityId, invitedUserAddress)
                expect(memberRole).toBe(CommunityRole.None)
              })

              it('should remove the request', async () => {
                await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })

                const request = await components.communitiesDb.getCommunityRequest(inviteRequestId)
                expect(request).toBeUndefined()
              })
            })
          })

          describe('when the caller has no community privileges', () => {
            let regularUserIdentity: Identity

            beforeEach(async () => {
              regularUserIdentity = await createTestIdentity()
            })

            describe('and the intention is "accepted"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Accepted
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(regularUserIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })

            describe('and the intention is "rejected"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Rejected
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(regularUserIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })

            describe('and the intention is "cancelled"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Cancelled
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(regularUserIdentity, `/v1/communities/${communityId}/requests/${inviteRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })
          })
        })

        describe('when the request is a request_to_join', () => {
          let joinRequestId: string
          let requestingUserIdentity: Identity
          let requestingUserAddress: string

          beforeEach(async () => {
            requestingUserIdentity = await createTestIdentity()
            requestingUserAddress = requestingUserIdentity.realAccount.address.toLowerCase()

            // Create a request_to_join request
            const request = await components.communitiesDb.createCommunityRequest(
              communityId,
              requestingUserAddress,
              CommunityRequestType.RequestToJoin
            )
            joinRequestId = request.id
          })

          afterEach(async () => {
            // Clean up any community members that might have been added
            await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [requestingUserAddress])
            // Clean up request if it still exists
            await components.communitiesDbHelper.forceCommunityRequestRemoval(joinRequestId)
          })

          describe('when the caller is the requesting user', () => {
            describe('and the intention is "accepted"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Accepted
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(requestingUserIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })

            describe('and the intention is "rejected"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Rejected
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(requestingUserIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })

            describe('and the intention is "cancelled"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Cancelled
              })

              it('should return a 204 status code', async () => {
                const response = await makeRequest(requestingUserIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(204)
              })

              it('should not add the user to the community', async () => {
                await makeRequest(requestingUserIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })

                const memberRole = await components.communitiesDb.getCommunityMemberRole(communityId, requestingUserAddress)
                expect(memberRole).toBe(CommunityRole.None)
              })

              it('should remove the request', async () => {
                await makeRequest(requestingUserIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })

                const request = await components.communitiesDb.getCommunityRequest(joinRequestId)
                expect(request).toBeUndefined()
              })
            })
          })

          describe('when the caller has community owner privileges', () => {
            describe('and the intention is "accepted"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Accepted
              })

              it('should return a 204 status code', async () => {
                const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(204)
              })

              it('should add the user to the community', async () => {
                await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })

                const memberRole = await components.communitiesDb.getCommunityMemberRole(communityId, requestingUserAddress)
                expect(memberRole).toBe(CommunityRole.Member)
              })

              it('should remove the request', async () => {
                await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })

                const request = await components.communitiesDb.getCommunityRequest(joinRequestId)
                expect(request).toBeUndefined()
              })
            })

            describe('and the intention is "rejected"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Rejected
              })

              it('should return a 204 status code', async () => {
                const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(204)
              })

              it('should not add the user to the community', async () => {
                await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })

                const memberRole = await components.communitiesDb.getCommunityMemberRole(communityId, requestingUserAddress)
                expect(memberRole).toBe(CommunityRole.None)
              })

              it('should remove the request', async () => {
                await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })

                const request = await components.communitiesDb.getCommunityRequest(joinRequestId)
                expect(request).toBeUndefined()
              })
            })

            describe('and the intention is "cancelled"', () => {
              it('should return a 401 status code', async () => {
                const response = await makeRequest(ownerIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention: CommunityRequestStatus.Cancelled })
                expect(response.status).toBe(401)
              })
            })
          })

          describe('when the caller has community moderator privileges', () => {
            let moderatorIdentity: Identity
            let moderatorAddress: string

            beforeEach(async () => {
              moderatorIdentity = await createTestIdentity()
              moderatorAddress = moderatorIdentity.realAccount.address.toLowerCase()

              // Add moderator as member with Moderator role
              await components.communitiesDb.addCommunityMember({
                communityId,
                memberAddress: moderatorAddress,
                role: CommunityRole.Moderator
              })
            })

            afterEach(async () => {
              await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [moderatorAddress])
            })

            describe('and the intention is "accepted"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Accepted
              })

              it('should return a 204 status code', async () => {
                const response = await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(204)
              })

              it('should add the user to the community', async () => {
                await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })

                const memberRole = await components.communitiesDb.getCommunityMemberRole(communityId, requestingUserAddress)
                expect(memberRole).toBe(CommunityRole.Member)
              })

              it('should remove the request', async () => {
                await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })

                const request = await components.communitiesDb.getCommunityRequest(joinRequestId)
                expect(request).toBeUndefined()
              })
            })

            describe('and the intention is "rejected"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Rejected
              })

              it('should return a 204 status code', async () => {
                const response = await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(204)
              })

              it('should not add the user to the community', async () => {
                await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })

                const memberRole = await components.communitiesDb.getCommunityMemberRole(communityId, requestingUserAddress)
                expect(memberRole).toBe(CommunityRole.None)
              })

              it('should remove the request', async () => {
                await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })

                const request = await components.communitiesDb.getCommunityRequest(joinRequestId)
                expect(request).toBeUndefined()
              })
            })

            describe('and the intention is "cancelled"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Cancelled
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(moderatorIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })
          })

          describe('when the caller has no community privileges', () => {
            let regularUserIdentity: Identity

            beforeEach(async () => {
              regularUserIdentity = await createTestIdentity()
            })

            describe('and the intention is "accepted"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Accepted
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(regularUserIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })

            describe('and the intention is "rejected"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Rejected
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(regularUserIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })

            describe('and the intention is "cancelled"', () => {
              let intention: CommunityRequestStatus

              beforeEach(async () => {
                intention = CommunityRequestStatus.Cancelled
              })

              it('should return a 401 status code', async () => {
                const response = await makeRequest(regularUserIdentity, `/v1/communities/${communityId}/requests/${joinRequestId}`, 'PATCH', { intention })
                expect(response.status).toBe(401)
              })
            })
          })
        })
      })
    })
  })
})
