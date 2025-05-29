import { randomUUID } from 'node:crypto'
import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { createMockProfile } from '../mocks/profile'
import { parseExpectedFriends } from '../mocks/friend'
import { mockCommunity } from '../mocks/community'
import { createOrUpsertActiveFriendship, removeFriendship } from './utils/friendships'
import SQL from 'sql-template-strings'

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

      spyComponents.catalystClient.getProfiles.mockResolvedValue([
        createMockProfile(friendAddress1),
        createMockProfile(friendAddress2)
      ])
    })

    describe('and the request is not signed', () => {
      it.todo('should respond with a 200 status code and the public communities')
    })

    describe('and the request is signed', () => {
      beforeEach(async () => {
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

        // Add members to the communities using SQL directly since there's no addMember method
        // TODO: Add a method to add members to the communities db
        await components.pg.query(SQL`
          INSERT INTO community_members (id, community_id, member_address, role)
          VALUES 
            (${randomUUID()}, ${communityId1}, ${friendAddress1}, ${CommunityRole.Member}),
            (${randomUUID()}, ${communityId1}, ${friendAddress2}, ${CommunityRole.Member}),
            (${randomUUID()}, ${communityId2}, ${friendAddress1}, ${CommunityRole.Member})
        `)

        friendshipId1 = await createOrUpsertActiveFriendship(components.friendsDb, [address, friendAddress1])
        friendshipId2 = await createOrUpsertActiveFriendship(components.friendsDb, [address, friendAddress2])
      })

      afterEach(async () => {
        await components.pg.query(SQL`
          DELETE FROM communities WHERE id IN (${communityId1}, ${communityId2})
        `)
        await components.pg.query(SQL`
          DELETE FROM community_members WHERE community_id IN (${communityId1}, ${communityId2})
        `)
        await removeFriendship(components.friendsDb, friendshipId1, address)
        await removeFriendship(components.friendsDb, friendshipId2, address)
      })

      it('should respond with a 200 status code and the communities', async () => {
        const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&search=test')
        const body = await response.json()

        const friend1Profile = createMockProfile(friendAddress1)
        const friend2Profile = createMockProfile(friendAddress2)

        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: {
            results: expect.arrayContaining([
              expect.objectContaining({
                id: communityId1,
                name: 'Test Community 1',
                description: 'Test Description 1',
                ownerAddress: address,
                privacy: 'public',
                active: true,
                role: CommunityRole.None,
                membersCount: 2,
                friends: expect.arrayContaining([parseFriend(friend1Profile), parseFriend(friend2Profile)]),
                isLive: false
              }),
              expect.objectContaining({
                id: communityId2,
                name: 'Test Community 2',
                description: 'Test Description 2',
                ownerAddress: address,
                privacy: 'public',
                active: true,
                role: CommunityRole.None,
                membersCount: 1,
                friends: expect.arrayContaining([parseFriend(friend1Profile)]),
                isLive: false
              })
            ]),
            total: 2,
            page: 1,
            pages: 1,
            limit: 10
          }
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
    })
  })
})
