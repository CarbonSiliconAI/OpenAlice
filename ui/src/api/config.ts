import { headers } from './client'
import type { AppConfig, Profile, Preset } from './types'

export const configApi = {
  async load(): Promise<AppConfig> {
    const res = await fetch('/api/config')
    if (!res.ok) throw new Error('Failed to load config')
    return res.json()
  },

  async updateSection(section: string, data: unknown): Promise<unknown> {
    const res = await fetch(`/api/config/${section}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Save failed' }))
      throw new Error(err.error || 'Save failed')
    }
    return res.json()
  },

  // ==================== Profile CRUD ====================

  async getPresets(): Promise<{ presets: Preset[] }> {
    const res = await fetch('/api/config/presets')
    if (!res.ok) throw new Error('Failed to load presets')
    return res.json()
  },

  async getProfiles(): Promise<{ profiles: Record<string, Profile>; activeProfile: string }> {
    const res = await fetch('/api/config/profiles')
    if (!res.ok) throw new Error('Failed to load profiles')
    return res.json()
  },

  async createProfile(slug: string, profile: Profile): Promise<{ slug: string; profile: Profile }> {
    const res = await fetch('/api/config/profiles', {
      method: 'POST',
      headers,
      body: JSON.stringify({ slug, profile }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create profile' }))
      throw new Error(err.error || 'Failed to create profile')
    }
    return res.json()
  },

  async updateProfile(slug: string, profile: Profile): Promise<{ slug: string; profile: Profile }> {
    const res = await fetch(`/api/config/profiles/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(profile),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update profile' }))
      throw new Error(err.error || 'Failed to update profile')
    }
    return res.json()
  },

  async deleteProfile(slug: string): Promise<void> {
    const res = await fetch(`/api/config/profiles/${encodeURIComponent(slug)}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete profile' }))
      throw new Error(err.error || 'Failed to delete profile')
    }
  },

  async testProfile(profileData: Profile): Promise<{ ok: boolean; response?: string; error?: string }> {
    const res = await fetch('/api/config/profiles/test', {
      method: 'POST',
      headers,
      body: JSON.stringify(profileData),
    })
    return res.json()
  },

  async setActiveProfile(slug: string): Promise<void> {
    const res = await fetch('/api/config/active-profile', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ slug }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to set active profile' }))
      throw new Error(err.error || 'Failed to set active profile')
    }
  },

}
