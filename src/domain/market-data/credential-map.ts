/**
 * Maps OpenAlice provider key names to credential field names.
 *
 * Two paths, two tables — they look similar but the contracts diverge:
 *
 *   1. HTTP path (legacy Python OpenBB sidecar via X-OpenBB-Credentials header)
 *      → field name follows OpenBB Python convention: `<user_key>_api_key`.
 *   2. SDK path (in-process @traderalice/opentypebb)
 *      → field name follows the provider's auto-prefixed credential
 *      (`Provider` constructor at packages/opentypebb/src/core/provider/abstract/provider.ts:54-59
 *      prepends the provider name to declared credentials, so e.g.
 *      `federal_reserve` provider with `credentials: ['api_key']` ends up
 *      requiring `federal_reserve_api_key`).
 *
 * For most providers the user-facing key matches the SDK provider name
 * (fmp/bls/eia/...), so both tables agree. Only `fred` (user-key) ↔
 * `federal_reserve` (provider-name) diverges — that's the row that has
 * to differ. Keep the tables independent so future divergences (or
 * provider-name renames) don't silently couple the two paths.
 */

const httpKeyMapping: Record<string, string> = {
  fred: 'fred_api_key',
  fmp: 'fmp_api_key',
  eia: 'eia_api_key',
  bls: 'bls_api_key',
  nasdaq: 'nasdaq_api_key',
  tradingeconomics: 'tradingeconomics_api_key',
  econdb: 'econdb_api_key',
  intrinio: 'intrinio_api_key',
  benzinga: 'benzinga_api_key',
  tiingo: 'tiingo_token',
  biztoc: 'biztoc_api_key',
}

const sdkKeyMapping: Record<string, string> = {
  fred: 'federal_reserve_api_key',  // user-key ≠ provider-name; SDK path needs provider-prefixed name
  fmp: 'fmp_api_key',
  eia: 'eia_api_key',
  bls: 'bls_api_key',
  nasdaq: 'nasdaq_api_key',
  tradingeconomics: 'tradingeconomics_api_key',
  econdb: 'econdb_api_key',
  intrinio: 'intrinio_api_key',
  benzinga: 'benzinga_api_key',
  tiingo: 'tiingo_token',
  biztoc: 'biztoc_api_key',
}

function applyMapping(
  providerKeys: Record<string, string | undefined> | undefined,
  table: Record<string, string>,
): Record<string, string> {
  if (!providerKeys) return {}
  const mapped: Record<string, string> = {}
  for (const [k, v] of Object.entries(providerKeys)) {
    if (v && table[k]) mapped[table[k]] = v
  }
  return mapped
}

/**
 * Build the JSON string for the X-OpenBB-Credentials header (legacy
 * Python OpenBB sidecar HTTP path).
 * Returns undefined if no keys are configured.
 */
export function buildCredentialsHeader(
  providerKeys: Record<string, string | undefined> | undefined,
): string | undefined {
  const mapped = applyMapping(providerKeys, httpKeyMapping)
  return Object.keys(mapped).length > 0 ? JSON.stringify(mapped) : undefined
}

/**
 * Build credentials object for the in-process OpenTypeBB SDK executor.
 * Field names follow the SDK's auto-prefixed credential convention
 * (provider name + cred name) — see file header for why this differs
 * from the HTTP header path.
 */
export function buildSDKCredentials(
  providerKeys: Record<string, string | undefined> | undefined,
): Record<string, string> {
  return applyMapping(providerKeys, sdkKeyMapping)
}
