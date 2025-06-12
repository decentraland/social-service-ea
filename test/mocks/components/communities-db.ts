import { ICommunitiesDatabaseComponent } from '../../../src/types'

export const mockCommunitiesDB: jest.Mocked<ICommunitiesDatabaseComponent> = {
  getCommunity: jest.fn(),
  getCommunityPlaces: jest.fn(),
  getCommunityPlacesCount: jest.fn(),
  getCommunityMembersCount: jest.fn(),
  getCommunities: jest.fn(),
  getCommunitiesCount: jest.fn(),
  getCommunitiesPublicInformation: jest.fn(),
  getPublicCommunitiesCount: jest.fn(),
  getMemberCommunities: jest.fn(),
  createCommunity: jest.fn(),
  deleteCommunity: jest.fn(),
  addCommunityMember: jest.fn(),
  getCommunityMembers: jest.fn(),
  getCommunityMemberRole: jest.fn(),
  isMemberOfCommunity: jest.fn(),
  communityExists: jest.fn(),
  getCommunityMemberRoles: jest.fn(),
  kickMemberFromCommunity: jest.fn(),
  banMemberFromCommunity: jest.fn(),
  unbanMemberFromCommunity: jest.fn(),
  isMemberBanned: jest.fn(),
  getBannedMembers: jest.fn(),
  getBannedMembersCount: jest.fn(),
  updateMemberRole: jest.fn()
}
