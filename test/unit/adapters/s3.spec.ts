import { createS3Adapter } from '../../../src/adapters/s3'
import { mockConfig } from '../../mocks/components'
import { IStorageComponent } from '../../../src/types'

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  HeadObjectCommand: jest.fn().mockImplementation((params) => params)
}))

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(() => ({
    done: jest.fn().mockResolvedValue({})
  }))
}))

describe('S3 Adapter', () => {
  let s3Adapter: IStorageComponent
  let mockS3Client: any

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue('test-bucket')
    mockConfig.getString
      .mockResolvedValueOnce('https://s3.amazonaws.com') // bucketEndpoint
      .mockResolvedValueOnce('us-east-1') // region
      .mockResolvedValueOnce('social') // bucketPrefix

    s3Adapter = await createS3Adapter({ config: mockConfig })
    // Get the mock S3 client from the jest mock
    const { S3Client } = require('@aws-sdk/client-s3')
    mockS3Client = S3Client.mock.results[0].value
  })

  describe('exists()', () => {
    describe('when object exists', () => {
      beforeEach(() => {
        mockS3Client.send.mockResolvedValueOnce({})
      })

      it('should return true', async () => {
        const result = await s3Adapter.exists('test-key')
        expect(result).toBe(true)
        expect(mockS3Client.send).toHaveBeenCalledWith({
          Bucket: 'test-bucket',
          Key: 'social/test-key'
        })
      })
    })

    describe('when object does not exist', () => {
      beforeEach(() => {
        mockS3Client.send.mockRejectedValueOnce(new Error('Not found'))
      })

      it('should return false', async () => {
        const result = await s3Adapter.exists('test-key')
        expect(result).toBe(false)
      })
    })
  })

  describe('existsMultiple()', () => {
    describe('when checking multiple keys with mixed results', () => {
      beforeEach(() => {
        mockS3Client.send
          .mockResolvedValueOnce({}) // first key exists
          .mockRejectedValueOnce(new Error('Not found')) // second key doesn't exist
          .mockResolvedValueOnce({}) // third key exists
      })

      it('should return existence status for all keys', async () => {
        const result = await s3Adapter.existsMultiple(['key1', 'key2', 'key3'])

        expect(result).toEqual({
          key1: true,
          key2: false,
          key3: true
        })
        expect(mockS3Client.send).toHaveBeenCalledTimes(3)
      })
    })

    describe('when checking empty array', () => {
      it('should return empty object without calling S3', async () => {
        const result = await s3Adapter.existsMultiple([])

        expect(result).toEqual({})
        expect(mockS3Client.send).not.toHaveBeenCalled()
      })
    })

    describe('when checking single key', () => {
      beforeEach(() => {
        mockS3Client.send.mockResolvedValueOnce({})
      })

      it('should return existence status for the key', async () => {
        const result = await s3Adapter.existsMultiple(['single-key'])

        expect(result).toEqual({
          'single-key': true
        })
        expect(mockS3Client.send).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('storeFile()', () => {
    describe('when storing a file', () => {
      it('should return the correct S3 URL', async () => {
        const fileBuffer = Buffer.from('test content')
        const result = await s3Adapter.storeFile(fileBuffer, 'test-key')

        expect(result).toBe('https://s3.amazonaws.com/test-bucket/social/test-key')
      })
    })
  })
})
