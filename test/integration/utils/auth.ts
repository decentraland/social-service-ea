import { Authenticator, AuthIdentity, IdentityType } from '@dcl/crypto'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { signedHeaderFactory } from 'decentraland-crypto-fetch'
import { TestComponents } from '../../../src/types'

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
  const basePath = path.split('?')[0]
  const signedHeaders = signer(identity.authChain, method, basePath, metadata)

  return Object.fromEntries(signedHeaders.entries())
}

export function makeAuthenticatedRequest(components: Pick<TestComponents, 'localHttpFetch'>) {
  return (identity: Identity, path: string, method: string = 'GET') => {
    const { localHttpFetch } = components

    return localHttpFetch.fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...createAuthHeaders(method, path, {}, identity)
      }
    })
  }
}
