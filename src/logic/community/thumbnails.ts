import { AppComponents } from '../../types'
import { UnsupportedThumbnailFormatError } from './errors'
import { detectImageMimeType } from './image-signature'
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

  async function getThumbnails(communityIds: string[]): Promise<Record<string, string | undefined>> {
    if (communityIds.length === 0) return {}

    const thumbnailKeys = communityIds.map((id) => `communities/${id}/raw-thumbnail.png`)
    const thumbnailExists = await storage.existsMultiple(thumbnailKeys)

    return communityIds.reduce(
      (acc, communityId) => {
        const key = `communities/${communityId}/raw-thumbnail.png`
        acc[communityId] = thumbnailExists[key] ? buildThumbnailUrl(communityId) : undefined
        return acc
      },
      {} as Record<string, string | undefined>
    )
  }

  async function uploadThumbnail(communityId: string, thumbnail: Buffer): Promise<string> {
    // The key keeps its .png name because it is a published URL, but the object
    // is served as what it is: the validator accepts JPEG, GIF and WebP too, and
    // a browser goes by the Content-Type rather than the extension.
    const contentType = detectImageMimeType(thumbnail)

    // Callers validate before uploading; unrecognized bytes mean that contract broke.
    if (!contentType) {
      throw new UnsupportedThumbnailFormatError()
    }

    await storage.storeFile(thumbnail, `communities/${communityId}/raw-thumbnail.png`, contentType)
    return buildThumbnailUrl(communityId)
  }

  return {
    buildThumbnailUrl,
    getThumbnail,
    getThumbnails,
    uploadThumbnail
  }
}
