import { createCommunityFieldsValidatorComponent } from '../../../src/logic/community/fields-validator'
import { ICommunityFieldsValidatorComponent } from '../../../src/logic/community/types'
import { createMockConfigComponent } from '../../mocks/components/config'
import { InvalidRequestError } from '@dcl/http-commons'
import { CommunityPrivacyEnum } from '../../../src/logic/community'
import { IConfigComponent } from '@well-known-components/interfaces'

describe('CommunityFieldsValidator', () => {
  let configMock: jest.Mocked<IConfigComponent>
  let fieldsValidator: ICommunityFieldsValidatorComponent

  beforeEach(async () => {
    configMock = createMockConfigComponent({
      getString: jest.fn().mockResolvedValue('admin,moderator,test')
    })

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

        // Every invisible code point below is an escape on purpose: a literal cannot be reviewed,
        // which is the same property that makes these useful for slipping past the list.
        describe.each([
          ['zero width space', 'admin\u200B'],
          ['word joiner', 'admin\u2060'],
          ['braille pattern blank', 'admin\u2800'],
          ['soft hyphen', 'admin\u00AD'],
          ['hangul filler', 'admin\u3164'],
          ['byte order mark', 'admin\uFEFF'],
          ['right-to-left override', 'admin\u202E'],
          ['variation selector 16', 'admin\uFE0F'],
          ['mongolian free variation selector', 'admin\u180F'],
          ['variation selector supplement', 'admin\u{E0100}'],
          ['cancel tag', 'admin\u{E007F}'],
          ['tag letter', 'admin\u{E0041}'],
          ['shorthand format', 'admin\u{1BCA0}'],
          ['musical begin beam', 'admin\u{1D173}'],
          ['inside the word', 'ad\u200Bmin']
        ])('and a restricted name is padded with an invisible character (%s)', (_label, name) => {
          it('should throw error', async () => {
            await expect(
              fieldsValidator.validate({ fields: { name: { value: name } } }, undefined, { requireName: true })
            ).rejects.toThrow(InvalidRequestError)
          })
        })

        describe.each([
          ['Cyrillic a', '\u0430dmin'],
          ['fullwidth', '\uFF41\uFF44\uFF4D\uFF49\uFF4E'],
          ['decomposed', 'admin'.normalize('NFD')]
        ])('and a restricted name is written in a lookalike form (%s)', (_label, name) => {
          it('should throw error', async () => {
            await expect(
              fieldsValidator.validate({ fields: { name: { value: name } } }, undefined, { requireName: true })
            ).rejects.toThrow(InvalidRequestError)
          })
        })

        describe.each([
          ['zero width and word joiner', '\u200B\u2060'],
          ['braille blanks', '\u2800\u2800'],
          ['tag letter alone', '\u{E0041}'],
          ['musical format alone', '\u{1D173}']
        ])('and the name is only invisible characters (%s)', (_label, name) => {
          it('should throw error', async () => {
            await expect(
              fieldsValidator.validate({ fields: { name: { value: name } } }, undefined, { requireName: true })
            ).rejects.toThrow(InvalidRequestError)
          })
        })

        describe.each([
          ['a near miss', 'administrator'],
          ['a name containing it', 'admin fans'],
          ['a name in another script', '\u0434\u043E\u043C'],
          ['a Greek name', '\u03BA\u03BF\u03B9\u03BD\u03CC\u03C4\u03B7\u03C4\u03B1']
        ])('and the name only resembles a restricted one (%s)', (_label, name) => {
          it('should pass validation', async () => {
            await expect(
              fieldsValidator.validate({ fields: { name: { value: name } } }, undefined, { requireName: true })
            ).resolves.toBeDefined()
          })
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
            privacy: { value: CommunityPrivacyEnum.Private }
          }
        }

        const result = await fieldsValidator.validate(formData)

        expect(result.privacy).toBe(CommunityPrivacyEnum.Private)
      })

      it('should set privacy to Public when value is not "private"', async () => {
        const formData = {
          fields: {
            privacy: { value: CommunityPrivacyEnum.Public }
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
        // One case per advertised format, so dropping a signature cannot pass
        // unnoticed. Each buffer carries the format's leading bytes, which is
        // what the validator inspects, padded past the 1KB minimum.
        describe.each([
          ['PNG', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
          ['JPEG', [0xff, 0xd8, 0xff, 0xe0]],
          ['GIF87a', [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]],
          ['GIF89a', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
          ['WebP', [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]]
        ])('and the thumbnail is a %s', (_format: string, signature: number[]) => {
          let validImageBuffer: Buffer
          let formData: { fields: { name: { value: string } } }

          beforeEach(() => {
            validImageBuffer = Buffer.alloc(2048)
            Buffer.from(signature).copy(validImageBuffer)
            formData = {
              fields: {
                name: { value: 'Test Community' }
              }
            }
          })

          it('should pass validation and keep the buffer', async () => {
            const result = await fieldsValidator.validate(formData, validImageBuffer)

            expect(result.thumbnailBuffer).toBe(validImageBuffer)
          })
        })
      })

      describe('and thumbnail is invalid', () => {
        let formData: { fields: { name: { value: string } } }

        beforeEach(() => {
          formData = {
            fields: {
              name: { value: 'Test Community' }
            }
          }
        })

        describe('and the bytes do not have a supported image signature', () => {
          let invalidBuffer: Buffer

          beforeEach(() => {
            invalidBuffer = Buffer.alloc(2048, 0x61)
          })

          afterEach(() => {
            invalidBuffer = Buffer.alloc(0)
          })

          it('should reject the thumbnail without invoking a media-container parser', async () => {
            await expect(fieldsValidator.validate(formData, invalidBuffer)).rejects.toThrow(InvalidRequestError)
          })
        })

        describe('and the thumbnail is smaller than 1KB', () => {
          let smallBuffer: Buffer

          beforeEach(() => {
            smallBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
          })

          afterEach(() => {
            smallBuffer = Buffer.alloc(0)
          })

          it('should reject the thumbnail before checking its signature', async () => {
            await expect(fieldsValidator.validate(formData, smallBuffer)).rejects.toThrow(InvalidRequestError)
          })
        })

        describe('and the thumbnail is larger than 500KB', () => {
          let largeBuffer: Buffer

          beforeEach(() => {
            largeBuffer = Buffer.alloc(501 * 1024)
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(largeBuffer)
          })

          afterEach(() => {
            largeBuffer = Buffer.alloc(0)
          })

          it('should reject the thumbnail before checking its signature', async () => {
            await expect(fieldsValidator.validate(formData, largeBuffer)).rejects.toThrow(InvalidRequestError)
          })
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
            privacy: { value: CommunityPrivacyEnum.Private }
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

  describe('when a privacy or visibility value is not one the enum names', () => {
    describe.each([
      ['privacy', 'Private'],
      ['privacy', 'priv'],
      ['privacy', 'xyz'],
      ['privacy', ''],
      ['visibility', 'Unlisted'],
      ['visibility', 'hidden']
    ])('and %s is sent as "%s"', (field, value) => {
      it('should throw rather than resolve to the permissive side', async () => {
        await expect(
          fieldsValidator.validate({ fields: { name: { value: 'A Community' }, [field]: { value } } }, undefined, {
            requireName: true
          })
        ).rejects.toThrow(InvalidRequestError)
      })
    })
  })

  describe('when a privacy or visibility value is one the enum names', () => {
    describe.each([
      ['privacy', 'private'],
      ['privacy', 'public'],
      ['visibility', 'all'],
      ['visibility', 'unlisted'],
      ['privacy', ' private ']
    ])('and %s is sent as "%s"', (field, value) => {
      it('should pass it through', async () => {
        const result = await fieldsValidator.validate(
          { fields: { name: { value: 'A Community' }, [field]: { value } } },
          undefined,
          { requireName: true }
        )

        expect(result[field as 'privacy' | 'visibility']).toBe(value.trim())
      })
    })
  })

  describe('when a restricted name contains letters other scripts imitate', () => {
    beforeEach(async () => {
      configMock = createMockConfigComponent({
        getString: jest.fn().mockResolvedValue('decentraland')
      })

      fieldsValidator = await createCommunityFieldsValidatorComponent({
        config: configMock
      })
    })

    describe.each([
      ['Cyrillic palochka for the l', 'decentra\u04CFand'],
      ['uppercase palochka', 'decentra\u04C0and'],
      ['Cyrillic ie for the e', 'd\u0435centraland'],
      ['Greek omicron for the o', 'dec\u03BFntraland'.replace('\u03BFntr', 'entr')]
    ])('and the name substitutes one of them (%s)', (_label, name) => {
      it('should throw error', async () => {
        await expect(
          fieldsValidator.validate({ fields: { name: { value: name } } }, undefined, { requireName: true })
        ).rejects.toThrow(InvalidRequestError)
      })
    })

    it('should still allow a name that merely looks similar', async () => {
      await expect(
        fieldsValidator.validate({ fields: { name: { value: 'decentralands' } } }, undefined, { requireName: true })
      ).resolves.toBeDefined()
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
