import { createCommunityFieldsValidatorComponent } from '../../../src/logic/community/fields-validator'
import { ICommunityFieldsValidatorComponent } from '../../../src/logic/community/types'
import { createMockConfigComponent } from '../../mocks/components/config'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { CommunityPrivacyEnum } from '../../../src/logic/community'
import { IConfigComponent } from '@well-known-components/interfaces'

// Mock file-type module
jest.mock('file-type', () => ({
  fromBuffer: jest.fn()
}))

import fileType from 'file-type'

describe('CommunityFieldsValidator', () => {
  let configMock: jest.Mocked<IConfigComponent>
  let fieldsValidator: ICommunityFieldsValidatorComponent
  let mockFileType: jest.Mocked<typeof fileType>

  beforeEach(async () => {
    configMock = createMockConfigComponent({
      getString: jest.fn().mockResolvedValue('admin,moderator,test')
    })

    mockFileType = fileType as jest.Mocked<typeof fileType>

    fieldsValidator = await createCommunityFieldsValidatorComponent({
      config: configMock
    })
  })

  describe('when validating form data', () => {
    describe('and name validation is required', () => {
      describe('and name is valid', () => {
        it('should pass validation for valid name', async () => {
          const formData = {
            fields: {
              name: { value: 'Valid Community Name' }
            }
          }

          const result = await fieldsValidator.validate(formData, undefined, { requireName: true })

          expect(result.name).toBe('Valid Community Name')
          expect(result.description).toBeUndefined()
          expect(result.placeIds).toBeUndefined()
          expect(result.privacy).toBeUndefined()
          expect(result.thumbnailBuffer).toBeUndefined()
        })
      })

      describe('and name is invalid', () => {
        it('should throw error for empty name', async () => {
          const formData = {
            fields: {
              name: { value: '' }
            }
          }

          await expect(fieldsValidator.validate(formData, undefined, { requireName: true })).rejects.toThrow(
            InvalidRequestError
          )
        })

        it('should throw error for whitespace-only name', async () => {
          const formData = {
            fields: {
              name: { value: '   ' }
            }
          }

          await expect(fieldsValidator.validate(formData, undefined, { requireName: true })).rejects.toThrow(
            InvalidRequestError
          )
        })

        it('should throw error for name exceeding 30 characters', async () => {
          const formData = {
            fields: {
              name: { value: 'A'.repeat(31) }
            }
          }

          await expect(fieldsValidator.validate(formData, undefined, { requireName: true })).rejects.toThrow(
            InvalidRequestError
          )
        })

        it('should throw error for restricted name', async () => {
          const formData = {
            fields: {
              name: { value: 'admin' }
            }
          }

          await expect(fieldsValidator.validate(formData, undefined, { requireName: true })).rejects.toThrow(
            InvalidRequestError
          )
        })

        it('should throw error for restricted name with different case', async () => {
          const formData = {
            fields: {
              name: { value: 'ADMIN' }
            }
          }

          await expect(fieldsValidator.validate(formData, undefined, { requireName: true })).rejects.toThrow(
            InvalidRequestError
          )
        })
      })
    })

    describe('and description validation is required', () => {
      describe('and description is valid', () => {
        it('should pass validation for valid description', async () => {
          const formData = {
            fields: {
              description: { value: 'A valid community description' }
            }
          }

          const result = await fieldsValidator.validate(formData, undefined, { requireDescription: true })

          expect(result.name).toBeUndefined()
          expect(result.description).toBe('A valid community description')
          expect(result.placeIds).toBeUndefined()
          expect(result.privacy).toBeUndefined()
          expect(result.thumbnailBuffer).toBeUndefined()
        })
      })

      describe('and description is invalid', () => {
        it('should throw error for empty description', async () => {
          const formData = {
            fields: {
              description: { value: '' }
            }
          }

          await expect(fieldsValidator.validate(formData, undefined, { requireDescription: true })).rejects.toThrow(
            InvalidRequestError
          )
        })

        it('should throw error for whitespace-only description', async () => {
          const formData = {
            fields: {
              description: { value: '   ' }
            }
          }

          await expect(fieldsValidator.validate(formData, undefined, { requireDescription: true })).rejects.toThrow(
            InvalidRequestError
          )
        })

        it('should throw error for description exceeding 500 characters', async () => {
          const formData = {
            fields: {
              description: { value: 'A'.repeat(501) }
            }
          }

          await expect(fieldsValidator.validate(formData, undefined, { requireDescription: true })).rejects.toThrow(
            InvalidRequestError
          )
        })
      })
    })

    describe('and placeIds validation', () => {
      describe('and placeIds is valid', () => {
        it('should parse valid JSON array of placeIds', async () => {
          const formData = {
            fields: {
              placeIds: { value: '["place1", "place2", "place3"]' }
            }
          }

          const result = await fieldsValidator.validate(formData)

          expect(result.placeIds).toEqual(['place1', 'place2', 'place3'])
        })

        it('should handle empty array of placeIds', async () => {
          const formData = {
            fields: {
              placeIds: { value: '[]' }
            }
          }

          const result = await fieldsValidator.validate(formData)

          expect(result.placeIds).toEqual([])
        })
      })

      describe('and placeIds is invalid', () => {
        it('should throw error for invalid JSON', async () => {
          const formData = {
            fields: {
              placeIds: { value: 'invalid json' }
            }
          }

          await expect(fieldsValidator.validate(formData)).rejects.toThrow(InvalidRequestError)
        })

        it('should throw error for non-array JSON', async () => {
          const formData = {
            fields: {
              placeIds: { value: '"not an array"' }
            }
          }

          await expect(fieldsValidator.validate(formData)).rejects.toThrow(InvalidRequestError)
        })
      })
    })

    describe('and privacy validation', () => {
      it('should set privacy to Private when value is "private"', async () => {
        const formData = {
          fields: {
            privacy: { value: 'private' }
          }
        }

        const result = await fieldsValidator.validate(formData)

        expect(result.privacy).toBe(CommunityPrivacyEnum.Private)
      })

      it('should set privacy to Public when value is not "private"', async () => {
        const formData = {
          fields: {
            privacy: { value: 'public' }
          }
        }

        const result = await fieldsValidator.validate(formData)

        expect(result.privacy).toBe(CommunityPrivacyEnum.Public)
      })

      it('should NOT default to Public when privacy is not provided', async () => {
        const formData = {
          fields: {
            name: { value: 'Test Community' }
          }
        }

        const result = await fieldsValidator.validate(formData)

        expect(result.privacy).toBeUndefined()
      })
    })

    describe('and thumbnail validation', () => {
      describe('and thumbnail is valid', () => {
        beforeEach(() => {
          mockFileType.fromBuffer.mockResolvedValue({
            mime: 'image/png',
            ext: 'png'
          } as any)
        })

        it('should pass validation for valid image buffer', async () => {
          const validImageBuffer = Buffer.alloc(2048) // 2KB buffer
          const formData = {
            fields: {
              name: { value: 'Test Community' }
            }
          }

          const result = await fieldsValidator.validate(formData, validImageBuffer)

          expect(result.thumbnailBuffer).toBe(validImageBuffer)
        })
      })

      describe('and thumbnail is invalid', () => {
        it('should throw error for non-image buffer', async () => {
          mockFileType.fromBuffer.mockResolvedValue(null)
          const invalidBuffer = Buffer.from('not-an-image')
          const formData = {
            fields: {
              name: { value: 'Test Community' }
            }
          }

          await expect(fieldsValidator.validate(formData, invalidBuffer)).rejects.toThrow(InvalidRequestError)
        })

        it('should throw error for buffer smaller than 1KB', async () => {
          mockFileType.fromBuffer.mockResolvedValue({
            mime: 'image/png',
            ext: 'png'
          } as any)
          const smallBuffer = Buffer.from('small')
          const formData = {
            fields: {
              name: { value: 'Test Community' }
            }
          }

          await expect(fieldsValidator.validate(formData, smallBuffer)).rejects.toThrow(InvalidRequestError)
        })

        it('should throw error for buffer larger than 500KB', async () => {
          mockFileType.fromBuffer.mockResolvedValue({
            mime: 'image/png',
            ext: 'png'
          } as any)
          const largeBuffer = Buffer.alloc(501 * 1024)
          const formData = {
            fields: {
              name: { value: 'Test Community' }
            }
          }

          await expect(fieldsValidator.validate(formData, largeBuffer)).rejects.toThrow(InvalidRequestError)
        })
      })
    })

    describe('and update validation', () => {
      it('should throw error when no fields are provided for update', async () => {
        const formData = {
          fields: {}
        }

        await expect(fieldsValidator.validate(formData)).rejects.toThrow(InvalidRequestError)
      })

      it('should pass when at least one field is provided for update', async () => {
        const formData = {
          fields: {
            name: { value: 'Updated Name' }
          }
        }

        const result = await fieldsValidator.validate(formData)

        expect(result.name).toBe('Updated Name')
      })
    })

    describe('and multiple fields validation', () => {
      it('should validate all provided fields', async () => {
        const formData = {
          fields: {
            name: { value: 'Test Community' },
            description: { value: 'Test Description' },
            placeIds: { value: '["place1", "place2"]' },
            privacy: { value: 'private' }
          }
        }

        const result = await fieldsValidator.validate(formData)

        expect(result.name).toBe('Test Community')
        expect(result.description).toBe('Test Description')
        expect(result.placeIds).toEqual(['place1', 'place2'])
        expect(result.privacy).toBe(CommunityPrivacyEnum.Private)
      })
    })
  })

  describe('when restricted names configuration is empty', () => {
    beforeEach(async () => {
      configMock = createMockConfigComponent({
        getString: jest.fn().mockResolvedValue('')
      })

      fieldsValidator = await createCommunityFieldsValidatorComponent({
        config: configMock
      })
    })

    it('should allow any name when no restricted names are configured', async () => {
      const formData = {
        fields: {
          name: { value: 'admin' }
        }
      }

      const result = await fieldsValidator.validate(formData, undefined, { requireName: true })

      expect(result.name).toBe('admin')
    })
  })

  describe('when restricted names configuration has whitespace', () => {
    beforeEach(async () => {
      configMock = createMockConfigComponent({
        getString: jest.fn().mockResolvedValue('  admin  ,  ,  moderator  ,  ')
      })

      fieldsValidator = await createCommunityFieldsValidatorComponent({
        config: configMock
      })
    })

    it('should filter out empty entries and trim whitespace', async () => {
      const formData = {
        fields: {
          name: { value: 'admin' }
        }
      }

      await expect(fieldsValidator.validate(formData, undefined, { requireName: true })).rejects.toThrow(
        InvalidRequestError
      )
    })
  })
})
