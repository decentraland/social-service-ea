import { getMemberCommunitiesHandler } from '../../../../../src/controllers/handlers/http/get-member-communities-handlers'
import { createLogsMockedComponent } from '../../../../mocks/components'
import { createMockCommunitiesComponent } from '../../../../mocks/communities'
import { CommunityRole } from '../../../../../src/types'
import { ICommunitiesComponent, MemberCommunity } from '../../../../../src/logic/community'

describe('getMemberCommunitiesHandler', () => {
  let mockLogs: ReturnType<typeof createLogsMockedComponent>
  let mockCommunities: jest.Mocked<ICommunitiesComponent>
  let memberAddress: string
  let memberCommunities: MemberCommunity[]

  const makeRequest = (verification?: { auth: string; authMetadata: Record<string, unknown> }) =>
    getMemberCommunitiesHandler({
      components: { communities: mockCommunities, logs: mockLogs },
      params: { address: memberAddress },
      url: new URL(`http://localhost/v1/members/${memberAddress}/communities?limit=10&offset=0`),
      verification
    } as any)

  beforeEach(() => {
    memberAddress = '0x1234567890123456789012345678901234567890'
    memberCommunities = [
      {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Public Community',
        ownerAddress: memberAddress,
        role: CommunityRole.Owner
      } as MemberCommunity
    ]
    mockLogs = createLogsMockedComponent({})
    mockCommunities = createMockCommunitiesComponent({})
    mockCommunities.getMemberCommunities.mockResolvedValue({ communities: memberCommunities, total: 1 })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when the caller is the member themselves', () => {
    it('should request all communities without the public-visible restriction', async () => {
      const result = await makeRequest({ auth: memberAddress.toUpperCase(), authMetadata: {} })

      expect(result.status).toBe(200)
      expect(mockCommunities.getMemberCommunities).toHaveBeenCalledWith(memberAddress, {
        pagination: { limit: 10, offset: 0 },
        onlyPublicVisible: false
      })
    })
  })

  describe('when the caller is another authenticated user', () => {
    it('should restrict the results to publicly visible communities', async () => {
      const result = await makeRequest({ auth: '0x9876543210987654321098765432109876543210', authMetadata: {} })

      expect(result.status).toBe(200)
      expect(mockCommunities.getMemberCommunities).toHaveBeenCalledWith(memberAddress, {
        pagination: { limit: 10, offset: 0 },
        onlyPublicVisible: true
      })
    })
  })

  describe('when the caller is not authenticated', () => {
    it('should restrict the results to publicly visible communities', async () => {
      const result = await makeRequest(undefined)

      expect(result.status).toBe(200)
      expect(result.body).toEqual({
        data: {
          results: memberCommunities,
          total: 1,
          page: 1,
          pages: 1,
          limit: 10
        }
      })
      expect(mockCommunities.getMemberCommunities).toHaveBeenCalledWith(memberAddress, {
        pagination: { limit: 10, offset: 0 },
        onlyPublicVisible: true
      })
    })
  })

  describe('when fetching the communities fails', () => {
    beforeEach(() => {
      mockCommunities.getMemberCommunities.mockRejectedValue(new Error('Unable to get member communities'))
    })

    it('should respond with a 500 status code', async () => {
      const result = await makeRequest({ auth: memberAddress, authMetadata: {} })

      expect(result.status).toBe(500)
    })
  })
})
