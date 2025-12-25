import { Events, PhotoTakenEvent } from '@dcl/schemas'
import { createPhotoTakenHandler } from '../../../../../src/controllers/handlers/sqs/photo-taken-handler'
import { createLogsMockedComponent, mockCommunitiesDB } from '../../../../mocks/components'
import { ILoggerComponent } from '@well-known-components/interfaces/dist/components/logger'
import { ICommunitiesDatabaseComponent } from '../../../../../src/types'

describe('PhotoTakenHandler', () => {
  let handler: ReturnType<typeof createPhotoTakenHandler>
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockCommunitiesDb: jest.Mocked<ICommunitiesDatabaseComponent>

  beforeEach(() => {
    mockLogs = createLogsMockedComponent({})
    mockCommunitiesDb = mockCommunitiesDB
    handler = createPhotoTakenHandler({ logs: mockLogs, communitiesDb: mockCommunitiesDb })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when processing PhotoTakenEvent with placeId', () => {
    let event: PhotoTakenEvent

    beforeEach(() => {
      event = {
        type: Events.Type.CAMERA,
        subType: Events.SubType.Camera.PHOTO_TAKEN,
        metadata: {
          placeId: 'place-123'
        }
      } as PhotoTakenEvent
      mockCommunitiesDb.getCommunitiesByPlaceId.mockResolvedValue(['community-1', 'community-2'])
      mockCommunitiesDb.updateCommunityRankingMetrics.mockResolvedValue(undefined)
    })

    it('should update metrics for all communities with that place', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.getCommunitiesByPlaceId).toHaveBeenCalledWith('place-123')
      expect(mockCommunitiesDb.updateCommunityRankingMetrics).toHaveBeenCalledTimes(2)
      expect(mockCommunitiesDb.updateCommunityRankingMetrics).toHaveBeenCalledWith('community-1', {
        photos_count: 1
      })
      expect(mockCommunitiesDb.updateCommunityRankingMetrics).toHaveBeenCalledWith('community-2', {
        photos_count: 1
      })
    })
  })

  describe('and placeId is missing', () => {
    let event: PhotoTakenEvent

    beforeEach(() => {
      event = {
        type: Events.Type.CAMERA,
        subType: Events.SubType.Camera.PHOTO_TAKEN,
        metadata: {}
      } as PhotoTakenEvent
    })

    it('should return without updating metrics', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.getCommunitiesByPlaceId).not.toHaveBeenCalled()
      expect(mockCommunitiesDb.updateCommunityRankingMetrics).not.toHaveBeenCalled()
    })
  })

  describe('and no communities are found for placeId', () => {
    let event: PhotoTakenEvent

    beforeEach(() => {
      event = {
        type: Events.Type.CAMERA,
        subType: Events.SubType.Camera.PHOTO_TAKEN,
        metadata: {
          placeId: 'place-123'
        }
      } as PhotoTakenEvent
      mockCommunitiesDb.getCommunitiesByPlaceId.mockResolvedValue([])
    })

    it('should return without updating metrics', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.getCommunitiesByPlaceId).toHaveBeenCalledWith('place-123')
      expect(mockCommunitiesDb.updateCommunityRankingMetrics).not.toHaveBeenCalled()
    })
  })

  describe('and getCommunitiesByPlaceId throws an error', () => {
    let event: PhotoTakenEvent

    beforeEach(() => {
      event = {
        type: Events.Type.CAMERA,
        subType: Events.SubType.Camera.PHOTO_TAKEN,
        metadata: {
          placeId: 'place-123'
        }
      } as PhotoTakenEvent
      mockCommunitiesDb.getCommunitiesByPlaceId.mockRejectedValueOnce(new Error('Database error'))
    })

    it('should return without updating metrics', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.updateCommunityRankingMetrics).not.toHaveBeenCalled()
    })
  })

  describe('and updateCommunityRankingMetrics throws an error for one community', () => {
    let event: PhotoTakenEvent

    beforeEach(() => {
      event = {
        type: Events.Type.CAMERA,
        subType: Events.SubType.Camera.PHOTO_TAKEN,
        metadata: {
          placeId: 'place-123'
        }
      } as PhotoTakenEvent
      mockCommunitiesDb.getCommunitiesByPlaceId.mockResolvedValue(['community-1', 'community-2'])
      mockCommunitiesDb.updateCommunityRankingMetrics
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(undefined)
    })

    it('should continue processing other communities even if one fails', async () => {
      await handler.handle(event)

      expect(mockCommunitiesDb.updateCommunityRankingMetrics).toHaveBeenCalledTimes(2)
      expect(mockCommunitiesDb.updateCommunityRankingMetrics).toHaveBeenCalledWith('community-2', {
        photos_count: 1
      })
    })
  })
})
