import { CommunityDB } from '../../../src/types'
import { ICommunitiesDatabaseComponent } from '../../../src/types'

export async function createCommunity(communitiesDb: ICommunitiesDatabaseComponent, community: CommunityDB) {
  const { id } = await communitiesDb.createCommunity(community)
  return id
}
