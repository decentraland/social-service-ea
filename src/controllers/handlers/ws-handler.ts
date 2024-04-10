import { IHttpServerComponent } from '@well-known-components/interfaces'
import { upgradeWebSocketResponse } from '@well-known-components/http-server/dist/ws'
import { WebSocket, MessageEvent } from 'ws'
import { WebSocketTransport } from '@dcl/rpc/dist/transports/WebSocket'
import future from 'fp-future'
import { verify } from '@dcl/platform-crypto-middleware'
import { GlobalContext } from '../../types'

export async function wsHandler(context: IHttpServerComponent.DefaultContext<GlobalContext>) {
  const { logs, rpcServer, fetcher } = context.components
  const logger = logs.getLogger('ws-handler')

  return upgradeWebSocketResponse(async (socket) => {
    let isAlive = true
    const ws = socket as any as WebSocket
    // it's needed bc of cloudflare
    const pingInterval = setInterval(() => {
      if (isAlive === false) {
        logger.warn('terminating ws because of ping timeout')
        return ws.terminate()
      }
      logger.debug('pinging websocket bc of cloudflare')
      isAlive = false
      ws.ping()
    }, 30000)

    ws.on('close', () => {
      logger.debug('closing websocket')
      clearInterval(pingInterval)
    })

    ws.on('pong', () => {
      logger.debug('PONG')
      isAlive = true
    })

    const authChainPromise = future()

    function receiveAuthchainAsFirstMessage(event: MessageEvent) {
      if (typeof event.data === 'string') {
        authChainPromise.resolve(JSON.parse(event.data))
      } else {
        authChainPromise.reject(new Error('INVALID_MESSAGE'))
      }
    }

    ws.addEventListener('message', receiveAuthchainAsFirstMessage)

    try {
      const authChain = await Promise.race([sleep30Secs(), authChainPromise])
      ws.removeEventListener('message', receiveAuthchainAsFirstMessage)

      const authchainVerifyResult = await verify('get', '/', authChain, {
        fetcher,
        expiration: 1000 * 240
      })

      const wsTransport = WebSocketTransport(socket)

      logger.debug('addresss > ', { address: authchainVerifyResult.auth })

      rpcServer.attachTransport(wsTransport, { components: context.components, address: authchainVerifyResult.auth })

      wsTransport.on('error', (err) => {
        if (err && err.message) {
          logger.error(err)
        }
      })
    } catch (error) {
      // rejects if timeout, invalid first message or authchain verify error
      logger.error(error as Error)
      ws.close()
    }
  })
}

const sleep30Secs = () =>
  new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error('TIMEOUT_WAITING_FOR_AUTCHAIN')), 30000)
  })
