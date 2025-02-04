import mitt from 'mitt'
import { onRequestEnd, onRequestStart } from '@well-known-components/uws-http-server'
import { verify } from '@dcl/platform-crypto-middleware'
import { AppComponents, WsUserData } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { IUWebSocketEventMap, UWebSocketTransport } from '../../utils/UWebSocketTransport'
import { isNotAuthenticated } from '../../utils/wsUserData'

const textDecoder = new TextDecoder()

export async function registerWsHandler(
  components: Pick<AppComponents, 'logs' | 'server' | 'metrics' | 'fetcher' | 'rpcServer'>
) {
  const { logs, server, metrics, fetcher, rpcServer } = components
  const logger = logs.getLogger('ws-handler')

  function changeStage(data: WsUserData, newData: WsUserData) {
    Object.assign(data, newData)
  }

  server.app.ws<WsUserData>('/', {
    idleTimeout: 0,
    upgrade: (res, req, context) => {
      logger.debug('upgrade requested')
      const { labels, end } = onRequestStart(metrics, req.getMethod(), '/ws')
      res.upgrade(
        {
          isConnected: false,
          auth: false
        },
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context
      )
      onRequestEnd(metrics, labels, 101, end)
    },
    open: (ws) => {
      const data = ws.getUserData()
      metrics.increment('ws_connections')
      data.isConnected = true
    },
    message: async (ws, message) => {
      const data = ws.getUserData()
      metrics.increment('ws_messages_received')

      if (data.auth) {
        try {
          if (!data.isConnected) {
            logger.warn('Received message but connection is marked as disconnected', { address: data.address })
            return
          }

          data.eventEmitter.emit('message', message)
          metrics.increment('ws_messages_sent', { address: data.address })
        } catch (error: any) {
          logger.error('Error emitting message', {
            error,
            address: data.address,
            isConnected: String(data.isConnected),
            hasEventEmitter: String(!!data.eventEmitter)
          })
          metrics.increment('ws_errors', { address: data.address })
          ws.send(JSON.stringify({ error: 'Error processing message', message: error.message }))
        }
      } else if (isNotAuthenticated(data)) {
        clearTimeout(data.timeout)
        data.timeout = undefined

        try {
          const authChainMessage = textDecoder.decode(message)

          const verifyResult = await verify('get', '/', JSON.parse(authChainMessage), {
            fetcher
          })
          const address = normalizeAddress(verifyResult.auth)

          logger.debug('address > ', { address })

          const eventEmitter = mitt<IUWebSocketEventMap>()
          changeStage(data, {
            auth: true,
            address,
            eventEmitter,
            isConnected: true
          })

          const transport = UWebSocketTransport(ws, eventEmitter)

          rpcServer.attachUser({ transport, address })

          transport.on('error', (err) => {
            if (err && err.message) {
              logger.error(`Error on transport: ${err.message}`)
            }
          })
        } catch (error: any) {
          logger.error(`Error verifying auth chain: ${error.message}`)
          ws.close()
        }
      }
    },
    close: (ws, code, _message) => {
      logger.debug(`Websocket closed ${code}, ${_message}`)
      const data = ws.getUserData()

      if (data.auth) {
        if (data.address) {
          rpcServer.detachUser(data.address)
        }
        data.eventEmitter.emit('close', code)
        data.eventEmitter.all.clear()
        metrics.increment('ws_connections', { address: data.address })
      } else if (isNotAuthenticated(data)) {
        clearTimeout(data.timeout)
        data.timeout = undefined
        metrics.increment('ws_connections')
      }

      data.isConnected = false
      changeStage(data, { auth: false, isConnected: false, timeout: undefined })
    }
  })
}
