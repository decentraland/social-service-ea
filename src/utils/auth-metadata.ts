/**
 * The `signer` an explorer sets on an auth chain signed on a scene's behalf.
 * @public
 */
export const SCENE_SIGNER = 'decentraland-kernel-scene'

/**
 * Whether an auth chain's metadata says it was signed on a scene's behalf.
 *
 * The signer is client-supplied and the signed payload is lowercased before the signature is
 * checked, so the value reaches us with whatever casing and padding the caller chose and still
 * verifies. Normalize before comparing, otherwise `Decentraland-Kernel-Scene` slips past.
 *
 * @param metadata - Parsed `x-identity-metadata` contents, if any
 * @returns Whether the caller declared itself a scene signer
 * @public
 */
export function isSceneSigner(metadata: { signer?: unknown } | null | undefined): boolean {
  const signer = metadata?.signer
  return typeof signer === 'string' && signer.trim().toLowerCase() === SCENE_SIGNER
}
