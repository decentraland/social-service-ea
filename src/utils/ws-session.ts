import { verify } from '@dcl/crypto-middleware'
import { AppComponents } from '../types'
import { rejectSceneSigner } from './auth-metadata'
import { parseAuthChainHeaders } from './ws-auth'

/** Common authentication limits for both socket protocols. */
export async function getWsAuthSettings({
  config
}: Pick<AppComponents, 'config'>): Promise<{ authTimeoutInMs: number; authSignatureExpirationInMs: number }> {
  return {
    authTimeoutInMs: (await config.getNumber('WS_AUTH_TIMEOUT_IN_MS')) ?? 300000,
    authSignatureExpirationInMs: (await config.getNumber('WS_AUTH_SIGNATURE_EXPIRATION_IN_MS')) ?? 300000
  }
}

/** Verify the shared wallet handshake, including the common scene-signer policy. */
export function verifyWsIdentity(
  { fetcher }: Pick<AppComponents, 'fetcher'>,
  message: ArrayBuffer,
  expiration: number
): ReturnType<typeof verify> {
  return verify('get', '/', parseAuthChainHeaders(new TextDecoder().decode(message)), {
    fetcher,
    expiration,
    metadataValidator: rejectSceneSigner
  })
}
