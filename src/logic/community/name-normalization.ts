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
export function normalizeNameForComparison(name: string): string {
  const withoutInvisibles = name.normalize('NFKC').replace(INVISIBLE_CODE_POINTS, '')

  return Array.from(withoutInvisibles)
    .map((character) => CONFUSABLE_TO_LATIN[character.toLowerCase()] ?? character)
    .join('')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim()
}
