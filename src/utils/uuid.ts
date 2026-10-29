export const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

const UUID_REGEX = new RegExp(UUID_PATTERN)

export function isValidUUID(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}
