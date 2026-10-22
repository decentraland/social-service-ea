import WebSocket from 'ws'
import { createAuthHeaders, Identity } from './auth'
import { TestComponents } from '../../../src/types'

export type StreamMessage = { type: string; [key: string]: any }

export type StreamClient = {
  socket: WebSocket
  /** Every message received so far, in order. */
  received: StreamMessage[]
  send: (message: unknown) => void
  sendRaw: (data: string | Buffer) => void
  /** Resolves with the first not-yet-consumed message matching the predicate. */
  waitFor: (predicate: (message: StreamMessage) => boolean, timeoutMs?: number) => Promise<StreamMessage>
  /** Asserts nothing matching arrives within the window; resolves with the matches (usually none). */
  collect: (predicate: (message: StreamMessage) => boolean, windowMs: number) => Promise<StreamMessage[]>
  closed: Promise<{ code: number; reason: string }>
  close: () => void
}

export function streamUrl(port: string | undefined): string {
  return `ws://127.0.0.1:${port}/v1/stream`
}

/**
 * Opens a socket on the plain-JSON stream protocol. When `identity` is given the auth chain is sent
 * as the first frame and the promise resolves after the server's `ready`; otherwise the raw socket is
 * returned and the test drives the handshake itself.
 */
export async function connectStreamClient(
  { config }: Pick<TestComponents, 'config'>,
  identity?: Identity | null
): Promise<StreamClient> {
  const port = await config.getString('RPC_SERVER_PORT')
  const socket = new WebSocket(streamUrl(port))

  const received: StreamMessage[] = []
  const consumed = new Set<StreamMessage>()
  const waiters: Array<() => void> = []

  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() }))
  })

  socket.on('message', (data) => {
    try {
      received.push(JSON.parse(data.toString()))
    } catch {
      received.push({ type: '__unparseable__', raw: data.toString() })
    }
    waiters.splice(0).forEach((wake) => wake())
  })

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })

  const waitFor: StreamClient['waitFor'] = (predicate, timeoutMs = 5000) =>
    new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Timed out waiting for a stream message')), timeoutMs)
      const check = () => {
        const match = received.find((message) => !consumed.has(message) && predicate(message))
        if (match) {
          consumed.add(match)
          clearTimeout(deadline)
          resolve(match)
          return
        }
        waiters.push(check)
      }
      check()
    })

  const client: StreamClient = {
    socket,
    received,
    send: (message) => socket.send(JSON.stringify(message)),
    sendRaw: (data) => socket.send(data),
    waitFor,
    collect: async (predicate, windowMs) => {
      await new Promise((resolve) => setTimeout(resolve, windowMs))
      return received.filter((message) => !consumed.has(message) && predicate(message))
    },
    closed,
    close: () => socket.close()
  }

  if (identity) {
    client.send(createAuthHeaders('get', '/', {}, identity))
    await waitFor((message) => message.type === 'ready')
  }

  return client
}
