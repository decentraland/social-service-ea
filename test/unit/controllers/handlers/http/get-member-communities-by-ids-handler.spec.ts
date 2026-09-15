import {
  getMemberCommunitiesByIdsHandler,
  GetMemberCommunitiesByIdsResponse
} from '../../../../../src/controllers/handlers/http/get-member-communities-by-ids-handler'
import { createLogsMockedComponent, mockCommunitiesDB } from '../../../../mocks/components'
import { CommunityMemberRole, CommunityRole, HTTPResponse } from '../../../../../src/types'

describe('getMemberCommunitiesByIdsHandler', () => {
  let mockLogs: ReturnType<typeof createLogsMockedComponent>
  let mockCommunitiesDb: jest.Mocked<typeof mockCommunitiesDB>
  let mockRequest: { json: jest.Mock }

  beforeEach(() => {
    mockLogs = createLogsMockedComponent({})
    mockCommunitiesDb = { ...mockCommunitiesDB }
    mockRequest = {
      json: jest.fn()
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when getting communities by IDs for a member', () => {
    describe('and the request contains valid community IDs', () => {
      let memberAddress: string
      let communityIds: string[]

      beforeEach(() => {
        memberAddress = '0x1234567890123456789012345678901234567890'
        communityIds = ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'b2c3d4e5-f6a7-8901-bcde-f12345678901']
        mockRequest.json.mockResolvedValue({ communityIds })
      })

      describe('and the address is a member of all the requested communities', () => {
        let memberCommunities: Array<{ id: string; role: CommunityMemberRole }>

        beforeEach(() => {
          memberCommunities = [
            { id: communityIds[0], role: CommunityRole.Member },
            { id: communityIds[1], role: CommunityRole.Moderator }
          ]
          mockCommunitiesDb.getMemberCommunitiesByIds.mockResolvedValue(memberCommunities)
        })

        it('should respond with a 200 and every community along with the role held in it', async () => {
          const result = (await getMemberCommunitiesByIdsHandler({
            components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
            params: { address: memberAddress },
            request: mockRequest
          } as any)) as HTTPResponse<GetMemberCommunitiesByIdsResponse>

          expect(result.status).toBe(200)
          expect(result.body).toEqual({
            data: {
              communities: memberCommunities
            }
          })
        })

        it('should look up the memberships with the normalized address', async () => {
          await getMemberCommunitiesByIdsHandler({
            components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
            params: { address: memberAddress.toUpperCase() },
            request: mockRequest
          } as any)

          expect(mockCommunitiesDb.getMemberCommunitiesByIds).toHaveBeenCalledWith(communityIds, memberAddress)
        })
      })

      describe('and the address is a member of only some of the requested communities', () => {
        let memberCommunities: Array<{ id: string; role: CommunityMemberRole }>

        beforeEach(() => {
          memberCommunities = [{ id: communityIds[0], role: CommunityRole.Member }]
          mockCommunitiesDb.getMemberCommunitiesByIds.mockResolvedValue(memberCommunities)
        })

        it('should respond only with the communities the address is a member of', async () => {
          const result = (await getMemberCommunitiesByIdsHandler({
            components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
            params: { address: memberAddress },
            request: mockRequest
          } as any)) as HTTPResponse<GetMemberCommunitiesByIdsResponse>

          expect(result.status).toBe(200)
          expect(result.body).toEqual({
            data: {
              communities: [{ id: communityIds[0], role: CommunityRole.Member }]
            }
          })
        })
      })

      describe('and the address is not a member of any of the requested communities', () => {
        beforeEach(() => {
          mockCommunitiesDb.getMemberCommunitiesByIds.mockResolvedValue([])
        })

        it('should respond with an empty list of communities', async () => {
          const result = (await getMemberCommunitiesByIdsHandler({
            components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
            params: { address: memberAddress },
            request: mockRequest
          } as any)) as HTTPResponse<GetMemberCommunitiesByIdsResponse>

          expect(result.status).toBe(200)
          expect(result.body).toEqual({
            data: {
              communities: []
            }
          })
        })
      })
    })

    describe('and the database query fails', () => {
      let memberAddress: string
      let communityIds: string[]
      let dbError: Error

      beforeEach(() => {
        memberAddress = '0x1234567890123456789012345678901234567890'
        communityIds = ['a1b2c3d4-e5f6-7890-abcd-ef1234567890']
        dbError = new Error('Database connection failed')
        mockRequest.json.mockResolvedValue({ communityIds })
        mockCommunitiesDb.getMemberCommunitiesByIds.mockRejectedValue(dbError)
      })

      it('should respond with a 500 and the error message', async () => {
        const result = await getMemberCommunitiesByIdsHandler({
          components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
          params: { address: memberAddress },
          request: mockRequest
        } as any)

        expect(result.status).toBe(500)
        expect((result.body as { message: string }).message).toBe('Database connection failed')
      })

      it('should log the error', async () => {
        const logger = mockLogs.getLogger('get-member-communities-by-ids-handler')
        await getMemberCommunitiesByIdsHandler({
          components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
          params: { address: memberAddress },
          request: mockRequest
        } as any)

        expect(logger.error).toHaveBeenCalled()
      })
    })

    describe('and the address has mixed case', () => {
      let memberAddress: string
      let communityIds: string[]

      beforeEach(() => {
        memberAddress = '0xAbCdEf1234567890123456789012345678901234'
        communityIds = ['a1b2c3d4-e5f6-7890-abcd-ef1234567890']
        mockRequest.json.mockResolvedValue({ communityIds })
        mockCommunitiesDb.getMemberCommunitiesByIds.mockResolvedValue([
          { id: communityIds[0], role: CommunityRole.Member }
        ])
      })

      it('should normalize the address to lowercase before looking up the memberships', async () => {
        await getMemberCommunitiesByIdsHandler({
          components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
          params: { address: memberAddress },
          request: mockRequest
        } as any)

        expect(mockCommunitiesDb.getMemberCommunitiesByIds).toHaveBeenCalledWith(
          communityIds,
          memberAddress.toLowerCase()
        )
      })
    })
  })
})
