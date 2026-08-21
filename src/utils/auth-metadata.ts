import { rejectIfSigner } from '@dcl/crypto-middleware'

/**
 * The `signer` an explorer sets on an auth chain signed on a scene's behalf.
 * @public
 */
export const SCENE_SIGNER = 'decentraland-kernel-scene'

/**
 * The "this service is not for scenes" gate, shared by the HTTP routes and the WebSocket handshake.
 *
 * Wired as the `metadataValidator`, which runs before signature verification — so a rejection here
 * is a `400`, not a `401`, and costs no catalyst round-trip.
 *
 * `@dcl/crypto-middleware` 6.x binds the metadata bytes into the signed payload and canonicalizes
 * nothing, so `signer` reaches us exactly as it was signed. The gate therefore *refuses* a `signer`
 * that is not already trimmed and lowercase instead of folding it before comparing: folding would
 * base the decision on a value the handler never sees, and comparing without folding would let
 * `Decentraland-Kernel-Scene` read as "not a scene" and walk through. A request carrying no
 * `signer` passes — it is not claiming to be one.
 *
 * Built once at module load rather than per request: the predicate throws on a non-canonical
 * argument, so a typo is a startup failure instead of a gate that silently never fires.
 *
 * @public
 */
export const rejectSceneSigner = rejectIfSigner(SCENE_SIGNER)
