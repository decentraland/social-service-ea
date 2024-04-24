import mitt from 'mitt'
import { onRequestEnd, onRequestStart } from '@well-known-components/uws-http-server'
import { verify } from '@dcl/platform-crypto-middleware'
import { AppComponents, WsUserData } from '../../types'
import { normalizeAddress } from '../../utils/address'
import { IUWebSocketEventMap, UWebSocketTransport } from '../../utils/UWebSocketTransport'

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
      logger.debug('ws open')
      const data = ws.getUserData()
      // just for type assertion
      if (!data.auth) {
        data.timeout = setTimeout(() => {
          try {
            logger.error('closing connection, no authchain received')
            ws.end()
          } catch (err) {}
        }, 30000)
      }
      data.isConnected = true
    },
    message: async (ws, message) => {
      const data = ws.getUserData()

      if (data.auth) {
        data.eventEmitter.emit('message', message)
      } else {
        clearTimeout(data.timeout)
        data.timeout = undefined

        try {
          const authChainMessage = textDecoder.decode(message)

          const verifyResult = await verify('get', '/', JSON.parse(authChainMessage), {
            fetcher
          })
          const address = normalizeAddress(verifyResult.auth)

          logger.debug('addresss > ', { address })

          const eventEmitter = mitt<IUWebSocketEventMap>()
          changeStage(data, { auth: true, address, eventEmitter, isConnected: true })

          const transport = UWebSocketTransport(ws, eventEmitter)

          rpcServer.attachUser({ transport, address })

          transport.on('error', (err) => {
            if (err && err.message) {
              logger.error(err)
            }
          })
        } catch (error) {
          console.log(error)
          logger.error(error as any)
          ws.close()
        }
      }
    },
    close: (ws, code, _message) => {
      logger.debug(`Websocket closed ${code}`)
      const data = ws.getUserData()
      if (data.auth) {
        data.isConnected = false
        data.eventEmitter.emit('close', code)
      }
    }
  })
}
