const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isValidUUID(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}
