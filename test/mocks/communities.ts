import {
  CommunityDB,
  ICommunitiesComponent,
  ICommunityBansComponent,
  ICommunityEventsComponent,
  ICommunityBroadcasterComponent,
  ICommunityMembersComponent,
  ICommunityOwnersComponent,
  ICommunityPlacesComponent,
  ICommunityRolesComponent,
  ICommunityThumbnailComponent
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

export function createMockCommunityOwnersComponent({
  getOwnerName = jest.fn()
}: Partial<jest.Mocked<ICommunityOwnersComponent>>): jest.Mocked<ICommunityOwnersComponent> {
  return {
    getOwnerName
  }
}

export function createMockCommunityEventsComponent({
  isCurrentlyHostingEvents = jest.fn()
}: Partial<jest.Mocked<ICommunityEventsComponent>>): jest.Mocked<ICommunityEventsComponent> {
  return {
    isCurrentlyHostingEvents
  }
}

export function createMockCommunityPlacesComponent({
  getPlaces = jest.fn(),
  validateAndAddPlaces = jest.fn(),
  addPlaces = jest.fn(),
  removePlace = jest.fn(),
  updatePlaces = jest.fn(),
  validateOwnership = jest.fn(),
  getPlacesWithPositionsAndWorlds = jest.fn()
}: Partial<jest.Mocked<ICommunityPlacesComponent>>): jest.Mocked<ICommunityPlacesComponent> {
  return {
    getPlaces,
    validateAndAddPlaces,
    addPlaces,
    removePlace,
    updatePlaces,
    validateOwnership,
    getPlacesWithPositionsAndWorlds
  }
}

export function createMockCommunityMembersComponent({
  getCommunityMembers = jest.fn(),
  joinCommunity = jest.fn(),
  leaveCommunity = jest.fn(),
  kickMember = jest.fn(),
  updateMemberRole = jest.fn(),
  getOnlineMembersFromUserCommunities = jest.fn(),
  getOnlineMembersFromCommunity = jest.fn()
}: Partial<jest.Mocked<ICommunityMembersComponent>>): jest.Mocked<ICommunityMembersComponent> {
  return {
    getCommunityMembers,
    joinCommunity,
    leaveCommunity,
    kickMember,
    updateMemberRole,
    getOnlineMembersFromUserCommunities,
    getOnlineMembersFromCommunity
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

export function createMockCommunityThumbnailComponent({
  buildThumbnailUrl = jest.fn(),
  getThumbnail = jest.fn(),
  uploadThumbnail = jest.fn()
}: Partial<jest.Mocked<ICommunityThumbnailComponent>>): jest.Mocked<ICommunityThumbnailComponent> {
  return {
    buildThumbnailUrl,
    getThumbnail,
    uploadThumbnail
  }
}

export function createMockCommunityBroadcasterComponent({
  broadcast = jest.fn()
}: Partial<jest.Mocked<ICommunityBroadcasterComponent>>): jest.Mocked<ICommunityBroadcasterComponent> {
  return {
    broadcast
  }
}
