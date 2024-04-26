import { SocialServiceDefinition } from '@dcl/protocol/out-js/decentraland/social_service_v2/social_service.gen'
import { createRpcClient } from '@dcl/rpc'
import { AuthLinkType, Authenticator } from '@dcl/crypto'
import { loadService } from '@dcl/rpc/dist/codegen'
import { IWebSocket, WebSocketTransport } from '@dcl/rpc/dist/transports/WebSocket'
import createAuthChainHeaders from '@dcl/platform-crypto-middleware/dist/createAuthChainHeader'

import { WebSocket } from 'ws'
import future from 'fp-future'
import { IBaseComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { FromTsProtoServiceDefinition, RawClient } from '@dcl/rpc/dist/codegen-types'

const identity = {
  ephemeralIdentity: {
    address: '0x84452bbFA4ca14B7828e2F3BBd106A2bD495CD34',
    publicKey:
      '0x0420c548d960b06dac035d1daf826472eded46b8b9d123294f1199c56fa235c89f2515158b1e3be0874bfb15b42d1551db8c276787a654d0b8d7b4d4356e70fe42',
    privateKey: '0xbc453a92d9baeb3d10294cbc1d48ef6738f718fd31b4eb8085efe7b311299399'
  },
  expiration: new Date('3021-10-16T22:32:29.626Z'),
  authChain: [
    {
      type: AuthLinkType.SIGNER,
      payload: '0x7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5',
      signature: ''
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
      payload: `Decentraland Login\nEphemeral address: 0x84452bbFA4ca14B7828e2F3BBd106A2bD495CD34\nExpiration: 3021-10-16T22:32:29.626Z`,
      signature:
        '0x39dd4ddf131ad2435d56c81c994c4417daef5cf5998258027ef8a1401470876a1365a6b79810dc0c4a2e9352befb63a9e4701d67b38007d83ffc4cd2b7a38ad51b'
    }
  ]
}

export const AUTH_ADDRESS = identity.authChain[0].payload

export type ISocialServiceRpcClientComponent = IBaseComponent & {
  client: RawClient<FromTsProtoServiceDefinition<SocialServiceDefinition>>
}

export async function createSocialServiceRpcClientComponent({
  logs
}: {
  logs: ILoggerComponent
}): Promise<ISocialServiceRpcClientComponent> {
  const logger = logs.getLogger('social-service-rpc-client')
  let socialServiceClient: RawClient<FromTsProtoServiceDefinition<SocialServiceDefinition>>
  let connection: WebSocket | undefined

  return {
    get client() {
      return socialServiceClient!
    },
    start: async () => {
      const ws = new WebSocket('ws://0.0.0.0:3000')
      const ts = Date.now()
      const payload = ['get', '/', String(ts), JSON.stringify({})].join(':').toLowerCase()
      const chain = Authenticator.signPayload(identity, payload)
      const headers = createAuthChainHeaders(chain, ts)

      const toBeResolved = future()

      ws.on('open', () => {
        ws.send(JSON.stringify(headers))
        toBeResolved.resolve(true)
      })

      await toBeResolved

      const transport = WebSocketTransport(ws as IWebSocket)
      const client = await createRpcClient(transport)
      const port = await client.createPort('ss-client')

      const service = loadService(port, SocialServiceDefinition)

      socialServiceClient = service
      connection = ws
    },
    stop: async () => {
      logger.debug('closing connection')
      connection?.close()
    }
  }
}
