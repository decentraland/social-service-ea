import { getCommunityThumbnailPath } from '../logic/community'
import { AppComponents, ICdnCacheInvalidatorComponent } from '../types'

export async function createCdnCacheInvalidatorComponent(
  components: Pick<AppComponents, 'config' | 'fetcher'>
): Promise<ICdnCacheInvalidatorComponent> {
  const { config, fetcher } = components

  const CDN_CACHE_INVALIDATOR_API_URL = await config.requireString('CDN_CACHE_INVALIDATOR_API_URL')
  const CDN_CACHE_INVALIDATOR_API_TOKEN = await config.requireString('CDN_CACHE_INVALIDATOR_API_TOKEN')
  const CDN_URL = await config.requireString('CDN_URL')

  async function invalidateThumbnail(communityId: string): Promise<void> {
    const url = `${CDN_CACHE_INVALIDATOR_API_URL}/invalidate`
    await fetcher.fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        files: [getCommunityThumbnailPath(communityId)],
        cfDomain: CDN_URL
      }),
      headers: {
        Authorization: `Bearer ${CDN_CACHE_INVALIDATOR_API_TOKEN}`
      }
    })
  }

  return { invalidateThumbnail }
}
