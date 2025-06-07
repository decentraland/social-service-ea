import { AuthChain, AuthIdentity, Authenticator } from '@dcl/crypto'
import { AUTH_CHAIN_HEADER_PREFIX, AUTH_METADATA_HEADER, AUTH_TIMESTAMP_HEADER } from '@dcl/platform-crypto-middleware'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'

export async function createAuthChain() {
  const ephemeralIdentity = createUnsafeIdentity()
  const signerAccount = createUnsafeIdentity()
  return await Authenticator.initializeAuthChain(signerAccount.address, ephemeralIdentity, 10, async (message) =>
    Authenticator.createSignature(signerAccount, message)
  )
}

export function getAuthHeaders(
  method: string,
  path: string,
  metadata: Record<string, any>,
  chainProvider: (payload: string) => AuthChain
) {
  const headers: Record<string, string> = {}
  const timestamp = Date.now()
  const metadataJSON = JSON.stringify(metadata)
  const payloadParts = [method.toLowerCase(), path.toLowerCase(), timestamp.toString(), metadataJSON]
  const payloadToSign = payloadParts.join(':').toLowerCase()

  const chain = chainProvider(payloadToSign)

  chain.forEach((link, index) => {
    headers[`${AUTH_CHAIN_HEADER_PREFIX}${index}`] = JSON.stringify(link)
  })

  headers[AUTH_TIMESTAMP_HEADER] = timestamp.toString()
  headers[AUTH_METADATA_HEADER] = metadataJSON

  return headers
}

export async function makeRequest(fetch: any, path: string, options: any = {}, identity: AuthIdentity) {
  const url = new URL(path, 'http://127.0.0.1:3001')

  const { metadata, headers, ...otherOptions } = options

  const fetchOptions = {
    ...otherOptions,
    headers: {
      ...headers,
      ...getAuthHeaders(options.method || 'GET', url.pathname, metadata || {}, (payload) =>
        Authenticator.signPayload(identity, payload)
      )
    }
  }

  return fetch.fetch(path, fetchOptions)
}
