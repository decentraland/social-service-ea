import { ICommunityThumbnailComponent } from '../../../src/logic/community'

export function createCommunityThumbnailMockComponent({
  buildThumbnailUrl = jest.fn(),
  getThumbnail = jest.fn(),
  uploadThumbnail = jest.fn()
}: Partial<jest.Mocked<ICommunityThumbnailComponent>>): jest.Mocked<ICommunityThumbnailComponent> {
  return {
    buildThumbnailUrl,
    getThumbnail,
    uploadThumbnail
  }
}
