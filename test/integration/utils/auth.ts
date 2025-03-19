import { Authenticator, AuthIdentity, IdentityType } from '@dcl/crypto'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { AUTH_CHAIN_HEADER_PREFIX, AUTH_METADATA_HEADER, AUTH_TIMESTAMP_HEADER } from '@dcl/platform-crypto-middleware'
import { signedHeaderFactory } from 'decentraland-crypto-fetch'

export type Identity = {
  authChain: AuthIdentity
  realAccount: IdentityType
  ephemeralIdentity: IdentityType
}

export async function createTestIdentity(): Promise<Identity> {
  const ephemeralIdentity = createUnsafeIdentity()
  const realAccount = createUnsafeIdentity()

  const authChain = await Authenticator.initializeAuthChain(
    realAccount.address,
    ephemeralIdentity,
    10,
    async (message) => Authenticator.createSignature(realAccount, message)
  )

  return { authChain, realAccount, ephemeralIdentity }
}

export function createAuthHeaders(
  method: string,
  path: string,
  metadata: Record<string, any>,
  identity: Identity
): Record<string, string> {
  const signer = signedHeaderFactory()
  const signedHeaders = signer(identity.authChain, method, path, metadata)

  return Object.fromEntries(signedHeaders.entries())
}
