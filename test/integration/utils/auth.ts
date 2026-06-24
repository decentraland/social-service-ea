import { Authenticator, AuthIdentity, IdentityType } from '@dcl/crypto'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { signedHeaderFactory } from 'decentraland-crypto-fetch'
import { CommunityPrivacyEnum, CommunityVisibilityEnum } from '../../../src/logic/community'
import { TestComponents } from '../../../src/types'
import fs from 'fs'

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
  return (
    identity: Identity | undefined,
    path: string,
    method: string = 'GET',
    body?: any,
    headers?: Record<string, string>
  ) => {
    const { localHttpFetch } = components

    return localHttpFetch.fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '192.168.1.100',
        'x-forwarded-for': '192.168.1.100',
        'x-real-ip': '192.168.1.100',
        ...(identity ? createAuthHeaders(method, path, {}, identity) : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    })
  }
}

export function makeAuthenticatedMultipartRequest(components: Pick<TestComponents, 'localHttpFetch'>) {
  return (
    identity: Identity,
    path: string,
    {
      name,
      description,
      thumbnailPath,
      thumbnailBuffer,
      placeIds,
      privacy,
      visibility
    }: {
      name?: string
      description?: string
      thumbnailPath?: string
      thumbnailBuffer?: Buffer
      placeIds?: string[]
      privacy?: CommunityPrivacyEnum
      visibility?: CommunityVisibilityEnum
    },
    method: string = 'POST'
  ) => {
    const { localHttpFetch } = components
    // Use the web-standard FormData/Blob: the local fetch component is backed by the native
    // (undici) fetch, which only serializes a global FormData into a proper multipart body with
    // the right Content-Type boundary. A node `form-data` instance would be stringified instead.
    const form = new FormData()

    if (name !== undefined) {
      form.append('name', name)
    }

    if (description !== undefined) {
      form.append('description', description)
    }

    if (thumbnailPath) {
      const fileBuffer = fs.readFileSync(thumbnailPath)
      form.append('thumbnail', new Blob([new Uint8Array(fileBuffer)], { type: 'image/png' }), 'thumbnail.png')
    }

    if (thumbnailBuffer) {
      form.append('thumbnail', new Blob([new Uint8Array(thumbnailBuffer)], { type: 'image/png' }), 'thumbnail.png')
    }

    if (placeIds !== undefined) {
      form.append('placeIds', JSON.stringify(placeIds))
    }

    if (privacy !== undefined) {
      form.append('privacy', privacy)
    }

    if (visibility !== undefined) {
      form.append('visibility', visibility)
    }

    const headers = {
      'cf-connecting-ip': '192.168.1.100',
      'x-forwarded-for': '192.168.1.100',
      'x-real-ip': '192.168.1.100',
      ...createAuthHeaders(method, path, {}, identity)
    }

    return localHttpFetch.fetch(path, {
      method,
      headers,
      body: form
    })
  }
}
