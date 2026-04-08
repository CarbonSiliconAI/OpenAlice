/**
 * AI Provider Presets — serialization layer.
 *
 * Reads preset definitions from preset-catalog.ts and converts
 * their Zod schemas to JSON Schema for the frontend.
 *
 * Post-processing:
 *   - Model fields: enum → oneOf + const + title (labeled dropdowns)
 *   - API key fields: marked writeOnly (password inputs)
 */

import { z } from 'zod'
import { PRESET_CATALOG, type PresetDef } from './preset-catalog.js'

// ==================== Serialized Preset (sent to frontend) ====================

export interface SerializedPreset {
  id: string
  label: string
  description: string
  category: 'official' | 'third-party' | 'custom'
  hint?: string
  defaultName: string
  schema: Record<string, unknown>
}

// ==================== Schema post-processing ====================

function buildJsonSchema(def: PresetDef): Record<string, unknown> {
  const raw = z.toJSONSchema(def.zodSchema) as Record<string, unknown>
  const props = (raw.properties ?? {}) as Record<string, Record<string, unknown>>

  // Replace model enum with oneOf (labeled options)
  const mf = 'model'
  if (def.models?.length && props[mf]) {
    const oneOf = def.models.map(m => ({ const: m.id, title: m.label }))
    const { enum: _e, ...rest } = props[mf]
    props[mf] = { ...rest, oneOf }
  }

  // Mark writeOnly fields
  for (const field of def.writeOnlyFields ?? []) {
    if (props[field]) props[field].writeOnly = true
  }

  raw.properties = props
  return raw
}

// ==================== Exported ====================

export const BUILTIN_PRESETS: SerializedPreset[] = PRESET_CATALOG.map(def => ({
  id: def.id,
  label: def.label,
  description: def.description,
  category: def.category,
  hint: def.hint,
  defaultName: def.defaultName,
  schema: buildJsonSchema(def),
}))
