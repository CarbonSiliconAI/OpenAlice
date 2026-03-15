/**
 * Integration test — connect to TWS/IB Gateway and request current time.
 * Requires a running TWS/IB Gateway instance.
 * Usage: npx tsx tests/connect.integration.ts [port]
 */

import { EClient, DefaultEWrapper } from '../src/index.js'

class TestWrapper extends DefaultEWrapper {
  connectAck(): void {
    console.log('✓ connectAck — connection established')
  }

  nextValidId(orderId: number): void {
    console.log(`✓ nextValidId: ${orderId}`)
  }

  managedAccounts(accountsList: string): void {
    console.log(`✓ managedAccounts: ${accountsList}`)
  }

  currentTime(time: number): void {
    console.log(`✓ currentTime: ${time} (${new Date(time * 1000).toISOString()})`)
    // Got a response — test passed, disconnect
    setTimeout(() => {
      console.log('\nTest passed! Disconnecting...')
      client.disconnect()
      process.exit(0)
    }, 1000)
  }

  error(reqId: number, errorTime: number, errorCode: number, errorString: string): void {
    console.log(`⚠ error [${reqId}] code=${errorCode}: ${errorString}`)
  }

  connectionClosed(): void {
    console.log('✗ connectionClosed')
  }
}

const port = parseInt(process.argv[2] || '7497', 10)
const wrapper = new TestWrapper()
const client = new EClient(wrapper)

console.log(`Connecting to 127.0.0.1:${port}...`)
client.connect('127.0.0.1', port, 0).then(() => {
  console.log(`Server version: ${client.serverVersion()}`)
  console.log(`Connection time: ${client.twsConnectionTime()}`)
  console.log('Requesting current time...')
  client.reqCurrentTime()
}).catch((err: any) => {
  console.error('Connect failed:', err.message)
  process.exit(1)
})

// Timeout after 10 seconds
setTimeout(() => {
  console.error('Timeout — no response after 10s')
  client.disconnect()
  process.exit(1)
}, 10000)
