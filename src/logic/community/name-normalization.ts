/**
 * Characters that occupy no visual space, so two names differing only by these read identically.
 *
 * Written as escapes on purpose: a class of literal invisible characters cannot be reviewed, which
 * is the same property that makes them useful for slipping past a denylist. Covers the Unicode
 * default-ignorable range plus the blanks that belong to no whitespace class — the braille blank is
 * a symbol and the Hangul filler a letter, so neither `trim()` nor `\s` touches them, and one
 * appended to a reserved name was enough to pass.
 */
const INVISIBLE_CODE_POINTS =
  // eslint-disable-next-line no-misleading-character-class
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u2800\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu

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
export function normalizeNameForComparison(name: string): string {
  const withoutInvisibles = name.normalize('NFKC').replace(INVISIBLE_CODE_POINTS, '')

  return Array.from(withoutInvisibles)
    .map((character) => CONFUSABLE_TO_LATIN[character.toLowerCase()] ?? character)
    .join('')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * Whether a name has any content a reader can actually see.
 *
 * `trim()` answers this for whitespace only, so a name built entirely from zero-width or filler
 * characters is a non-empty string by that measure and an empty one on screen.
 *
 * @param name - A submitted community name
 * @returns Whether anything remains once invisible characters are removed
 * @public
 */
export function hasVisibleContent(name: string): boolean {
  return normalizeNameForComparison(name).length > 0
}
