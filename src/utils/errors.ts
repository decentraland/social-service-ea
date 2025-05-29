export function isErrorWithMessage(error: unknown): error is Error {
  return error !== undefined && error !== null && typeof error === 'object' && 'message' in error
}

export function messageErrorOrUnknown(error: unknown): string {
  return isErrorWithMessage(error) ? error.message : 'Unknown error'
}
