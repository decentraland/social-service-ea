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
  ICommunityThumbnailComponent,
  ICommunityComplianceValidatorComponent
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
  deleteCommunity = jest.fn(),
  getCommunityInvites = jest.fn(),
  getAllCommunitiesForModeration = jest.fn()
}: Partial<jest.Mocked<ICommunitiesComponent>>): jest.Mocked<ICommunitiesComponent> {
  return {
    getCommunity,
    getCommunities,
    getCommunitiesPublicInformation,
    getMemberCommunities,
    createCommunity,
    updateCommunity,
    deleteCommunity,
    getCommunityInvites,
    getAllCommunitiesForModeration
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
  validatePermissionToUpdateCommunityPrivacy = jest.fn(),
  validatePermissionToDeleteCommunity = jest.fn(),
  validatePermissionToUpdatePlaces = jest.fn(),
  validatePermissionToLeaveCommunity = jest.fn(),
  validatePermissionToAcceptAndRejectRequests = jest.fn(),
  validatePermissionToViewRequests = jest.fn(),
  validatePermissionToInviteUsers = jest.fn(),
  validatePermissionToEditCommunityName = jest.fn()
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
    validatePermissionToUpdateCommunityPrivacy,
    validatePermissionToDeleteCommunity,
    validatePermissionToUpdatePlaces,
    validatePermissionToLeaveCommunity,
    validatePermissionToAcceptAndRejectRequests,
    validatePermissionToViewRequests,
    validatePermissionToInviteUsers,
    validatePermissionToEditCommunityName
  }
}

export function createMockCommunityOwnersComponent({
  getOwnerName = jest.fn(),
  getOwnersNames = jest.fn()
}: Partial<jest.Mocked<ICommunityOwnersComponent>>): jest.Mocked<ICommunityOwnersComponent> {
  return {
    getOwnerName,
    getOwnersNames
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
  getOnlineMembersFromCommunity = jest.fn(),
  aggregateWithProfiles = jest.fn()
}: Partial<jest.Mocked<ICommunityMembersComponent>>): jest.Mocked<ICommunityMembersComponent> {
  return {
    getCommunityMembers,
    joinCommunity,
    leaveCommunity,
    kickMember,
    updateMemberRole,
    getOnlineMembersFromUserCommunities,
    getOnlineMembersFromCommunity,
    aggregateWithProfiles
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
  getThumbnails = jest.fn(),
  uploadThumbnail = jest.fn()
}: Partial<jest.Mocked<ICommunityThumbnailComponent>>): jest.Mocked<ICommunityThumbnailComponent> {
  return {
    buildThumbnailUrl,
    getThumbnail,
    getThumbnails,
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

export function createMockCommunityComplianceValidatorComponent({
  validateCommunityContent = jest.fn()
}: Partial<jest.Mocked<ICommunityComplianceValidatorComponent>>): jest.Mocked<ICommunityComplianceValidatorComponent> {
  return {
    validateCommunityContent
  }
}
