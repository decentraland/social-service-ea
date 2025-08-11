import { randomUUID } from 'crypto'
import {
  Community,
  CommunityNotFoundError,
  CommunityPrivacyEnum,
  CommunityRequestStatus,
  CommunityRequestType,
  ICommunityRequestsComponent,
  InvalidCommunityRequestError,
  MemberRequest
} from '../../../src/logic/community'
import { createCommunityRequestsComponent } from '../../../src/logic/community/requests'
import { mockLogs } from '../../mocks/components'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { CommunityRole } from '../../../src/types'

describe('Community Requests Component', () => {
  let communityRequestsComponent: ICommunityRequestsComponent
  let type: CommunityRequestType
  let userAddress: string

  beforeEach(() => {
    communityRequestsComponent = createCommunityRequestsComponent({
      communitiesDb: mockCommunitiesDB,
      logs: mockLogs
    })

    userAddress = '0x1234567890123456789012345678901234567890'
  })

  describe('when community does not exist', () => {
    beforeEach(() => {
      mockCommunitiesDB.getCommunity.mockResolvedValueOnce(null)
    })

    it('should throw a CommunityNotFoundError', () => {
      expect(
        communityRequestsComponent.createCommunityRequest(randomUUID(), userAddress, CommunityRequestType.RequestToJoin)
      ).rejects.toThrow(CommunityNotFoundError)
    })
  })

  describe('when community exists', () => {
    let community: Community & { role: CommunityRole }
    let expectedCreatedRequest: MemberRequest
    beforeEach(() => {
      community = {
        id: randomUUID(),
        name: 'Mock Community',
        description: 'Mock Description',
        ownerAddress: userAddress,
        privacy: CommunityPrivacyEnum.Public,
        active: true,
        role: CommunityRole.None
      }
      mockCommunitiesDB.getCommunity.mockResolvedValueOnce(community)
      mockCommunitiesDB.createCommunityRequest.mockImplementation(() => {
        return Promise.resolve(expectedCreatedRequest)
      })
    })

    describe('and community is public', () => {
      beforeEach(() => {
        community.privacy = CommunityPrivacyEnum.Public
      })
      
      describe('and request type is RequestToJoin', () => { 
        beforeEach(() => {
          type = CommunityRequestType.RequestToJoin
        })

        it('should throw an InvalidCommunityRequestError with correct message', () => {
          expect(communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)).rejects.toThrow(
            `Public communities do not accept requests to join`
          )
        })

        it('should throw an InvalidCommunityRequestError', () => {
          expect(communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)).rejects.toThrow(
            InvalidCommunityRequestError
          )
        })
      })

      describe('and request type is Invite', () => {
        beforeEach(() => {
          type = CommunityRequestType.Invite
          expectedCreatedRequest = {
            id: randomUUID(),
            communityId: community.id,
            memberAddress: userAddress,
            type,
            status: CommunityRequestStatus.Pending
          }
        })
        
        describe('and user do not belong to community', () => {
          beforeEach(() => {
            community.role = CommunityRole.None
          })
          
          describe('and there are no pending requests for the user', () => {
            beforeEach(() => {
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([])
            })
            
            it('should create and return the request as pending', async () => {
              const result = await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              expect(result).toEqual({
                id: expect.any(String),
                communityId: community.id,
                memberAddress: userAddress,
                type,
                status: CommunityRequestStatus.Pending
              })
              expect(mockCommunitiesDB.createCommunityRequest).toHaveBeenCalledWith(community.id, userAddress, type)
            })
          })

          describe('and there is a pending invite for the user', () => {
            beforeEach(() => {
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([expectedCreatedRequest])
            })
            
            it('should throw an InvalidCommunityRequestError with correct message', () => {
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow('Request already exists')
            })

            it('should throw an InvalidCommunityRequestError', () => {
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow(InvalidCommunityRequestError)
            })
          })
        })

        describe('and user already belongs to community', () => {
          beforeEach(() => {
            community.role = CommunityRole.Member
          })
          
          it('should throw an InvalidCommunityRequestError with correct message', () => {
            expect(communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)).rejects.toThrow(
              `User cannot join since it is already a member of the community: ${community.name}`
            )
          })

          it('should throw an InvalidCommunityRequestError', () => {
            expect(communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)).rejects.toThrow(
              InvalidCommunityRequestError
            )
          })
        })
      })
    })

    describe('and community is private', () => {
      beforeEach(() => {
        community.privacy = CommunityPrivacyEnum.Private
      })

      describe('and request type is RequestToJoin', () => {
        beforeEach(() => {
          type = CommunityRequestType.RequestToJoin
          expectedCreatedRequest = {
            id: randomUUID(),
            communityId: community.id,
            memberAddress: userAddress,
            type,
            status: CommunityRequestStatus.Pending
          }
        })

        describe('and user do not belong to community', () => {
          beforeEach(() => {
            community.role = CommunityRole.None
          })

          describe('and there are no pending requests for the user', () => {
            beforeEach(() => {
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([])
            })

            it('should create and return the request as pending', async () => {
              const result = await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              expect(result).toEqual({
                id: expect.any(String),
                communityId: community.id,
                memberAddress: userAddress,
                type,
                status: CommunityRequestStatus.Pending
              })
              expect(mockCommunitiesDB.createCommunityRequest).toHaveBeenCalledWith(community.id, userAddress, type)
            })
          })

          describe('and there is a pending request_to_join for the user', () => {
            beforeEach(() => {
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([expectedCreatedRequest])
            })

            it('should throw an InvalidCommunityRequestError with correct message', () => {
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow('Request already exists')
            })

            it('should throw an InvalidCommunityRequestError', () => {
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow(InvalidCommunityRequestError)
            })
          })
        })

        describe('and user already belongs to community', () => {
          beforeEach(() => {
            community.role = CommunityRole.Member
          })

          it('should throw an InvalidCommunityRequestError with correct message', () => {
            expect(communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)).rejects.toThrow(
              `User cannot join since it is already a member of the community: ${community.name}`
            )
          })

          it('should throw an InvalidCommunityRequestError', () => {
            expect(communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)).rejects.toThrow(
              InvalidCommunityRequestError
            )
          })
        })
      })

      describe('and request type is Invite', () => {
        beforeEach(() => {
          type = CommunityRequestType.Invite
          expectedCreatedRequest = {
            id: randomUUID(),
            communityId: community.id,
            memberAddress: userAddress,
            type,
            status: CommunityRequestStatus.Pending
          }
        })

        describe('and user do not belong to community', () => {
          beforeEach(() => {
            community.role = CommunityRole.None
          })

          describe('and there are no pending requests for the user', () => {
            beforeEach(() => {
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([])
            })

            it('should create and return the request as pending', async () => {
              const result = await communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              expect(result).toEqual({
                id: expect.any(String),
                communityId: community.id,
                memberAddress: userAddress,
                type,
                status: CommunityRequestStatus.Pending
              })
              expect(mockCommunitiesDB.createCommunityRequest).toHaveBeenCalledWith(community.id, userAddress, type)
            })
          })

          describe('and there is a pending invite for the user', () => {
            beforeEach(() => {
              mockCommunitiesDB.getCommunityRequests.mockResolvedValueOnce([expectedCreatedRequest])
            })

            it('should throw an InvalidCommunityRequestError with correct message', () => {
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow('Request already exists')
            })

            it('should throw an InvalidCommunityRequestError', () => {
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow(InvalidCommunityRequestError)
            })
          })
        })

        describe('and user already belongs to community', () => {
          beforeEach(() => {
            community.role = CommunityRole.Member
          })

          it('should throw an InvalidCommunityRequestError with correct message', () => {
            expect(communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)).rejects.toThrow(
              `User cannot join since it is already a member of the community: ${community.name}`
            )
          })

          it('should throw an InvalidCommunityRequestError', () => {
            expect(communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)).rejects.toThrow(InvalidCommunityRequestError)
          })
        })
      })
    })
  })
})
