/**
 * Workspace template detail.
 *
 * Renders the template's README (via MarkdownContent). This is the
 * in-flow staffing surface — read what shape of coworker this Harness
 * produces, then hire one via the top-right "Spawn a workspace" button,
 * which opens the same CreateWorkspaceDialog every other create entry
 * point uses (sidebar +, Chat +). Keeping a single create presentation
 * means the README stays a pure reading surface instead of burying a
 * form below the fold.
 *
 * The instance the agent starts modifying from here will diverge over
 * time; this page describes the **starting shape**. The README on disk
 * inside the spawned workspace is the agent's territory thereafter.
 */

import { useEffect, useMemo, useState } from 'react'

import { MarkdownContent } from '../components/MarkdownContent'
import { useWorkspaces } from '../contexts/WorkspacesContext'
import { useWorkspace } from '../tabs/store'
import { fetchTemplateReadme } from '../components/workspace/api'
import { CreateWorkspaceDialog } from '../components/workspace/CreateWorkspaceDialog'

interface Props {
  spec: { kind: 'template-detail'; params: { name: string } }
}

function humanize(name: string): string {
  return (
    name
      .split(/[-_]/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ') || name
  )
}

export function TemplateDetailPage({ spec }: Props) {
  const { templates, agents, refresh } = useWorkspaces()
  const openOrFocus = useWorkspace((s) => s.openOrFocus)
  const [showCreate, setShowCreate] = useState(false)

  const templateName = spec.params.name
  const template = useMemo(
    () => templates.find((t) => t.name === templateName),
    [templates, templateName],
  )

  // README — fetched lazily once per template (no cache across mounts; the
  // catalog is small enough that re-fetch on tab open is fine).
  const [readme, setReadme] = useState<string | null>(null)
  const [readmeError, setReadmeError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setReadme(null)
    setReadmeError(null)
    void fetchTemplateReadme(templateName)
      .then((md) => {
        if (cancelled) return
        if (md === null) setReadmeError('This template doesn\'t ship a README yet.')
        else setReadme(md)
      })
      .catch((err) => {
        if (cancelled) return
        setReadmeError((err as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [templateName])

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted px-6">
        <h2 className="text-lg font-medium text-text mb-2">Template not found</h2>
        <p className="text-sm">No template named <code className="font-mono">{templateName}</code>.</p>
      </div>
    )
  }

  const title = template.displayName ?? humanize(template.name)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="mb-6 flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3 min-w-0">
            <h2 className="text-[20px] font-semibold text-text truncate">{title}</h2>
            <span className="text-[12px] font-mono text-text-muted tabular-nums shrink-0">
              v{template.version}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary shrink-0"
          >
            Spawn a workspace
          </button>
        </div>

        {/* README body */}
        <div className="rounded-lg border border-border bg-bg-secondary px-6 py-5">
          {readme === null && readmeError === null && (
            <p className="text-[12px] text-text-muted italic">Loading README…</p>
          )}
          {readmeError && (
            <p className="text-[12px] text-text-muted italic">{readmeError}</p>
          )}
          {readme && <MarkdownContent text={readme} />}
        </div>
      </div>

      {showCreate && (
        <CreateWorkspaceDialog
          templates={templates}
          agents={agents}
          presetTemplate={template.name}
          onClose={() => setShowCreate(false)}
          onCreated={(workspace) => {
            refresh()
            openOrFocus({ kind: 'workspace', params: { wsId: workspace.id } })
          }}
        />
      )}
    </div>
  )
}
