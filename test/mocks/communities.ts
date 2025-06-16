import {
  CommunityDB,
  ICommunitiesComponent,
  ICommunityBansComponent,
  ICommunityMembersComponent,
  ICommunityPlacesComponent,
  ICommunityRolesComponent
} from '../../src/logic/community'

export const mockCommunity = (community: Partial<CommunityDB> = {}): CommunityDB => ({
  ...community,
  name: community.name || 'Mock Community',
  description: community.description || 'Mock Description',
  owner_address: community.owner_address || '0x123',
  private: community.private || false,
  active: community.active || true
})

export function createMockCommunitiesComponent({
  getCommunity = jest.fn(),
  getCommunities = jest.fn(),
  getCommunitiesPublicInformation = jest.fn(),
  getMemberCommunities = jest.fn(),
  createCommunity = jest.fn(),
  updateCommunity = jest.fn(),
  deleteCommunity = jest.fn()
}: Partial<jest.Mocked<ICommunitiesComponent>>): jest.Mocked<ICommunitiesComponent> {
  return {
    getCommunity,
    getCommunities,
    getCommunitiesPublicInformation,
    getMemberCommunities,
    createCommunity,
    updateCommunity,
    deleteCommunity
  }
}

export function createMockCommunityRolesComponent({
  validatePermissionToKickMemberFromCommunity = jest.fn(),
  validatePermissionToBanMemberFromCommunity = jest.fn(),
  validatePermissionToUnbanMemberFromCommunity = jest.fn(),
  validatePermissionToUpdateMemberRole = jest.fn(),
  validatePermissionToGetBannedMembers = jest.fn(),
  validatePermissionToAddPlacesToCommunity = jest.fn(),
  validatePermissionToRemovePlacesFromCommunity = jest.fn(),
  validatePermissionToEditCommunity = jest.fn(),
  validatePermissionToDeleteCommunity = jest.fn(),
  validatePermissionToUpdatePlaces = jest.fn(),
  validatePermissionToLeaveCommunity = jest.fn()
}: Partial<jest.Mocked<ICommunityRolesComponent>>): jest.Mocked<ICommunityRolesComponent> {
  return {
    validatePermissionToKickMemberFromCommunity,
    validatePermissionToBanMemberFromCommunity,
    validatePermissionToUnbanMemberFromCommunity,
    validatePermissionToUpdateMemberRole,
    validatePermissionToGetBannedMembers,
    validatePermissionToAddPlacesToCommunity,
    validatePermissionToRemovePlacesFromCommunity,
    validatePermissionToEditCommunity,
    validatePermissionToDeleteCommunity,
    validatePermissionToUpdatePlaces,
    validatePermissionToLeaveCommunity
  }
}

export function createMockCommunityPlacesComponent({
  getPlaces = jest.fn(),
  validateAndAddPlaces = jest.fn(),
  addPlaces = jest.fn(),
  removePlace = jest.fn(),
  updatePlaces = jest.fn(),
  validateOwnership = jest.fn()
}: Partial<jest.Mocked<ICommunityPlacesComponent>>): jest.Mocked<ICommunityPlacesComponent> {
  return {
    getPlaces,
    validateAndAddPlaces,
    addPlaces,
    removePlace,
    updatePlaces,
    validateOwnership
  }
}

export function createMockCommunityMembersComponent({
  getCommunityMembers = jest.fn(),
  getMembersFromPublicCommunity = jest.fn(),
  joinCommunity = jest.fn(),
  leaveCommunity = jest.fn(),
  kickMember = jest.fn(),
  updateMemberRole = jest.fn()
}: Partial<jest.Mocked<ICommunityMembersComponent>>): jest.Mocked<ICommunityMembersComponent> {
  return {
    getCommunityMembers,
    getMembersFromPublicCommunity,
    joinCommunity,
    leaveCommunity,
    kickMember,
    updateMemberRole
  }
}

export function createMockCommunityBansComponent({
  getBannedMembers = jest.fn(),
  banMember = jest.fn(),
  unbanMember = jest.fn()
}: Partial<jest.Mocked<ICommunityBansComponent>>): jest.Mocked<ICommunityBansComponent> {
  return {
    getBannedMembers,
    banMember,
    unbanMember
  }
}
