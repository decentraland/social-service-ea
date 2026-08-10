export const DEFAULT_MAX_REQUEST_BODY_BYTES = 1024 * 1024

/**
 * Ceiling on the configured cap. Not a target: it is there so a typo — bytes
 * confused for megabytes, a stray zero — cannot quietly turn the limit into no
 * limit at all.
 */
export const MAX_ALLOWED_REQUEST_BODY_BYTES = 16 * 1024 * 1024

/**
 * Resolves the server-wide request body cap.
 *
 * `@dcl/http-server` already refuses a non-integer or non-positive value, but its
 * message names the option rather than the setting an operator would edit, and it
 * accepts arbitrarily large values. This keeps the failure at boot, says which
 * variable is wrong, and bounds the value from above.
 *
 * @param configured - Value read from HTTP_MAX_REQUEST_BODY_BYTES, if any.
 * @returns The cap in bytes.
 * @throws When the configured value is not a positive integer within the ceiling,
 * so the service refuses to start rather than run with a limit that rejects
 * legitimate requests or does not bound anything.
 */
export function resolveMaxRequestBodyBytes(configured: number | undefined): number {
  if (configured === undefined) {
    return DEFAULT_MAX_REQUEST_BODY_BYTES
  }

  if (!Number.isInteger(configured) || configured < 1 || configured > MAX_ALLOWED_REQUEST_BODY_BYTES) {
    throw new Error(
      `Invalid HTTP_MAX_REQUEST_BODY_BYTES: expected an integer number of bytes between 1 and ${MAX_ALLOWED_REQUEST_BODY_BYTES}, got ${configured}`
    )
  }

  return configured
}
