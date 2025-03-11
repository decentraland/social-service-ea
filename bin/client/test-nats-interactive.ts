import { connect, NatsConnection } from 'nats'
import readline from 'readline'

async function main() {
  const nc: NatsConnection = await connect({ servers: 'nats://localhost:4222' })

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  console.log('Connected to NATS server')
  console.log('Enter peerId to simulate events (or "exit" to quit)')
  while (true) {
    const peerId = await new Promise<string>((resolve, reject) => rl.question('PeerId: ', resolve))

    if (peerId.toLowerCase() === 'exit') break

    console.log('Select event type:')
    console.log('1. Connect')
    console.log('2. Disconnect')
    console.log('3. Heartbeat')

    const choice = await new Promise<string>((resolve, reject) => rl.question('Choice (1-3): ', resolve))

    let pattern: string
    switch (choice) {
      case '1':
        pattern = `peer.${peerId}.connect`
        break
      case '2':
        pattern = `peer.${peerId}.disconnect`
        break
      case '3':
        pattern = `peer.${peerId}.heartbeat`
        break
      default:
        console.log('Invalid choice')
        continue
    }

    nc.publish(pattern, '')
    await nc.flush()
    console.log(`Published message to ${pattern}`)
  }

  rl.close()
  await nc.close()
}

main()
  .then(() => console.log('Done'))
  .catch((err) => console.error('Error:', err))
