import {
  getMemberCommunitiesByIdsHandler,
  GetMemberCommunitiesByIdsResponse
} from '../../../../../src/controllers/handlers/http/get-member-communities-by-ids-handler'
import { createLogsMockedComponent, mockCommunitiesDB } from '../../../../mocks/components'
import { HTTPResponse } from '../../../../../src/types'

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
        communityIds = [
          'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          'b2c3d4e5-f6a7-8901-bcde-f12345678901'
        ]
        mockRequest.json.mockResolvedValue({ communityIds })
      })

      describe('and all communities are visible to the user', () => {
        let visibleCommunities: Array<{ id: string }>

        beforeEach(() => {
          visibleCommunities = [{ id: communityIds[0] }, { id: communityIds[1] }]
          mockCommunitiesDb.getVisibleCommunitiesByIds.mockResolvedValue(visibleCommunities)
        })

        it('should return all visible communities with status 200', async () => {
          const result = await getMemberCommunitiesByIdsHandler({
            components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
            params: { address: memberAddress },
            request: mockRequest
          } as any) as HTTPResponse<GetMemberCommunitiesByIdsResponse>

          expect(result.status).toBe(200)
          expect(result.body).toEqual({
            data: {
              communities: visibleCommunities
            }
          })
        })

        it('should call getVisibleCommunitiesByIds with normalized address', async () => {
          await getMemberCommunitiesByIdsHandler({
            components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
            params: { address: memberAddress.toUpperCase() },
            request: mockRequest
          } as any)

          expect(mockCommunitiesDb.getVisibleCommunitiesByIds).toHaveBeenCalledWith(
            communityIds,
            memberAddress
          )
        })
      })

      describe('and some communities are not visible to the user', () => {
        let visibleCommunities: Array<{ id: string }>

        beforeEach(() => {
          visibleCommunities = [{ id: communityIds[0] }]
          mockCommunitiesDb.getVisibleCommunitiesByIds.mockResolvedValue(visibleCommunities)
        })

        it('should return only visible communities', async () => {
          const result = await getMemberCommunitiesByIdsHandler({
            components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
            params: { address: memberAddress },
            request: mockRequest
          } as any) as HTTPResponse<GetMemberCommunitiesByIdsResponse>

          expect(result.status).toBe(200)
          expect(result.body).toEqual({
            data: {
              communities: [{ id: communityIds[0] }]
            }
          })
        })
      })

      describe('and no communities are visible to the user', () => {
        beforeEach(() => {
          mockCommunitiesDb.getVisibleCommunitiesByIds.mockResolvedValue([])
        })

        it('should return an empty array', async () => {
          const result = await getMemberCommunitiesByIdsHandler({
            components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
            params: { address: memberAddress },
            request: mockRequest
          } as any) as HTTPResponse<GetMemberCommunitiesByIdsResponse>

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
        mockCommunitiesDb.getVisibleCommunitiesByIds.mockRejectedValue(dbError)
      })

      it('should return status 500 with error message', async () => {
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
        mockCommunitiesDb.getVisibleCommunitiesByIds.mockResolvedValue([{ id: communityIds[0] }])
      })

      it('should normalize the address to lowercase', async () => {
        await getMemberCommunitiesByIdsHandler({
          components: { communitiesDb: mockCommunitiesDb, logs: mockLogs },
          params: { address: memberAddress },
          request: mockRequest
        } as any)

        expect(mockCommunitiesDb.getVisibleCommunitiesByIds).toHaveBeenCalledWith(
          communityIds,
          memberAddress.toLowerCase()
        )
      })
    })
  })
})
