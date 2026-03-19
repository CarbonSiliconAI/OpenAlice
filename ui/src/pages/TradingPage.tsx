import { useState, useEffect, useCallback } from 'react'
import { Section, Field, inputClass } from '../components/form'
import { Toggle } from '../components/Toggle'
import { GuardsSection, CRYPTO_GUARD_TYPES, SECURITIES_GUARD_TYPES } from '../components/guards'
import { SDKSelector, PLATFORM_TYPE_OPTIONS } from '../components/SDKSelector'
import { ReconnectButton } from '../components/ReconnectButton'
import { useTradingConfig } from '../hooks/useTradingConfig'
import { PageHeader } from '../components/PageHeader'
import type { PlatformConfig, CcxtPlatformConfig, AlpacaPlatformConfig, AccountConfig } from '../api/types'

// ==================== Dialog state ====================

type DialogState =
  | { kind: 'edit'; accountId: string }
  | { kind: 'add' }
  | null

// ==================== Page ====================

export function TradingPage() {
  const tc = useTradingConfig()
  const [dialog, setDialog] = useState<DialogState>(null)

  // Close dialog if the selected account was deleted
  useEffect(() => {
    if (dialog?.kind === 'edit') {
      if (!tc.accounts.some((a) => a.id === dialog.accountId)) setDialog(null)
    }
  }, [tc.accounts, dialog])

  if (tc.loading) return <PageShell subtitle="Loading..." />
  if (tc.error) {
    return (
      <PageShell subtitle="Failed to load trading configuration.">
        <p className="text-[13px] text-red">{tc.error}</p>
        <button onClick={tc.refresh} className="mt-2 px-3 py-1.5 text-[13px] font-medium rounded-md border border-border hover:bg-bg-tertiary transition-colors">
          Retry
        </button>
      </PageShell>
    )
  }

  const getPlatform = (platformId: string) => tc.platforms.find((p) => p.id === platformId)

  const deleteAccountWithPlatform = async (accountId: string) => {
    const account = tc.accounts.find((a) => a.id === accountId)
    if (!account) return
    const platformId = account.platformId
    await tc.deleteAccount(accountId)
    const remaining = tc.accounts.filter((a) => a.id !== accountId && a.platformId === platformId)
    if (remaining.length === 0) {
      try { await tc.deletePlatform(platformId) } catch { /* best effort */ }
    }
    setDialog(null)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader title="Trading" description="Configure your trading accounts." />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
        <div className="max-w-[720px] space-y-4">
          <AccountsTable
            accounts={tc.accounts}
            platforms={tc.platforms}
            onSelect={(id) => setDialog({ kind: 'edit', accountId: id })}
          />

          <button
            onClick={() => setDialog({ kind: 'add' })}
            className="text-[12px] text-text-muted hover:text-text transition-colors"
          >
            + Add Account
          </button>
        </div>
      </div>

      {/* Create Wizard */}
      {dialog?.kind === 'add' && (
        <CreateWizard
          existingAccountIds={tc.accounts.map((a) => a.id)}
          onSave={async (platform, account) => {
            await tc.savePlatform(platform)
            await tc.saveAccount(account)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {/* Edit Dialog */}
      {dialog?.kind === 'edit' && (() => {
        const account = tc.accounts.find((a) => a.id === dialog.accountId)
        const platform = account ? getPlatform(account.platformId) : undefined
        if (!account || !platform) return null
        return (
          <EditDialog
            account={account}
            platform={platform}
            onSaveAccount={tc.saveAccount}
            onSavePlatform={tc.savePlatform}
            onDelete={() => deleteAccountWithPlatform(account.id)}
            onClose={() => setDialog(null)}
          />
        )
      })()}
    </div>
  )
}

// ==================== Page Shell ====================

function PageShell({ subtitle, children }: { subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader title="Trading" description={subtitle} />
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">{children}</div>
    </div>
  )
}

// ==================== Dialog ====================

function Dialog({ onClose, width, children }: {
  onClose: () => void
  width?: string
  children: React.ReactNode
}) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Content */}
      <div className={`relative ${width || 'w-[480px]'} max-w-[95vw] max-h-[85vh] bg-bg rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden`}>
        {children}
      </div>
    </div>
  )
}

// ==================== Accounts Table ====================

function AccountsTable({ accounts, platforms, onSelect }: {
  accounts: AccountConfig[]
  platforms: PlatformConfig[]
  onSelect: (id: string) => void
}) {
  const getPlatform = (platformId: string) => platforms.find((p) => p.id === platformId)

  const getConnectionLabel = (account: AccountConfig) => {
    const p = getPlatform(account.platformId)
    if (!p) return '—'
    if (p.type === 'ccxt') {
      return p.exchange
    }
    return p.paper ? 'paper' : 'live'
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <p className="text-[13px] text-text-muted">No accounts configured.</p>
        <p className="text-[11px] text-text-muted/60 mt-1">Click "+ Add Account" to connect your first trading account.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-bg-secondary/50 text-text-muted text-[11px] uppercase tracking-wider">
            <th className="text-left pl-4 pr-2 py-2.5 font-medium w-[40px]"></th>
            <th className="text-left px-3 py-2.5 font-medium">Account</th>
            <th className="text-left px-3 py-2.5 font-medium">Connection</th>
            <th className="text-left px-3 py-2.5 font-medium">Guards</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {accounts.map((account) => {
            const p = getPlatform(account.platformId)
            const badge = p?.type === 'ccxt'
              ? { text: 'CC', color: 'text-accent bg-accent/10' }
              : { text: 'AL', color: 'text-green bg-green/10' }

            return (
              <tr
                key={account.id}
                onClick={() => onSelect(account.id)}
                className="cursor-pointer transition-colors hover:bg-bg-tertiary/30"
              >
                <td className="pl-4 pr-2 py-2.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.color}`}>
                    {badge.text}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-medium text-text">{account.id}</td>
                <td className="px-3 py-2.5 text-text-muted">{getConnectionLabel(account)}</td>
                <td className="px-3 py-2.5 text-text-muted">
                  {account.guards.length > 0 ? account.guards.length : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ==================== Create Wizard ====================

function CreateWizard({ existingAccountIds, onSave, onClose }: {
  existingAccountIds: string[]
  onSave: (platform: PlatformConfig, account: AccountConfig) => Promise<void>
  onClose: () => void
}) {
  const [step, setStep] = useState(1)
  const [type, setType] = useState<'ccxt' | 'alpaca' | null>(null)

  // Step 2 fields
  const [id, setId] = useState('')
  const [exchange, setExchange] = useState('binance')
  const [marketType, setMarketType] = useState<'swap' | 'spot'>('swap')
  const [sandbox, setSandbox] = useState(false)
  const [demoTrading, setDemoTrading] = useState(false)
  const [paper, setPaper] = useState(true)

  // Step 3 fields
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const defaultId = type === 'ccxt' ? `${exchange}-main` : 'alpaca-paper'
  const finalId = id.trim() || defaultId

  const handleSelectType = (t: string) => {
    setType(t as 'ccxt' | 'alpaca')
    setStep(2)
  }

  const handleNext = () => {
    if (existingAccountIds.includes(finalId)) {
      setError(`Account "${finalId}" already exists`)
      return
    }
    setError('')
    setStep(3)
  }

  const handleCreate = async () => {
    setSaving(true); setError('')
    try {
      const platformId = `${finalId}-platform`
      const platform: PlatformConfig = type === 'ccxt'
        ? { id: platformId, type: 'ccxt', exchange, sandbox, demoTrading }
        : { id: platformId, type: 'alpaca', paper }
      const account: AccountConfig = {
        id: finalId, platformId,
        ...(apiKey && { apiKey }),
        ...(apiSecret && { apiSecret }),
        ...(password && type === 'ccxt' && { password }),
        guards: [],
      }
      await onSave(platform, account)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
      setSaving(false)
    }
  }

  return (
    <Dialog onClose={onClose}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-[14px] font-semibold text-text">New Account</h3>
        <span className="text-[11px] text-text-muted">Step {step}/3</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-[13px] text-text-muted">Choose your platform</p>
            <SDKSelector options={PLATFORM_TYPE_OPTIONS} selected="" onSelect={handleSelectType} />
          </div>
        )}

        {step === 2 && type === 'ccxt' && (
          <div className="space-y-3">
            <p className="text-[13px] text-text-muted mb-4">Configure your connection</p>
            <Field label="Account ID">
              <input className={inputClass} value={id} onChange={(e) => setId(e.target.value.trim())} placeholder={defaultId} />
            </Field>
            <Field label="Exchange">
              <input className={inputClass} value={exchange} onChange={(e) => setExchange(e.target.value.trim())} placeholder="binance" />
            </Field>
            <Field label="Market Type">
              <select className={inputClass} value={marketType} onChange={(e) => setMarketType(e.target.value as 'swap' | 'spot')}>
                <option value="swap">Perpetual Swap</option>
                <option value="spot">Spot</option>
              </select>
            </Field>
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Toggle checked={sandbox} onChange={setSandbox} />
                <span className="text-[13px] text-text">Sandbox Mode</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Toggle checked={demoTrading} onChange={setDemoTrading} />
                <span className="text-[13px] text-text">Demo Trading</span>
              </label>
            </div>
            {error && <p className="text-[12px] text-red">{error}</p>}
          </div>
        )}

        {step === 2 && type === 'alpaca' && (
          <div className="space-y-3">
            <p className="text-[13px] text-text-muted mb-4">Configure your connection</p>
            <Field label="Account ID">
              <input className={inputClass} value={id} onChange={(e) => setId(e.target.value.trim())} placeholder={defaultId} />
            </Field>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Toggle checked={paper} onChange={setPaper} />
              <span className="text-[13px] text-text">Paper Trading</span>
            </label>
            <p className="text-[11px] text-text-muted/60">When enabled, orders are routed to Alpaca's paper trading environment.</p>
            {error && <p className="text-[12px] text-red">{error}</p>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-[13px] text-text-muted mb-4">API Credentials</p>
            <Field label="API Key">
              <input className={inputClass} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Optional — can be added later" />
            </Field>
            <Field label={type === 'alpaca' ? 'Secret Key' : 'API Secret'}>
              <input className={inputClass} type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Optional — can be added later" />
            </Field>
            {type === 'ccxt' && (
              <Field label="Password">
                <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Required by some exchanges (e.g. OKX)" />
              </Field>
            )}
            {error && <p className="text-[12px] text-red">{error}</p>}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
        {step === 1 && (
          <button onClick={onClose} className="px-3 py-1.5 text-[13px] font-medium rounded-md border border-border hover:bg-bg-tertiary transition-colors">
            Cancel
          </button>
        )}
        {step > 1 && (
          <button onClick={() => { setStep(step - 1); setError('') }} className="btn-secondary-sm">
            Back
          </button>
        )}
        {step === 2 && (
          <button onClick={handleNext} className="btn-primary-sm">
            Next
          </button>
        )}
        {step === 3 && (
          <button onClick={handleCreate} disabled={saving} className="btn-primary-sm">
            {saving ? 'Creating...' : 'Create'}
          </button>
        )}
      </div>
    </Dialog>
  )
}

// ==================== Edit Dialog ====================

function EditDialog({ account, platform, onSaveAccount, onSavePlatform, onDelete, onClose }: {
  account: AccountConfig
  platform: PlatformConfig
  onSaveAccount: (a: AccountConfig) => Promise<void>
  onSavePlatform: (p: PlatformConfig) => Promise<void>
  onDelete: () => Promise<void>
  onClose: () => void
}) {
  const [accountDraft, setAccountDraft] = useState(account)
  const [platformDraft, setPlatformDraft] = useState(platform)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [guardsOpen, setGuardsOpen] = useState(false)

  useEffect(() => { setAccountDraft(account) }, [account])
  useEffect(() => { setPlatformDraft(platform) }, [platform])

  const dirty =
    JSON.stringify(accountDraft) !== JSON.stringify(account) ||
    JSON.stringify(platformDraft) !== JSON.stringify(platform)

  const patchAccount = (field: keyof AccountConfig, value: unknown) => {
    setAccountDraft((d) => ({ ...d, [field]: value }))
  }

  const patchPlatform = (field: string, value: unknown) => {
    setPlatformDraft((d) => ({ ...d, [field]: value }) as PlatformConfig)
  }

  const handleSave = async () => {
    setSaving(true); setMsg('')
    try {
      if (JSON.stringify(platformDraft) !== JSON.stringify(platform)) {
        await onSavePlatform(platformDraft)
      }
      if (JSON.stringify(accountDraft) !== JSON.stringify(account)) {
        await onSaveAccount(accountDraft)
      }
      setMsg('Saved')
      setTimeout(() => setMsg(''), 2000)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const guardTypes = platform.type === 'ccxt' ? CRYPTO_GUARD_TYPES : SECURITIES_GUARD_TYPES

  return (
    <Dialog onClose={onClose} width="w-[520px]">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-[14px] font-semibold text-text truncate">{account.id}</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text p-1 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Connection */}
        <Section title="Connection">
          <div className="mb-3">
            <span className="text-[12px] text-text-muted">Type</span>
            <span className="ml-2 text-[12px] font-medium text-text">
              {platform.type === 'ccxt' ? 'CCXT' : 'Alpaca'}
            </span>
          </div>
          {platformDraft.type === 'ccxt' ? (
            <CcxtConnectionFields draft={platformDraft} onPatch={patchPlatform} />
          ) : (
            <AlpacaConnectionFields draft={platformDraft} onPatch={patchPlatform} />
          )}
        </Section>

        {/* Credentials */}
        <Section title="Credentials">
          <Field label="API Key">
            <input className={inputClass} type="password" value={accountDraft.apiKey || ''} onChange={(e) => patchAccount('apiKey', e.target.value)} placeholder="Not configured" />
          </Field>
          <Field label={platform.type === 'alpaca' ? 'Secret Key' : 'API Secret'}>
            <input className={inputClass} type="password" value={accountDraft.apiSecret || ''} onChange={(e) => patchAccount('apiSecret', e.target.value)} placeholder="Not configured" />
          </Field>
          {platform.type === 'ccxt' && (
            <Field label="Password (optional)">
              <input className={inputClass} type="password" value={accountDraft.password || ''} onChange={(e) => patchAccount('password', e.target.value)} placeholder="Required by some exchanges (e.g. OKX)" />
            </Field>
          )}
        </Section>

        {/* Guards */}
        <div>
          <button
            onClick={() => setGuardsOpen(!guardsOpen)}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-text-muted uppercase tracking-wide"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform duration-150 ${guardsOpen ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Guards ({accountDraft.guards.length})
          </button>
          {guardsOpen && (
            <div className="mt-3">
              <GuardsSection
                guards={accountDraft.guards}
                guardTypes={guardTypes}
                description="Guards validate operations before execution. Order matters."
                onChange={(guards) => patchAccount('guards', guards)}
                onChangeImmediate={(guards) => patchAccount('guards', guards)}
              />
            </div>
          )}
        </div>

        {/* Delete */}
        <div className="border-t border-border pt-3">
          <DeleteButton label="Delete Account" onConfirm={onDelete} />
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-t border-border">
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary-sm"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        {msg && <span className="text-[12px] text-text-muted">{msg}</span>}
        <div className="flex-1" />
        <ReconnectButton accountId={account.id} />
      </div>
    </Dialog>
  )
}

// ==================== Connection Fields ====================

function CcxtConnectionFields({ draft, onPatch }: {
  draft: CcxtPlatformConfig
  onPatch: (field: string, value: unknown) => void
}) {
  return (
    <>
      <Field label="Exchange">
        <input className={inputClass} value={draft.exchange} onChange={(e) => onPatch('exchange', e.target.value.trim())} placeholder="binance" />
      </Field>
      <div className="space-y-2">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Toggle checked={draft.sandbox} onChange={(v) => onPatch('sandbox', v)} />
          <span className="text-[13px] text-text">Sandbox Mode</span>
        </label>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Toggle checked={draft.demoTrading} onChange={(v) => onPatch('demoTrading', v)} />
          <span className="text-[13px] text-text">Demo Trading</span>
        </label>
      </div>
    </>
  )
}

function AlpacaConnectionFields({ draft, onPatch }: {
  draft: AlpacaPlatformConfig
  onPatch: (field: string, value: unknown) => void
}) {
  return (
    <>
      <label className="flex items-center gap-2.5 cursor-pointer">
        <Toggle checked={draft.paper} onChange={(v) => onPatch('paper', v)} />
        <span className="text-[13px] text-text">Paper Trading</span>
      </label>
      <p className="text-[11px] text-text-muted/60 mt-1">When enabled, orders are routed to Alpaca's paper trading environment.</p>
    </>
  )
}

// ==================== Delete Button ====================

function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => { onConfirm(); setConfirming(false) }} className="text-[11px] text-red hover:text-red/80 font-medium transition-colors">
          Confirm
        </button>
        <button onClick={() => setConfirming(false)} className="text-[11px] text-text-muted hover:text-text transition-colors">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => setConfirming(true)} className="text-[11px] text-text-muted hover:text-red transition-colors">
      {label}
    </button>
  )
}
