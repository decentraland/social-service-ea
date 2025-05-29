import { createCommunityMembersComponent } from "../../../src/logic/community-members"
import { CommunityMemberRole, ICommunityMembersComponent } from "../../../src/types"
import { createComminitiesDBMockComponent } from "../../mocks/adapters/communitiesDb"

describe('community members', () => {
    let sut: ICommunityMembersComponent
    describe('when the community does not exist', () => {
        beforeEach(() => {
            const communitiesDbMock = createComminitiesDBMockComponent()
            communitiesDbMock.communityExists = jest.fn().mockResolvedValue(false)
            sut = createCommunityMembersComponent({
                communitiesDb: communitiesDbMock
            })
        })

        it('should return undefined', async () => {
            const result = await sut.getCommunityMembers('1')
            expect(result).toBeUndefined()
        })
    })

    describe('when the community exists', () => {
        const communityId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
        const communityMembers = [
            {
                id: 'b7e2a1c2-3f4d-4e5a-8b6c-1d2e3f4a5b6c',
                communityId,
                memberAddress: '0x1234567890123456789012345678901234567890',
                role: CommunityMemberRole.ADMIN,
                joinedAt: '2025-01-01T00:00:00.000Z'
            },
            {
                id: 't7e2a1c2-3f4d-4e5a-8b6c-1d2e3f4a5b6c',
                communityId,
                memberAddress: '0x1234567890123456789012345678901234567891',
                role: CommunityMemberRole.MEMBER,
                joinedAt: '2025-03-01T00:00:00.000Z'
            }
        ]

        beforeEach(() => {
            const communitiesDbMock = createComminitiesDBMockComponent()
            communitiesDbMock.communityExists = jest.fn().mockResolvedValue(true)
            communitiesDbMock.getCommunityMembersCount = jest.fn().mockResolvedValue(2)
            communitiesDbMock.getCommunityMembers = jest.fn().mockResolvedValue(communityMembers)
            sut = createCommunityMembersComponent({
                communitiesDb: communitiesDbMock
            })
        })

        it('should return the community members', async () => {
            const result = await sut.getCommunityMembers('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d')
            expect(result).toEqual({
                totalMembers: 2,
                members: communityMembers.map(({ communityId, ...rest }) => ({ ...rest }))
            })
        })
    })
})