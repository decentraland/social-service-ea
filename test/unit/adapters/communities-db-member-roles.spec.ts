import { createCommunitiesDBComponent } from '../../../src/adapters/communities-db'
import { CommunityRole, ICommunitiesDatabaseComponent } from '../../../src/types'

describe('when resolving community member roles', () => {
  let communitiesDb: ICommunitiesDatabaseComponent
  let query: jest.Mock
  let communityId: string
  let memberAddress: string

  beforeEach(() => {
    communityId = '11111111-1111-4111-8111-111111111111'
    memberAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    communitiesDb = createCommunitiesDBComponent({ pg: { query } as any, logs: {} as any })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should only consider rows belonging to an active community', async () => {
    await communitiesDb.getCommunityMemberRoles(communityId, [memberAddress])

    expect(query.mock.calls[0][0].text).toContain('c.active = true')
  })

  it('should resolve a member of a deleted community to no role', async () => {
    const role = await communitiesDb.getCommunityMemberRole(communityId, memberAddress)

    expect(role).toBe(CommunityRole.None)
  })
})
