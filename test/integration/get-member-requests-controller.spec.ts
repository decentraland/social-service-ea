import { CommunityRequestType } from '../../src/logic/community'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'
import { CommunityRole } from '../../src/types'

test('Get Member Requests Controller', function ({ components, spyComponents }) {
  let makeRequest: any

  describe('when getting member requests', () => {
    let unrelatedUserAddress: string

    beforeEach(async () => {
      unrelatedUserAddress = '0x9876543210987654321098765432109876543210'
    })

    describe('and the request is not signed', () => {
      beforeEach(async () => {
        makeRequest = components.localHttpFetch.fetch
      })

      it('should return a 400 status code', async () => {
        const response = await makeRequest(`/v1/members/${unrelatedUserAddress}/requests`)
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      let identity: Identity
      let address: string

      beforeEach(async () => {
        makeRequest = makeAuthenticatedRequest(components)
        identity = await createTestIdentity()
        address = identity.realAccount.address.toLowerCase()
      })

      describe('and requesting another user\'s requests', () => {
        it('should respond with a 401 status code', async () => {
          const response = await makeRequest(identity, `/v1/members/${unrelatedUserAddress}/requests`)
          expect(response.status).toBe(401)
        })
      })

      describe('and requesting own requests', () => {
        let ownerAddress: string
        let communityId1: string
        let communityId2: string
        let unlistedCommunityId: string
        let queryParameters: string

        beforeEach(async () => {
          queryParameters = `?limit=10&offset=0`
          ownerAddress = identity.realAccount.address.toLowerCase()

          // Owner names are required by the aggregated response
          spyComponents.communityOwners.getOwnersNames.mockResolvedValue({
            [ownerAddress]: 'Test Owner'
          })

          const result1 = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Test Community 1',
              description: 'Test Description 1',
              owner_address: ownerAddress,
              private: false
            })
          )
          communityId1 = result1.id

          const result2 = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Test Community 2',
              description: 'Test Description 2',
              owner_address: ownerAddress,
              private: true
            })
          )
          communityId2 = result2.id

          const unlistedResult = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Unlisted Community',
              description: 'Unlisted Description',
              owner_address: ownerAddress,
              private: false,
              unlisted: true
            })
          )
          unlistedCommunityId = unlistedResult.id

          // Owners are members too
          await components.communitiesDb.addCommunityMember({
            communityId: communityId1,
            memberAddress: ownerAddress,
            role: CommunityRole.Owner
          })
          await components.communitiesDb.addCommunityMember({
            communityId: communityId2,
            memberAddress: ownerAddress,
            role: CommunityRole.Owner
          })
          await components.communitiesDb.addCommunityMember({
            communityId: unlistedCommunityId,
            memberAddress: ownerAddress,
            role: CommunityRole.Owner
          })

          // Create pending requests for the target address
          await components.communitiesDb.createCommunityRequest(communityId1, address, CommunityRequestType.Invite)
          await components.communitiesDb.createCommunityRequest(
            communityId2,
            address,
            CommunityRequestType.RequestToJoin
          )
          await components.communitiesDb.createCommunityRequest(
            unlistedCommunityId,
            address,
            CommunityRequestType.Invite
          )
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId1, [ownerAddress])
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId2, [ownerAddress])
          await components.communitiesDbHelper.forceCommunityMemberRemoval(unlistedCommunityId, [ownerAddress])
          await components.communitiesDbHelper.forceCommunityRemoval(communityId1)
          await components.communitiesDbHelper.forceCommunityRemoval(communityId2)
          await components.communitiesDbHelper.forceCommunityRemoval(unlistedCommunityId)
        })

        it('should return 200 status code and return aggregated requests with community information', async () => {
          const response = await makeRequest(identity, `/v1/members/${address}/requests${queryParameters}`)
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results.length).toBe(3)

          const invite = body.data.results.find((r: any) => r.communityId === communityId1)
          const requestToJoin = body.data.results.find((r: any) => r.communityId === communityId2)
          const unlistedInvite = body.data.results.find((r: any) => r.communityId === unlistedCommunityId)

          expect(invite).toEqual(
            expect.objectContaining({
              communityId: communityId1,
              name: 'Test Community 1',
              description: 'Test Description 1',
              ownerAddress: ownerAddress,
              ownerName: 'Test Owner',
              type: CommunityRequestType.Invite
            })
          )
          expect(requestToJoin).toEqual(
            expect.objectContaining({
              communityId: communityId2,
              name: 'Test Community 2',
              description: 'Test Description 2',
              ownerAddress: ownerAddress,
              ownerName: 'Test Owner',
              type: CommunityRequestType.RequestToJoin
            })
          )
          expect(unlistedInvite).toEqual(
            expect.objectContaining({
              communityId: unlistedCommunityId,
              name: 'Unlisted Community',
              description: 'Unlisted Description',
              ownerAddress: ownerAddress,
              ownerName: 'Test Owner',
              type: CommunityRequestType.Invite
            })
          )
          expect(body.data.total).toBe(3)
          expect(body.data.page).toBe(1)
          expect(body.data.pages).toBe(1)
          expect(body.data.limit).toBe(10)
        })

        describe('and filtering by invite type', () => {
          beforeEach(async () => { 
            queryParameters = `?type=invite`
          })

          it('should return only invites', async () => {
            const response = await makeRequest(identity, `/v1/members/${address}/requests${queryParameters}`)
            const body = await response.json()
            expect(response.status).toBe(200)
            expect(body.data.results.length).toBe(2)
            const inviteCommunityIds = body.data.results.map((result: any) => result.communityId)
            expect(inviteCommunityIds).toEqual(expect.arrayContaining([communityId1, unlistedCommunityId]))
            expect(body.data.results).toEqual(
              expect.arrayContaining([expect.objectContaining({ type: CommunityRequestType.Invite })])
            )
          })
        })

        describe('and filtering by request type', () => {
          beforeEach(async () => { 
            queryParameters = `?type=request_to_join`
          })

          it('should return only requests to join', async () => {
            const response = await makeRequest(identity, `/v1/members/${address}/requests${queryParameters}`)
            const body = await response.json()
            expect(response.status).toBe(200)
            expect(body.data.results.length).toBe(1)
            expect(body.data.results[0]).toEqual(
              expect.objectContaining({ communityId: communityId2, type: CommunityRequestType.RequestToJoin })
            )
          })
        })

        describe('and using pagination', () => {
          beforeEach(async () => { 
            queryParameters = `?limit=1&offset=0`
          })

          it('should paginate results with limit and offset', async () => {
            const response = await makeRequest(identity, `/v1/members/${address}/requests${queryParameters}`)
            const body = await response.json()

            expect(response.status).toBe(200)
            expect(body.data.results.length).toBe(1)
            expect(body.data.page).toBe(1)
            expect(body.data.pages).toBe(3)
            expect(body.data.total).toBe(3)
            expect(body.data.limit).toBe(1)
          })
        })
      })
    })
  })
})


