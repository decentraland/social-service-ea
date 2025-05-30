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
  deleteCommunity: jest.fn()
}
