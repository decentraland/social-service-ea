import { randomUUID } from 'crypto'
import {
  Community,
  CommunityNotFoundError,
  CommunityRequestNotFoundError,
  CommunityPrivacyEnum,
  CommunityRequestStatus,
  CommunityRequestType,
  GetCommunityRequestsOptions,
  ICommunitiesComponent,
  ICommunityRequestsComponent,
  ICommunityRolesComponent,
  InvalidCommunityRequestError,
  MemberRequest
} from '../../../src/logic/community'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import { createCommunityRequestsComponent } from '../../../src/logic/community/requests'
import { mockLogs } from '../../mocks/components'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { CommunityRole } from '../../../src/types'
import { createMockCommunitiesComponent, createMockCommunityRolesComponent } from '../../mocks/communities'

describe('Community Requests Component', () => {
  let communityRequestsComponent: ICommunityRequestsComponent
  let communitiesComponent: ICommunitiesComponent
  let mockCommunityRoles: jest.Mocked<ICommunityRolesComponent>
  let type: CommunityRequestType
  let userAddress: string

  beforeEach(() => {
    communitiesComponent = createMockCommunitiesComponent({})
    mockCommunityRoles = createMockCommunityRolesComponent({})
    communityRequestsComponent = createCommunityRequestsComponent({
      communitiesDb: mockCommunitiesDB,
      communities: communitiesComponent,
      communityRoles: mockCommunityRoles,
      logs: mockLogs
    })

    userAddress = '0x1234567890123456789012345678901234567890'
  })

  describe('when creating a community request', () => {
    describe('when community does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunity.mockResolvedValueOnce(null)
      })

      it('should throw a CommunityNotFoundError', () => {
        expect(
          communityRequestsComponent.createCommunityRequest(
            randomUUID(),
            userAddress,
            CommunityRequestType.RequestToJoin
          )
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
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow(`User cannot join since it is already a member of the community: ${community.name}`)
            })

            it('should throw an InvalidCommunityRequestError', () => {
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow(InvalidCommunityRequestError)
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
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow(`User cannot join since it is already a member of the community: ${community.name}`)
            })

            it('should throw an InvalidCommunityRequestError', () => {
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow(InvalidCommunityRequestError)
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
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow(`User cannot join since it is already a member of the community: ${community.name}`)
            })

            it('should throw an InvalidCommunityRequestError', () => {
              expect(
                communityRequestsComponent.createCommunityRequest(community.id, userAddress, type)
              ).rejects.toThrow(InvalidCommunityRequestError)
            })
          })
        })
      })
    })
  })

  describe('when getting member requests', () => {
    let memberAddress: string
    let pagination: { limit: number; offset: number }
    let options: Pick<GetCommunityRequestsOptions, "status" | "type" | "pagination">

    beforeEach(() => {
      memberAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      pagination = { limit: 10, offset: 0 }
      mockCommunitiesDB.getCommunityRequests.mockReset()
      mockCommunitiesDB.getCommunityRequestsCount.mockReset()
    })

    describe('and there are requests stored in the database', () => {
      let requests: MemberRequest[]

      beforeEach(() => {
        requests = [
          {
            id: randomUUID(),
            communityId: randomUUID(),
            memberAddress,
            type: CommunityRequestType.Invite,
            status: CommunityRequestStatus.Pending
          },
          {
            id: randomUUID(),
            communityId: randomUUID(),
            memberAddress,
            type: CommunityRequestType.RequestToJoin,
            status: CommunityRequestStatus.Pending
          }
        ]

        mockCommunitiesDB.getMemberRequests.mockResolvedValue(requests)
        mockCommunitiesDB.getMemberRequestsCount.mockResolvedValue(2)
      })
      
      describe('and no type filter is provided', () => {
        beforeEach(() => {
          options = {
            pagination,
            status: CommunityRequestStatus.Pending,
            type: undefined
          }
        })
  
        it('should return pending requests (invites and requests) with total, forwarding pagination and filters', async () => {
          const result = await communityRequestsComponent.getMemberRequests(memberAddress, options)
  
          expect(result).toEqual({ requests, total: requests.length })
          expect(mockCommunitiesDB.getMemberRequests).toHaveBeenCalledWith(memberAddress, options)
          expect(mockCommunitiesDB.getMemberRequestsCount).toHaveBeenCalledWith(memberAddress, { ...options, pagination: undefined })
        })
      })
  
      describe('and filtering by type invite', () => {
        beforeEach(() => {
          requests = [
            {
              id: randomUUID(),
              communityId: randomUUID(),
              memberAddress,
              type: CommunityRequestType.Invite,
              status: CommunityRequestStatus.Pending
            }
          ]
  
          mockCommunitiesDB.getMemberRequests.mockResolvedValue(requests)
          mockCommunitiesDB.getMemberRequestsCount.mockResolvedValue(1)

          options = {
            pagination,
            status: CommunityRequestStatus.Pending,
            type: CommunityRequestType.Invite
          }
        })
  
        it('should forward the invite type filter', async () => {
          const result = await communityRequestsComponent.getMemberRequests(memberAddress, options)
  
          expect(result).toEqual({ requests, total: 1 })
          expect(mockCommunitiesDB.getMemberRequests).toHaveBeenCalledWith(memberAddress, options)
          expect(mockCommunitiesDB.getMemberRequestsCount).toHaveBeenCalledWith(memberAddress, { ...options, pagination: undefined })
        })
      })
  
      describe('and filtering by type request_to_join', () => {
        beforeEach(() => {
          requests = [
            {
              id: randomUUID(),
              communityId: randomUUID(),
              memberAddress,
              type: CommunityRequestType.RequestToJoin,
              status: CommunityRequestStatus.Pending
            }
          ]
  
          mockCommunitiesDB.getMemberRequests.mockResolvedValue(requests)
          mockCommunitiesDB.getMemberRequestsCount.mockResolvedValue(1)

          options = {
            pagination,
            status: CommunityRequestStatus.Pending,
            type: CommunityRequestType.RequestToJoin
          }
        })
  
        it('should forward the request_to_join type filter', async () => {
          const result = await communityRequestsComponent.getMemberRequests(memberAddress, options)
  
          expect(result).toEqual({ requests, total: requests.length })
          expect(mockCommunitiesDB.getMemberRequests).toHaveBeenCalledWith(memberAddress, options)
          expect(mockCommunitiesDB.getMemberRequestsCount).toHaveBeenCalledWith(memberAddress, { ...options, pagination: undefined })
        })
      })
    })

    describe('and there are no requests stored in the database', () => {
      beforeEach(() => {
        mockCommunitiesDB.getMemberRequests.mockResolvedValue([])
        mockCommunitiesDB.getMemberRequestsCount.mockResolvedValue(0)

        options = {
          pagination
        }
      })

      it('should return empty results and zero total', async () => {
        const result = await communityRequestsComponent.getMemberRequests(memberAddress, options)

        expect(result).toEqual({ requests: [], total: 0 })
      })
    })
  })

  describe('when updating request status', () => {
    let requestId: string
    let status: Exclude<CommunityRequestStatus, 'pending'>
    let callerAddress: string

    beforeEach(() => {
      requestId = randomUUID()
      callerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      mockCommunitiesDB.getCommunityRequest.mockReset()
      mockCommunitiesDB.addCommunityMember.mockReset()
      mockCommunitiesDB.removeCommunityRequest.mockReset()
      mockCommunitiesDB.acceptCommunityRequestTransaction.mockReset()
      mockCommunityRoles.validatePermissionToAcceptAndRejectRequests.mockReset()
    })

    describe('and the request does not exist', () => {
      beforeEach(() => {
        mockCommunitiesDB.getCommunityRequest.mockResolvedValue(null)
        status = CommunityRequestStatus.Accepted
      })

      it('should throw CommunityRequestNotFoundError', async () => {
        await expect(
          communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
        ).rejects.toThrow(CommunityRequestNotFoundError)
      })
    })

    describe('and the request exists but is not pending', () => {
      beforeEach(() => {
        const nonPendingRequest: MemberRequest = {
          id: requestId,
          communityId: randomUUID(),
          memberAddress: userAddress,
          type: CommunityRequestType.Invite,
          status: CommunityRequestStatus.Accepted
        }
        mockCommunitiesDB.getCommunityRequest.mockResolvedValue(nonPendingRequest)
        status = CommunityRequestStatus.Rejected
      })

      it('should throw CommunityRequestNotFoundError', async () => {
        await expect(
          communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
        ).rejects.toThrow(CommunityRequestNotFoundError)
      })
    })

    describe('and the invite request exists', () => {
      let inviteRequest: MemberRequest
      let invitedUserAddress: string

      beforeEach(() => {
        invitedUserAddress = '0x1111111111111111111111111111111111111111'
        inviteRequest = {
          id: requestId,
          communityId: randomUUID(),
          memberAddress: invitedUserAddress,
          type: CommunityRequestType.Invite,
          status: CommunityRequestStatus.Pending
        }
        mockCommunitiesDB.getCommunityRequest.mockResolvedValue(inviteRequest)
      })

      describe('and the caller is the invited user', () => {
        beforeEach(() => {
          callerAddress = invitedUserAddress
        })

        describe('and the status is accepted', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Accepted
            mockCommunitiesDB.acceptCommunityRequestTransaction.mockResolvedValue()
          })

          it('should use transaction to add member and remove request', async () => {
            await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).toHaveBeenCalledWith(requestId, {
              communityId: inviteRequest.communityId,
              memberAddress: invitedUserAddress,
              role: CommunityRole.Member
            })
            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).not.toHaveBeenCalled()
          })
        })

        describe('and the status is rejected', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Rejected
            mockCommunitiesDB.removeCommunityRequest.mockResolvedValue()
          })

          it('should remove the request', async () => {
            await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

            expect(mockCommunitiesDB.removeCommunityRequest).toHaveBeenCalledWith(requestId)
            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
            expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).not.toHaveBeenCalled()
          })
        })

        describe('and the status is cancelled', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Cancelled
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })
      })

      describe('and the caller has community privileges', () => {
        beforeEach(() => {
          callerAddress = '0x2222222222222222222222222222222222222222' // Different from invited user
          mockCommunityRoles.validatePermissionToAcceptAndRejectRequests.mockResolvedValue()
        })

        describe('and the status is accepted', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Accepted
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })

        describe('and the status is rejected', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Rejected
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })

        describe('and the status is cancelled', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Cancelled
            mockCommunitiesDB.removeCommunityRequest.mockResolvedValue()
          })

          it('should remove the request', async () => {
            await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

            expect(mockCommunitiesDB.removeCommunityRequest).toHaveBeenCalledWith(requestId)
            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
            expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).toHaveBeenCalledWith(
              inviteRequest.communityId,
              callerAddress
            )
          })
        })
      })

      describe('and the caller is neither the invited user nor has privileges', () => {
        beforeEach(() => {
          callerAddress = '0x3333333333333333333333333333333333333333' // Different from invited user
          mockCommunityRoles.validatePermissionToAcceptAndRejectRequests.mockRejectedValue(
            new NotAuthorizedError('User does not have permission')
          )
        })

        describe('and the status is accepted', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Accepted
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })

        describe('and the status is rejected', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Rejected
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })

        describe('and the status is cancelled', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Cancelled
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })
      })
    })

    describe('and the request_to_join request exists', () => {
      let joinRequest: MemberRequest
      let requestingUserAddress: string

      beforeEach(() => {
        requestingUserAddress = '0x4444444444444444444444444444444444444444'
        joinRequest = {
          id: requestId,
          communityId: randomUUID(),
          memberAddress: requestingUserAddress,
          type: CommunityRequestType.RequestToJoin,
          status: CommunityRequestStatus.Pending
        }
        mockCommunitiesDB.getCommunityRequest.mockResolvedValue(joinRequest)
      })

      describe('and the caller is the requesting user', () => {
        beforeEach(() => {
          callerAddress = requestingUserAddress
        })

        describe('and the status is accepted', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Accepted
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })

        describe('and the status is rejected', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Rejected
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })

        describe('and the status is cancelled', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Cancelled
            mockCommunitiesDB.removeCommunityRequest.mockResolvedValue()
          })

          it('should remove the request and do not add user as member', async () => {
            await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

            expect(mockCommunitiesDB.removeCommunityRequest).toHaveBeenCalledWith(requestId)
            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
            expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).not.toHaveBeenCalled()
          })
        })
      })

      describe('and the caller has community privileges', () => {
        beforeEach(() => {
          callerAddress = '0x5555555555555555555555555555555555555555' // Different from requesting user
          mockCommunityRoles.validatePermissionToAcceptAndRejectRequests.mockResolvedValue()
        })

        describe('and the status is accepted', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Accepted
            mockCommunitiesDB.acceptCommunityRequestTransaction.mockResolvedValue()
          })

          it('should use transaction to add member and remove request', async () => {
            await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).toHaveBeenCalledWith(requestId, {
              communityId: joinRequest.communityId,
              memberAddress: requestingUserAddress,
              role: CommunityRole.Member
            })
            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).toHaveBeenCalledWith(
              joinRequest.communityId,
              callerAddress
            )
          })
        })

        describe('and the status is rejected', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Rejected
            mockCommunitiesDB.removeCommunityRequest.mockResolvedValue()
          })

          it('should remove the request and do not add user as member', async () => {
            await communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })

            expect(mockCommunitiesDB.removeCommunityRequest).toHaveBeenCalledWith(requestId)
            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
            expect(mockCommunityRoles.validatePermissionToAcceptAndRejectRequests).toHaveBeenCalledWith(
              joinRequest.communityId,
              callerAddress
            )
          })
        })

        describe('and the status is cancelled', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Cancelled
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })
      })

      describe('and the caller is neither the requesting user nor has privileges', () => {
        beforeEach(() => {
          callerAddress = '0x6666666666666666666666666666666666666666' // Different from requesting user
          mockCommunityRoles.validatePermissionToAcceptAndRejectRequests.mockRejectedValue(
            new NotAuthorizedError('User does not have permission')
          )
        })

        describe('and the status is accepted', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Accepted
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })

        describe('and the status is rejected', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Rejected
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })

        describe('and the status is cancelled', () => {
          beforeEach(() => {
            status = CommunityRequestStatus.Cancelled
          })

          it('should throw NotAuthorizedError', async () => {
            await expect(
              communityRequestsComponent.updateRequestStatus(requestId, status, { callerAddress })
            ).rejects.toThrow(NotAuthorizedError)

            expect(mockCommunitiesDB.addCommunityMember).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.removeCommunityRequest).not.toHaveBeenCalled()
            expect(mockCommunitiesDB.acceptCommunityRequestTransaction).not.toHaveBeenCalled()
          })
        })
      })
    })
  })
})
