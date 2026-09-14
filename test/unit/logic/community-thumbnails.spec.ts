import { UnsupportedThumbnailFormatError } from '../../../src/logic/community/errors'
import { createCommunityThumbnailComponent } from '../../../src/logic/community/thumbnails'
import { ICommunityThumbnailComponent } from '../../../src/logic/community/types'
import { createS3ComponentMock } from '../../mocks/components/s3'
import { createMockConfigComponent } from '../../mocks/components/config'
import { IStorageComponent } from '../../../src/types'
import { IConfigComponent } from '@well-known-components/interfaces'

const COMMUNITY_ID = 'community-id'
const THUMBNAIL_KEY = `communities/${COMMUNITY_ID}/raw-thumbnail.png`

function bufferStartingWith(bytes: number[]): Buffer {
  const buffer = Buffer.alloc(2048)
  Buffer.from(bytes).copy(buffer)
  return buffer
}

describe('when uploading a community thumbnail', () => {
  let communityThumbnail: ICommunityThumbnailComponent
  let mockStorage: jest.Mocked<IStorageComponent>
  let mockConfig: IConfigComponent

  beforeEach(async () => {
    mockStorage = createS3ComponentMock()
    mockStorage.storeFile.mockResolvedValue('stored')
    mockConfig = createMockConfigComponent({
      requireString: jest.fn().mockResolvedValue('https://cdn.decentraland.org')
    })
    communityThumbnail = await createCommunityThumbnailComponent({
      storage: mockStorage,
      config: mockConfig
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe.each([
    ['a PNG', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'],
    ['a JPEG', [0xff, 0xd8, 0xff, 0xe0], 'image/jpeg'],
    ['a GIF', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'image/gif'],
    [
      'a WebP',
      [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
      'image/webp'
    ]
  ])('and the thumbnail is %s', (_format: string, bytes: number[], expectedContentType: string) => {
    let thumbnail: Buffer

    beforeEach(async () => {
      thumbnail = bufferStartingWith(bytes)
      await communityThumbnail.uploadThumbnail(COMMUNITY_ID, thumbnail)
    })

    it('should store it as the media type its bytes announce, not as PNG for everything', () => {
      expect(mockStorage.storeFile).toHaveBeenCalledWith(thumbnail, THUMBNAIL_KEY, expectedContentType)
    })
  })

  describe('and the bytes announce nothing recognisable', () => {
    // The validator rejects these before storage, so this pins the fail-closed
    // invariant if something ever reaches here another way.
    let thrown: unknown

    beforeEach(async () => {
      thrown = await communityThumbnail
        .uploadThumbnail(COMMUNITY_ID, Buffer.alloc(2048, 0x61))
        .catch((error) => error)
    })

    it('should reject the upload instead of storing it under a default type', () => {
      expect(thrown).toBeInstanceOf(UnsupportedThumbnailFormatError)
    })

    it('should not store anything', () => {
      expect(mockStorage.storeFile).not.toHaveBeenCalled()
    })
  })

  describe('and the upload succeeds', () => {
    it('should keep returning the published .png URL, which is a public contract', async () => {
      const url = await communityThumbnail.uploadThumbnail(
        COMMUNITY_ID,
        bufferStartingWith([0xff, 0xd8, 0xff, 0xe0])
      )

      expect(url).toBe(`https://cdn.decentraland.org/social/communities/${COMMUNITY_ID}/raw-thumbnail.png`)
    })
  })
})
