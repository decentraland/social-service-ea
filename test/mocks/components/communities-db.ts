import { ICommunitiesDatabaseComponent } from '../../../src/types'

export const mockCommunitiesDB: jest.Mocked<ICommunitiesDatabaseComponent> = {
  getCommunity: jest.fn(),
  getCommunityPlaces: jest.fn(),
  getCommunityMembersCount: jest.fn(),
  getCommunities: jest.fn(),
  getCommunitiesCount: jest.fn(),
  getCommunitiesPublicInformation: jest.fn(),
  getPublicCommunitiesCount: jest.fn(),
  createCommunity: jest.fn(),
  deleteCommunity: jest.fn(),
  addCommunityMember: jest.fn(),
  getCommunityMembers: jest.fn(),
  getCommunityMemberRole: jest.fn(),
  communityExists: jest.fn()
}
