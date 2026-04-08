import { useState, useEffect, useRef } from 'react'
import { api, type Profile, type AIBackend, type Preset } from '../api'
import { SaveIndicator } from '../components/SaveIndicator'
import { Field, inputClass } from '../components/form'
import { useSchemaForm, type SchemaField } from '../hooks/useSchemaForm'
import type { SaveStatus } from '../hooks/useAutoSave'
import { PageHeader } from '../components/PageHeader'
import { PageLoading } from '../components/StateViews'

// ==================== Icons ====================

const BACKEND_ICONS: Record<AIBackend, React.ReactNode> = {
  'agent-sdk': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6a4 4 0 0 1 4-4z" /><path d="M8 8v2a4 4 0 0 0 8 0V8" /><path d="M12 14v4" /><path d="M8 22h8" /><circle cx="9" cy="5.5" r="0.5" fill="currentColor" stroke="none" /><circle cx="15" cy="5.5" r="0.5" fill="currentColor" stroke="none" /></svg>,
  'codex': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="14" y1="4" x2="10" y2="20" /></svg>,
  'vercel-ai-sdk': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
}

function getSchemaConst(schema: Preset['schema'], field: string): unknown {
  const props = schema?.properties as Record<string, { const?: unknown }> | undefined
  return props?.[field]?.const
}

// ==================== Main Page ====================

export function AIProviderPage() {
  const [profiles, setProfiles] = useState<Record<string, Profile> | null>(null)
  const [activeProfile, setActiveProfile] = useState('')
  const [presets, setPresets] = useState<Preset[]>([])
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    api.config.getProfiles().then(({ profiles: p, activeProfile: a }) => {
      setProfiles(p); setActiveProfile(a)
    }).catch(() => {})
    api.config.getPresets().then(({ presets: p }) => setPresets(p)).catch(() => {})
  }, [])

  const handleSetActive = async (slug: string) => {
    try { await api.config.setActiveProfile(slug); setActiveProfile(slug) } catch {}
  }

  const handleDelete = async (slug: string) => {
    if (!profiles) return
    try {
      await api.config.deleteProfile(slug)
      const updated = { ...profiles }; delete updated[slug]
      setProfiles(updated); setEditingSlug(null)
    } catch {}
  }

  const handleCreateSave = async (name: string, profile: Profile) => {
    await api.config.createProfile(name, profile)
    setProfiles((p) => p ? { ...p, [name]: profile } : p)
    setShowCreate(false)
  }

  const handleProfileUpdate = async (slug: string, profile: Profile) => {
    await api.config.updateProfile(slug, profile)
    setProfiles((p) => p ? { ...p, [slug]: profile } : p)
  }

  if (!profiles) return <div className="flex flex-col flex-1 min-h-0"><PageHeader title="AI Provider" description="Manage AI provider profiles." /><PageLoading /></div>

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader title="AI Provider" description="Manage AI provider profiles." />
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="max-w-[640px] mx-auto space-y-3">
          {Object.entries(profiles).map(([slug, profile]) => {
            const isActive = slug === activeProfile
            return (
              <div key={slug} className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${isActive ? 'border-accent bg-accent-dim/20' : 'border-border bg-bg'}`}>
                <div className="text-text-muted">{BACKEND_ICONS[profile.backend]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-text truncate">{slug}</span>
                    {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium shrink-0">Active</span>}
                  </div>
                  <p className="text-[11px] text-text-muted truncate">{profile.model || 'Auto (subscription plan)'}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isActive && <button onClick={() => handleSetActive(slug)} className="text-[11px] px-2 py-1 rounded-md border border-border text-text-muted hover:text-accent hover:border-accent transition-colors">Set Default</button>}
                  <button onClick={() => setEditingSlug(slug)} className="text-[11px] px-2 py-1 rounded-md border border-border text-text-muted hover:text-text hover:bg-bg-tertiary transition-colors">Edit</button>
                </div>
              </div>
            )
          })}
          <button onClick={() => setShowCreate(true)} className="w-full p-4 rounded-xl border-2 border-dashed border-border text-text-muted hover:border-accent/50 hover:text-accent transition-all text-[13px] font-medium">+ New Profile</button>
        </div>
      </div>

      {editingSlug && profiles[editingSlug] && (
        <ProfileEditModal slug={editingSlug} profile={profiles[editingSlug]} presets={presets}
          isActive={editingSlug === activeProfile}
          onSave={(p) => handleProfileUpdate(editingSlug, p)}
          onDelete={() => handleDelete(editingSlug)} onClose={() => setEditingSlug(null)} />
      )}
      {showCreate && <ProfileCreateModal presets={presets} onSave={handleCreateSave} onClose={() => setShowCreate(false)} />}
    </div>
  )
}

// ==================== Modal Shell ====================

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-[15px] font-semibold text-text">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}

// ==================== Schema-driven Field Renderer ====================

function SchemaFormFields({ fields, formData, setField, existingProfile }: {
  fields: SchemaField[]
  formData: Record<string, string>
  setField: (key: string, value: string) => void
  existingProfile?: Profile
}) {
  return (
    <>
      {fields.map((field) => {
        const value = formData[field.key] ?? ''
        const label = field.required ? field.title : `${field.title} (optional)`
        const hasExisting = existingProfile && field.key === 'apiKey' && !!(existingProfile as unknown as Record<string, unknown>)[field.key]

        if (field.type === 'select') {
          return (
            <Field key={field.key} label={label} description={field.description}>
              <select className={inputClass} value={value} onChange={(e) => setField(field.key, e.target.value)}>
                {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          )
        }

        if (field.type === 'password') {
          return (
            <Field key={field.key} label={label} description={field.description}>
              <div className="relative">
                <input className={inputClass} type="password" value={value} onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={hasExisting ? '(configured — leave empty to keep)' : 'Enter value'} />
                {hasExisting && !value && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-green">active</span>}
              </div>
            </Field>
          )
        }

        return (
          <Field key={field.key} label={label} description={field.description}>
            <input className={inputClass} value={value} onChange={(e) => setField(field.key, e.target.value)}
              placeholder={field.defaultValue ?? ''} />
          </Field>
        )
      })}
    </>
  )
}

// ==================== Edit Modal ====================

function ProfileEditModal({ slug, profile, presets, isActive, onSave, onDelete, onClose }: {
  slug: string; profile: Profile; presets: Preset[]; isActive: boolean
  onSave: (profile: Profile) => Promise<void>; onDelete: () => void; onClose: () => void
}) {
  // Lookup preset by profile.preset field — no more reverse matching
  const preset = presets.find(p => p.id === profile.preset) ?? presets.find(p => p.category === 'custom')!

  const profileData: Record<string, string> = {}
  for (const [k, v] of Object.entries(profile)) {
    if (v !== undefined && v !== null) profileData[k] = String(v)
  }

  const { fields, formData, setField, getSubmitData, validate } = useSchemaForm(preset.schema, profileData)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  const handleSave = async () => {
    const error = validate()
    if (error) return
    setStatus('saving')
    try {
      const data = getSubmitData()
      // Preserve existing apiKey if user didn't enter a new one
      if (!data.apiKey && profile.apiKey) data.apiKey = profile.apiKey
      // Preserve preset association
      data.preset = profile.preset
      await onSave(data as unknown as Profile)
      setStatus('saved')
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => { setStatus('idle'); onClose() }, 1000)
    } catch { setStatus('error') }
  }

  return (
    <Modal title={`Edit: ${slug}`} onClose={onClose}>
      <div className="space-y-3">
        {preset.hint && <p className="text-[11px] text-text-muted bg-bg-tertiary rounded-lg p-3 leading-relaxed">{preset.hint}</p>}
        <SchemaFormFields fields={fields} formData={formData} setField={setField} existingProfile={profile} />
        <div className="flex items-center gap-2 pt-2 border-t border-border mt-4">
          <button onClick={handleSave} className="btn-primary">Save</button>
          <SaveIndicator status={status} onRetry={handleSave} />
          <div className="flex-1" />
          {!isActive && <button onClick={onDelete} className="text-[12px] text-red hover:underline">Delete</button>}
        </div>
      </div>
    </Modal>
  )
}

// ==================== Create Modal ====================

function ProfileCreateModal({ presets, onSave, onClose }: {
  presets: Preset[]; onSave: (name: string, profile: Profile) => Promise<void>; onClose: () => void
}) {
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { fields, formData, setField, getSubmitData, validate } = useSchemaForm(
    selectedPreset?.schema,
  )

  const selectPreset = (preset: Preset) => {
    setSelectedPreset(preset)
    setName(preset.defaultName)
    setError('')
  }

  const handleCreate = async () => {
    if (!selectedPreset) return
    const trimmedName = name.trim()
    if (!trimmedName) { setError('Profile name is required'); return }
    const validationError = validate()
    if (validationError) { setError(validationError); return }
    setSaving(true); setError('')
    try {
      const data = getSubmitData()
      data.preset = selectedPreset.id
      await onSave(trimmedName, data as unknown as Profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally { setSaving(false) }
  }

  const officialPresets = presets.filter(p => p.category === 'official')
  const thirdPartyPresets = presets.filter(p => p.category === 'third-party')
  const customPreset = presets.find(p => p.category === 'custom')

  return (
    <Modal title={selectedPreset ? `New: ${selectedPreset.label}` : 'New Profile'} onClose={onClose}>
      {!selectedPreset ? (
        <div className="space-y-4">
          {officialPresets.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-text-muted mb-2 uppercase tracking-wider">Official</p>
              <div className="grid grid-cols-2 gap-2">
                {officialPresets.map((p) => (
                  <button key={p.id} onClick={() => selectPreset(p)} className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-bg hover:bg-bg-tertiary hover:border-accent/40 transition-all text-left">
                    <div className="text-text-muted mt-0.5">{BACKEND_ICONS[getSchemaConst(p.schema, 'backend') as AIBackend ?? 'vercel-ai-sdk']}</div>
                    <div>
                      <p className="text-[12px] font-medium text-text">{p.label}</p>
                      <p className="text-[10px] text-text-muted mt-0.5 leading-snug">{p.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {thirdPartyPresets.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-text-muted mb-2 uppercase tracking-wider">Third Party</p>
              <div className="grid grid-cols-2 gap-2">
                {thirdPartyPresets.map((p) => (
                  <button key={p.id} onClick={() => selectPreset(p)} className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-bg hover:bg-bg-tertiary hover:border-accent/40 transition-all text-left">
                    <div className="text-text-muted mt-0.5">{BACKEND_ICONS[getSchemaConst(p.schema, 'backend') as AIBackend ?? 'vercel-ai-sdk']}</div>
                    <div>
                      <p className="text-[12px] font-medium text-text">{p.label}</p>
                      <p className="text-[10px] text-text-muted mt-0.5 leading-snug">{p.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {customPreset && (
            <button onClick={() => selectPreset(customPreset)} className="w-full p-3 rounded-lg border border-dashed border-border hover:border-accent/40 hover:bg-bg-tertiary transition-all text-left">
              <p className="text-[12px] font-medium text-text">+ Custom</p>
              <p className="text-[10px] text-text-muted mt-0.5">{customPreset.description}</p>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {selectedPreset.hint && <p className="text-[11px] text-text-muted bg-bg-tertiary rounded-lg p-3 leading-relaxed">{selectedPreset.hint}</p>}
          <Field label="Profile Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. My ${selectedPreset.label}`} autoFocus />
          </Field>
          <SchemaFormFields fields={fields} formData={formData} setField={setField} />
          {error && <p className="text-[12px] text-red">{error}</p>}
          <div className="flex items-center gap-2 pt-2 border-t border-border mt-4">
            <button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create'}</button>
            <button onClick={() => setSelectedPreset(null)} className="btn-secondary">Back</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
