/**
 * credential-map — pinning the two-table contract.
 *
 * The HTTP path (legacy Python OpenBB sidecar) and the SDK path
 * (in-process opentypebb) want different field names for the same
 * underlying user key. `fred` is the canonical example: HTTP wants
 * `fred_api_key`, SDK wants `federal_reserve_api_key` (provider
 * auto-prefix, see Provider constructor in the opentypebb package).
 *
 * If a future change merges these mappings back into one table, this
 * test fails — and that's the point. The two-table split is intentional.
 */

import { describe, it, expect } from 'vitest'
import { buildSDKCredentials, buildCredentialsHeader } from '../credential-map.js'

describe('buildSDKCredentials — in-process opentypebb path', () => {
  it('maps fred → federal_reserve_api_key (provider name auto-prefix)', () => {
    expect(buildSDKCredentials({ fred: 'k1' })).toEqual({ federal_reserve_api_key: 'k1' })
  })

  it('maps fmp → fmp_api_key (user key matches provider name)', () => {
    expect(buildSDKCredentials({ fmp: 'k2' })).toEqual({ fmp_api_key: 'k2' })
  })

  it('maps multiple providers in one call', () => {
    expect(buildSDKCredentials({ fred: 'k1', fmp: 'k2', bls: 'k3' })).toEqual({
      federal_reserve_api_key: 'k1',
      fmp_api_key: 'k2',
      bls_api_key: 'k3',
    })
  })

  it('returns {} for undefined input', () => {
    expect(buildSDKCredentials(undefined)).toEqual({})
  })

  it('skips entries with empty/undefined values', () => {
    expect(buildSDKCredentials({ fred: undefined, fmp: '' })).toEqual({})
  })

  it('skips unknown provider keys', () => {
    expect(buildSDKCredentials({ fred: 'k1', unknown_provider: 'k2' })).toEqual({
      federal_reserve_api_key: 'k1',
    })
  })
})

describe('buildCredentialsHeader — legacy Python sidecar HTTP path', () => {
  it('still maps fred → fred_api_key (Python OpenBB contract, intentional divergence from SDK path)', () => {
    expect(buildCredentialsHeader({ fred: 'k1' })).toBe(JSON.stringify({ fred_api_key: 'k1' }))
  })

  it('returns undefined when no keys are configured', () => {
    expect(buildCredentialsHeader(undefined)).toBeUndefined()
    expect(buildCredentialsHeader({})).toBeUndefined()
    expect(buildCredentialsHeader({ fred: undefined })).toBeUndefined()
  })

  it('maps multiple providers into one JSON object', () => {
    const header = buildCredentialsHeader({ fred: 'k1', fmp: 'k2' })
    expect(JSON.parse(header!)).toEqual({ fred_api_key: 'k1', fmp_api_key: 'k2' })
  })
})

describe('two-table contract — divergence is intentional', () => {
  it('fred maps to different field names on each path', () => {
    // HTTP: legacy Python OpenBB sidecar expects `fred_api_key`
    expect(JSON.parse(buildCredentialsHeader({ fred: 'k' })!)).toEqual({ fred_api_key: 'k' })
    // SDK: in-process opentypebb expects provider-prefixed `federal_reserve_api_key`
    expect(buildSDKCredentials({ fred: 'k' })).toEqual({ federal_reserve_api_key: 'k' })
  })
})
