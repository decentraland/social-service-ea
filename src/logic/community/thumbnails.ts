import { AppComponents } from '../../types'
import { ICommunityThumbnailComponent } from './types'
import { getCommunityThumbnailPath } from './utils'

export async function createCommunityThumbnailComponent(
  components: Pick<AppComponents, 'storage' | 'config'>
): Promise<ICommunityThumbnailComponent> {
  const { storage, config } = components

  const CDN_URL = await config.requireString('CDN_URL')

  function buildThumbnailUrl(communityId: string) {
    return `${CDN_URL}${getCommunityThumbnailPath(communityId)}`
  }

  async function getThumbnail(communityId: string): Promise<string | undefined> {
    const thumbnailExists = await storage.exists(`communities/${communityId}/raw-thumbnail.png`)

    if (!thumbnailExists) {
      return undefined
    }

    return buildThumbnailUrl(communityId)
  }

  async function uploadThumbnail(communityId: string, thumbnail: Buffer): Promise<string> {
    await storage.storeFile(thumbnail, `communities/${communityId}/raw-thumbnail.png`)
    return buildThumbnailUrl(communityId)
  }

  return {
    buildThumbnailUrl,
    getThumbnail,
    uploadThumbnail
  }
}
