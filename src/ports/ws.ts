import { WebSocketServer } from 'ws'
import { IWebSocketComponent } from '../types'

export async function createWsComponent(): Promise<IWebSocketComponent> {
  let wss: WebSocketServer | undefined

  async function start() {
    if (wss) return

    wss = new WebSocketServer({ noServer: true })
  }

  async function stop() {
    wss?.close()
    wss = undefined
  }

  await start()

  return {
    start,
    stop,
    ws: wss!
  }
}
