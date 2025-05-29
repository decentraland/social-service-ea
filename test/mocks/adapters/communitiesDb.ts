import { ICommunitiesDatabaseComponent } from "../../../src/types"

export function createComminitiesDBMockComponent() {
    return {
        communityExists: jest.fn(),
        getCommunityMembers: jest.fn(),
        getCommunityMembersCount: jest.fn()
    } as ICommunitiesDatabaseComponent
}