import { InvalidRequestError } from '@dcl/http-commons'
import { CommunityPrivacyEnum, CommunityVisibilityEnum } from '.'
import { AppComponents } from '../../types/system'
import { detectImageMimeType, UNSUPPORTED_IMAGE_SIGNATURE_MESSAGE } from './image-signature'
import {
  ICommunityFieldsValidatorComponent,
  CommunityFieldsValidationOptions,
  CommunityFieldsValidationFields
} from './types'

/**
 * Characters that occupy no visual space, so two names differing only by these read identically.
 *
 * `Default_Ignorable_Code_Point` is the Unicode property for exactly this: soft hyphen, the
 * zero-width and bidi marks, Hangul fillers, every variation selector including the supplementary
 * ones, the tag block, and the format characters scattered through the higher planes. Enumerating
 * them by hand does not converge — each pass over this file found another range — so the property
 * does the work and only what it deliberately excludes is listed.
 *
 * U+2800 BRAILLE PATTERN BLANK is the exception worth carrying: it is a symbol rather than a format
 * character, so no property claims it, yet it renders as nothing.
 */
const INVISIBLE_CODE_POINTS = /[\p{Default_Ignorable_Code_Point}\u2800]/gu

/**
 * Letters from other scripts that render as Latin ones, mapped to what they imitate.
 *
 * Only characters whose common rendering is indistinguishable from the Latin letter are listed, so
 * folding them cannot merge two names a reader would tell apart.
 */
const CONFUSABLE_TO_LATIN: Record<string, string> = {
  // Cyrillic
  а: 'a',
  в: 'b',
  е: 'e',
  ѕ: 's',
  і: 'i',
  ј: 'j',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  ѡ: 'w',
  ғ: 'f',
  ӏ: 'l',
  Ӏ: 'l',
  ӕ: 'ae',
  // Greek
  α: 'a',
  β: 'b',
  ε: 'e',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  γ: 'y',
  ϲ: 'c',
  ϳ: 'j',
  ꞷ: 'w',
  ѵ: 'v',
  // Other lookalikes
  ı: 'i',
  ȷ: 'j',
  ɡ: 'g',
  ɩ: 'i',
  ᴏ: 'o',
  ᴠ: 'v'
}

/**
 * Reduces a community name to the form used for restricted-name comparison.
 *
 * A denylist is only as good as the equality it uses. `name.trim().toLowerCase()` compares raw code
 * points, so it treats a reserved name and the same name with one invisible character, a fullwidth
 * variant, a decomposed accent, or a Cyrillic lookalike as different strings — while a reader sees
 * one name. This folds those differences away before comparing:
 *
 * 1. NFKC, which collapses fullwidth and other compatibility forms and recomposes decomposed marks
 * 2. removal of characters that take up no visual space, wherever they appear rather than only at
 *    the ends, since one inside the word hides just as well
 * 3. mapping of cross-script letters that render as Latin
 * 4. lowercasing, and collapsing runs of whitespace to a single space
 *
 * The result is used only for the comparison; the submitted name is stored as given.
 *
 * @param name - A submitted or configured community name
 * @returns The comparison form
 * @public
 */
function normalizeNameForComparison(name: string): string {
  const withoutInvisibles = name.normalize('NFKC').replace(INVISIBLE_CODE_POINTS, '')

  return Array.from(withoutInvisibles)
    .map((character) => CONFUSABLE_TO_LATIN[character.toLowerCase()] ?? character)
    .join('')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim()
}

const MIN_THUMBNAIL_BYTES = 1024
const MAX_THUMBNAIL_BYTES = 500 * 1024

export async function createCommunityFieldsValidatorComponent(
  components: Pick<AppComponents, 'config'>
): Promise<ICommunityFieldsValidatorComponent> {
  const { config } = components

  const restrictedNames = ((await config.getString('RESTRICTED_NAMES')) || '')
    .split(',')
    .map((name) => normalizeNameForComparison(name))
    .filter(Boolean)

  return {
    validate: async (
      formData: any,
      thumbnailBuffer?: Buffer,
      options?: CommunityFieldsValidationOptions
    ): Promise<CommunityFieldsValidationFields> => {
      const { requireName = false, requireDescription = false } = options ?? {}

      const name: string | undefined = formData.fields.name?.value
      const description: string | undefined = formData.fields.description?.value
      const placeIdsField: string | undefined = formData.fields.placeIds?.value
      const privacy: string | undefined = formData.fields.privacy?.value
      const visibility: string | undefined = formData.fields.visibility?.value

      let placeIds: string[] | undefined = undefined
      if (placeIdsField) {
        let parsedPlaceIds: unknown
        try {
          parsedPlaceIds = JSON.parse(placeIdsField)
        } catch (error) {
          throw new InvalidRequestError('placeIds must be a valid JSON array')
        }
        if (!Array.isArray(parsedPlaceIds) || !parsedPlaceIds.every((id) => typeof id === 'string')) {
          throw new InvalidRequestError('placeIds must be a valid JSON array')
        }
        placeIds = parsedPlaceIds
      }

      if (requireName || name !== undefined) {
        // Reduced once and reused: an empty comparison form means nothing visible was submitted,
        // and the same form is what the restricted list is compared against.
        const comparableName = typeof name === 'string' ? normalizeNameForComparison(name) : ''

        if (!name || typeof name !== 'string' || comparableName.length === 0) {
          throw new InvalidRequestError('Name must be a non-empty string')
        } else if (name.length > 30) {
          throw new InvalidRequestError('Name must be less or equal to 30 characters')
        } else if (restrictedNames.includes(comparableName)) {
          throw new InvalidRequestError('Name is not allowed')
        }
      }

      if (requireDescription || description !== undefined) {
        if (!description || typeof description !== 'string' || description.trim().length === 0) {
          throw new InvalidRequestError('Description must be a non-empty string')
        } else if (description.length > 500) {
          throw new InvalidRequestError('Description must be less or equal to 500 characters')
        }
      }

      // Always require at least one field for updates
      if (
        name === undefined &&
        description === undefined &&
        !thumbnailBuffer &&
        placeIds === undefined &&
        privacy === undefined &&
        visibility === undefined
      ) {
        throw new InvalidRequestError('At least one field must be provided for update')
      }

      // Validate thumbnail if provided
      if (thumbnailBuffer) {
        const size = thumbnailBuffer.length
        if (size < MIN_THUMBNAIL_BYTES || size > MAX_THUMBNAIL_BYTES) {
          throw new InvalidRequestError('Thumbnail size must be between 1KB and 500KB')
        }

        if (!detectImageMimeType(thumbnailBuffer)) {
          throw new InvalidRequestError(UNSUPPORTED_IMAGE_SIGNATURE_MESSAGE)
        }
      }

      return {
        name,
        description,
        placeIds,
        privacy: (privacy?.trim() as CommunityPrivacyEnum) ?? undefined,
        visibility: (visibility?.trim() as CommunityVisibilityEnum) ?? undefined,
        thumbnailBuffer
      }
    }
  }
}
