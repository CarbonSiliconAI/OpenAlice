/**
 * Integration test — reqContractDetails for AAPL.
 * Usage: npx tsx tests/contract-details.integration.ts [port]
 */

import { EClient, DefaultEWrapper, Contract, type ContractDetails } from '../src/index.js'
import { applyAllHandlers } from '../src/decoder'

class TestWrapper extends DefaultEWrapper {
  connectAck(): void {
    console.log('✓ connected')
  }

  nextValidId(orderId: number): void {
    console.log(`✓ nextValidId: ${orderId}`)
    // Connection ready — now request AAPL contract details
    console.log('\nRequesting contract details for AAPL...')
    const contract = new Contract()
    contract.symbol = 'AAPL'
    contract.secType = 'STK'
    contract.exchange = 'SMART'
    contract.currency = 'USD'
    client.reqContractDetails(1, contract)
  }

  managedAccounts(accountsList: string): void {
    console.log(`✓ managedAccounts: ${accountsList}`)
  }

  contractDetails(reqId: number, contractDetails: ContractDetails): void {
    console.log(`\n✓ contractDetails [reqId=${reqId}]:`)
    console.log(`  symbol: ${contractDetails.contract.symbol}`)
    console.log(`  conId: ${contractDetails.contract.conId}`)
    console.log(`  longName: ${contractDetails.longName}`)
    console.log(`  exchange: ${contractDetails.contract.exchange}`)
    console.log(`  primaryExchange: ${contractDetails.contract.primaryExchange}`)
    console.log(`  secType: ${contractDetails.contract.secType}`)
    console.log(`  currency: ${contractDetails.contract.currency}`)
    console.log(`  minTick: ${contractDetails.minTick}`)
    console.log(`  orderTypes: ${contractDetails.orderTypes?.substring(0, 80)}...`)
  }

  contractDetailsEnd(reqId: number): void {
    console.log(`\n✓ contractDetailsEnd [reqId=${reqId}]`)
    console.log('\nTest passed! Disconnecting...')
    setTimeout(() => {
      client.disconnect()
      process.exit(0)
    }, 500)
  }

  error(reqId: number, _errorTime: number, errorCode: number, errorString: string): void {
    console.log(`⚠ error [${reqId}] code=${errorCode}: ${errorString}`)
  }

  connectionClosed(): void {
    console.log('connection closed')
  }
}

const port = parseInt(process.argv[2] || '7497', 10)
const wrapper = new TestWrapper()
const client = new EClient(wrapper)

console.log(`Connecting to 127.0.0.1:${port}...`)
client.connect('127.0.0.1', port, 0).catch((err: any) => {
  console.error('Connect failed:', err.message)
  process.exit(1)
})

setTimeout(() => {
  console.error('Timeout — no response after 15s')
  client.disconnect()
  process.exit(1)
}, 15000)
