import { useState, useEffect, useRef } from 'react'
import { api, type Profile, type AIBackend } from '../api'
import { SaveIndicator } from '../components/SaveIndicator'
import { ConfigSection, Field, inputClass } from '../components/form'
import type { SaveStatus } from '../hooks/useAutoSave'
import { PageHeader } from '../components/PageHeader'
import { PageLoading } from '../components/StateViews'

// ==================== Constants ====================

const BACKEND_INFO: Record<AIBackend, { label: string; icon: React.ReactNode }> = {
  'agent-sdk': {
    label: 'Claude',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6a4 4 0 0 1 4-4z" /><path d="M8 8v2a4 4 0 0 0 8 0V8" /><path d="M12 14v4" /><path d="M8 22h8" /><circle cx="9" cy="5.5" r="0.5" fill="currentColor" stroke="none" /><circle cx="15" cy="5.5" r="0.5" fill="currentColor" stroke="none" /></svg>,
  },
  'codex': {
    label: 'OpenAI / Codex',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="14" y1="4" x2="10" y2="20" /></svg>,
  },
  'vercel-ai-sdk': {
    label: 'Vercel AI SDK',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  },
}

const NEW_PROFILE_DEFAULTS: Record<AIBackend, Omit<Profile, 'label'>> = {
  'agent-sdk':     { backend: 'agent-sdk', model: 'claude-sonnet-4-6', loginMethod: 'claudeai' },
  'codex':         { backend: 'codex', model: 'gpt-5.4', loginMethod: 'codex-oauth' },
  'vercel-ai-sdk': { backend: 'vercel-ai-sdk', model: 'claude-sonnet-4-6', provider: 'anthropic' },
}

// ==================== Main Page ====================

export function AIProviderPage() {
  const [profiles, setProfiles] = useState<Record<string, Profile> | null>(null)
  const [activeProfile, setActiveProfile] = useState('')
  const [apiKeys, setApiKeys] = useState<{ anthropic?: string; openai?: string; google?: string }>({})
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [creating, setCreating] = useState<AIBackend | null>(null)

  useEffect(() => {
    api.config.getProfiles().then(({ profiles: p, activeProfile: a }) => {
      setProfiles(p)
      setActiveProfile(a)
      setSelectedSlug(a)
    }).catch(() => {})
    api.config.getApiKeysStatus().then((status) => {
      setApiKeys({
        ...(status.anthropic ? { anthropic: '(set)' } : {}),
        ...(status.openai ? { openai: '(set)' } : {}),
        ...(status.google ? { google: '(set)' } : {}),
      })
    }).catch(() => {})
  }, [])

  const handleSetActive = async (slug: string) => {
    try {
      await api.config.setActiveProfile(slug)
      setActiveProfile(slug)
    } catch { /* keep old state */ }
  }

  const handleDelete = async (slug: string) => {
    if (!profiles) return
    try {
      await api.config.deleteProfile(slug)
      const updated = { ...profiles }
      delete updated[slug]
      setProfiles(updated)
      if (selectedSlug === slug) setSelectedSlug(activeProfile)
    } catch { /* keep old state */ }
  }

  const handleCreateStart = (backend: AIBackend) => {
    setCreating(backend)
    setSelectedSlug(null)
  }

  const handleCreateSave = async (slug: string, profile: Profile) => {
    try {
      await api.config.createProfile(slug, profile)
      setProfiles((p) => p ? { ...p, [slug]: profile } : p)
      setCreating(null)
      setSelectedSlug(slug)
    } catch { /* form handles error */ }
  }

  const handleProfileUpdate = async (slug: string, profile: Profile) => {
    try {
      await api.config.updateProfile(slug, profile)
      setProfiles((p) => p ? { ...p, [slug]: profile } : p)
    } catch { /* form handles error */ }
  }

  if (!profiles) return <div className="flex flex-col flex-1 min-h-0"><PageHeader title="AI Provider" description="Manage AI provider profiles and API keys." /><PageLoading /></div>

  const selectedProfile = selectedSlug ? profiles[selectedSlug] : null

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader title="AI Provider" description="Manage AI provider profiles and API keys." />
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="max-w-[880px] mx-auto">

          {/* Profile List */}
          <ConfigSection title="Profiles" description="Create multiple configurations and switch between them.">
            <div className="space-y-2">
              {Object.entries(profiles).map(([slug, profile]) => {
                const info = BACKEND_INFO[profile.backend]
                const isActive = slug === activeProfile
                const isSelected = slug === selectedSlug
                return (
                  <button
                    key={slug}
                    onClick={() => { setSelectedSlug(slug); setCreating(null) }}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-accent bg-accent-dim/30'
                        : 'border-border bg-bg hover:bg-bg-tertiary'
                    }`}
                  >
                    <div className={`${isSelected ? 'text-accent' : 'text-text-muted'}`}>{info?.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-medium truncate ${isSelected ? 'text-accent' : 'text-text'}`}>{profile.label}</span>
                        {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">Active</span>}
                      </div>
                      <p className="text-[11px] text-text-muted truncate">{info?.label} &middot; {profile.model}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* New Profile Button */}
            <div className="mt-3 flex gap-2">
              {(Object.keys(BACKEND_INFO) as AIBackend[]).map((backend) => (
                <button
                  key={backend}
                  onClick={() => handleCreateStart(backend)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                    creating === backend
                      ? 'border-accent text-accent bg-accent-dim/30'
                      : 'border-border text-text-muted hover:text-text hover:bg-bg-tertiary'
                  }`}
                >
                  <span>+</span> {BACKEND_INFO[backend].label}
                </button>
              ))}
            </div>
          </ConfigSection>

          {/* Create Form */}
          {creating && (
            <ConfigSection title={`New ${BACKEND_INFO[creating].label} Profile`} description="Fill in the details and save.">
              <ProfileForm
                backend={creating}
                onSave={handleCreateSave}
                onCancel={() => setCreating(null)}
              />
            </ConfigSection>
          )}

          {/* Edit Form */}
          {selectedProfile && selectedSlug && !creating && (
            <ConfigSection title={selectedProfile.label} description={`${BACKEND_INFO[selectedProfile.backend].label} profile — edit settings below.`}>
              <ProfileEditor
                slug={selectedSlug}
                profile={selectedProfile}
                isActive={selectedSlug === activeProfile}
                onUpdate={(p) => handleProfileUpdate(selectedSlug, p)}
                onSetActive={() => handleSetActive(selectedSlug)}
                onDelete={() => handleDelete(selectedSlug)}
              />
            </ConfigSection>
          )}

          {/* Global API Keys */}
          <ConfigSection title="Global API Keys" description="Shared across all profiles. Per-profile keys take priority.">
            <ApiKeysForm currentStatus={apiKeys} onSaved={setApiKeys} />
          </ConfigSection>

        </div>
      </div>
    </div>
  )
}

// ==================== Profile Form (Create) ====================

function ProfileForm({ backend, onSave, onCancel }: {
  backend: AIBackend
  onSave: (slug: string, profile: Profile) => Promise<void>
  onCancel: () => void
}) {
  const defaults = NEW_PROFILE_DEFAULTS[backend]
  const [label, setLabel] = useState('')
  const [model, setModel] = useState(defaults.model)
  const [loginMethod, setLoginMethod] = useState(defaults.loginMethod ?? '')
  const [provider, setProvider] = useState(defaults.provider ?? 'anthropic')
  const [baseUrl, setBaseUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!label.trim()) { setError('Label is required'); return }
    setSaving(true)
    setError('')
    const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!slug) { setError('Invalid label for slug generation'); setSaving(false); return }
    const profile: Profile = {
      backend,
      label: label.trim(),
      model,
      ...(loginMethod ? { loginMethod } : {}),
      ...(backend === 'vercel-ai-sdk' ? { provider } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    }
    try {
      await onSave(slug, profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Label">
        <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Claude Main, GPT Fast" />
      </Field>
      <ProfileFields backend={backend} model={model} setModel={setModel} loginMethod={loginMethod} setLoginMethod={setLoginMethod} provider={provider} setProvider={setProvider} baseUrl={baseUrl} setBaseUrl={setBaseUrl} />
      {error && <p className="text-[12px] text-red">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Create Profile'}</button>
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </div>
  )
}

// ==================== Profile Editor (Edit existing) ====================

function ProfileEditor({ slug, profile, isActive, onUpdate, onSetActive, onDelete }: {
  slug: string
  profile: Profile
  isActive: boolean
  onUpdate: (profile: Profile) => Promise<void>
  onSetActive: () => void
  onDelete: () => void
}) {
  const [label, setLabel] = useState(profile.label)
  const [model, setModel] = useState(profile.model)
  const [loginMethod, setLoginMethod] = useState(profile.loginMethod ?? '')
  const [provider, setProvider] = useState(profile.provider ?? 'anthropic')
  const [baseUrl, setBaseUrl] = useState(profile.baseUrl ?? '')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset form when selected profile changes
  useEffect(() => {
    setLabel(profile.label)
    setModel(profile.model)
    setLoginMethod(profile.loginMethod ?? '')
    setProvider(profile.provider ?? 'anthropic')
    setBaseUrl(profile.baseUrl ?? '')
    setStatus('idle')
  }, [slug, profile])

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  const handleSave = async () => {
    setStatus('saving')
    const updated: Profile = {
      backend: profile.backend,
      label: label.trim() || profile.label,
      model,
      ...(loginMethod ? { loginMethod } : {}),
      ...(profile.backend === 'vercel-ai-sdk' ? { provider } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(profile.apiKey ? { apiKey: profile.apiKey } : {}),
    }
    try {
      await onUpdate(updated)
      setStatus('saved')
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Label">
        <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <ProfileFields backend={profile.backend} model={model} setModel={setModel} loginMethod={loginMethod} setLoginMethod={setLoginMethod} provider={provider} setProvider={setProvider} baseUrl={baseUrl} setBaseUrl={setBaseUrl} />
      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleSave} className="btn-primary">Save Changes</button>
        <SaveIndicator status={status} onRetry={handleSave} />
        <div className="flex-1" />
        {!isActive && (
          <button onClick={onSetActive} className="text-[12px] text-accent hover:underline">Set as Default</button>
        )}
        {!isActive && (
          <button onClick={onDelete} className="text-[12px] text-red hover:underline">Delete</button>
        )}
      </div>
    </div>
  )
}

// ==================== Shared Profile Fields ====================

function ProfileFields({ backend, model, setModel, loginMethod, setLoginMethod, provider, setProvider, baseUrl, setBaseUrl }: {
  backend: AIBackend
  model: string; setModel: (v: string) => void
  loginMethod: string; setLoginMethod: (v: string) => void
  provider: string; setProvider: (v: string) => void
  baseUrl: string; setBaseUrl: (v: string) => void
}) {
  return (
    <>
      {/* Login Method (agent-sdk and codex only) */}
      {(backend === 'agent-sdk' || backend === 'codex') && (
        <Field label="Authentication">
          <select className={inputClass} value={loginMethod} onChange={(e) => setLoginMethod(e.target.value)}>
            {backend === 'agent-sdk' ? (
              <>
                <option value="claudeai">Claude Pro/Max (subscription)</option>
                <option value="api-key">API Key</option>
              </>
            ) : (
              <>
                <option value="codex-oauth">ChatGPT Subscription</option>
                <option value="api-key">API Key</option>
              </>
            )}
          </select>
        </Field>
      )}

      {/* Provider (vercel-ai-sdk only) */}
      {backend === 'vercel-ai-sdk' && (
        <Field label="SDK Provider">
          <select className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google</option>
          </select>
        </Field>
      )}

      <Field label="Model">
        <input className={inputClass} value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. claude-sonnet-4-6, gpt-5.4" />
      </Field>

      <Field label="Base URL" description="Leave empty for official API. Set for proxies or compatible endpoints.">
        <input className={inputClass} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="Leave empty for default" />
      </Field>
    </>
  )
}

// ==================== Global API Keys ====================

function ApiKeysForm({ currentStatus, onSaved }: {
  currentStatus: Record<string, string | undefined>
  onSaved: (status: Record<string, string | undefined>) => void
}) {
  const [keys, setKeys] = useState({ anthropic: '', openai: '', google: '' })
  const [status, setStatus] = useState<SaveStatus>('idle')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  const handleSave = async () => {
    setStatus('saving')
    try {
      const toSave: Record<string, string> = {}
      if (keys.anthropic) toSave.anthropic = keys.anthropic
      if (keys.openai) toSave.openai = keys.openai
      if (keys.google) toSave.google = keys.google
      await api.config.updateApiKeys(toSave)
      onSaved({
        ...currentStatus,
        ...(keys.anthropic ? { anthropic: '(set)' } : {}),
        ...(keys.openai ? { openai: '(set)' } : {}),
        ...(keys.google ? { google: '(set)' } : {}),
      })
      setKeys({ anthropic: '', openai: '', google: '' })
      setStatus('saved')
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }

  const fields = [
    { key: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
    { key: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
    { key: 'google', label: 'Google', placeholder: 'AIza...' },
  ] as const

  return (
    <>
      {fields.map((f) => (
        <Field key={f.key} label={`${f.label} API Key`}>
          <div className="relative">
            <input
              className={inputClass}
              type="password"
              value={keys[f.key]}
              onChange={(e) => setKeys((k) => ({ ...k, [f.key]: e.target.value }))}
              placeholder={currentStatus[f.key] ? '(configured)' : f.placeholder}
            />
            {currentStatus[f.key] && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-green">active</span>
            )}
          </div>
        </Field>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={status === 'saving'} className="btn-primary">Save Keys</button>
        <SaveIndicator status={status} onRetry={handleSave} />
      </div>
    </>
  )
}
