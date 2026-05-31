import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, KeyboardEvent } from 'react'
import type { AiWorkspace, CodexRuntimeStatus, CodexThread, GitHubSearchResult } from '../types'
import { useI18n } from '../i18n'
import { useSettings } from '../hooks/useSettings'
import { updateSettings } from '../services/settings'
import { pickDirectory, pickImageFile } from '../services/dialog'
import { openDir } from '../services/updates'
import {
  addAiWorkspace,
  cloneAiWorkspace,
  codexRequest,
  codexRespond,
  deleteAiWorkspaceFiles,
  getCodexAccountStatus,
  getCodexRuntimeStatus,
  listenCodexEvents,
  listAiWorkspaces,
  openCodexDesktop,
  saveCodexPastedImage,
  touchAiWorkspace,
  unlinkAiWorkspace,
} from '../services/aiWorkspace'
import StatePanel from '../components/State/StatePanel'
import './AiWorkspacePage.css'

interface AiWorkspacePageProps {
  requestedRepo?: GitHubSearchResult | null
  onRequestedRepoConsumed?: () => void
}

interface ChatEntry {
  id: string
  role: 'user' | 'assistant' | 'event'
  text: string
}

interface ActivityEntry {
  id: string
  label: string
  detail?: string
  kind?: 'command' | 'diff' | 'approval' | 'runtime' | 'turn'
  status?: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'interrupted'
  pendingApproval?: boolean
  requestId?: string | number
}

interface CodexModel {
  id?: string
  model?: string
  displayName?: string
}

type InspectorTab = 'changes' | 'terminal' | 'approvals'

function threadTitle(thread: CodexThread, fallback: string) {
  return thread.name || thread.preview || fallback
}

function stringFromUnknown(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function accountLabel(account: Record<string, unknown> | null): string {
  const nested = account?.account && typeof account.account === 'object'
    ? account.account as Record<string, unknown>
    : {}
  return stringFromUnknown(nested.email)
    || stringFromUnknown(nested.username)
    || stringFromUnknown(nested.name)
    || stringFromUnknown(account?.email)
    || stringFromUnknown(account?.username)
    || stringFromUnknown(account?.name)
}

function formatCodexTime(value?: number | null): string {
  if (!value) return ''
  const milliseconds = value > 100000000000 ? value : value * 1000
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(milliseconds))
}

function pathsMatch(first?: string | null, second?: string | null): boolean {
  if (!first || !second) return false
  return first.toLocaleLowerCase() === second.toLocaleLowerCase()
}

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join('\n')
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return textFromUnknown(record.text ?? record.content ?? record.message ?? record.delta ?? '')
  }
  return ''
}

function classifyActivityKind(method: string, approval: boolean): ActivityEntry['kind'] {
  const normalized = method.toLowerCase()
  if (approval) return 'approval'
  if (normalized.includes('exec') || normalized.includes('command') || normalized.includes('terminal')) return 'command'
  if (normalized.includes('diff') || normalized.includes('patch') || normalized.includes('file')) return 'diff'
  if (normalized.includes('turn')) return 'turn'
  return 'runtime'
}

function classifyActivityStatus(method: string, approval: boolean): ActivityEntry['status'] {
  const normalized = method.toLowerCase()
  if (approval) return 'waiting'
  if (normalized.includes('completed')) return 'completed'
  if (normalized.includes('failed') || normalized.includes('error')) return 'failed'
  if (normalized.includes('interrupted')) return 'interrupted'
  if (normalized.includes('queued')) return 'queued'
  if (normalized.includes('running') || normalized.includes('started') || normalized.includes('delta')) return 'running'
  return undefined
}

function entriesFromThread(thread: CodexThread | null): ChatEntry[] {
  if (!thread?.turns) return []
  return thread.turns.flatMap((turn) =>
    turn.items.flatMap((item, index) => {
      const kind = String(item.type ?? '')
      const text = textFromUnknown(item)
      if (!text) return []
      return [{
        id: `${turn.id}-${index}`,
        role: kind.toLowerCase().includes('user') ? 'user' : 'assistant',
        text,
      }]
    }),
  )
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function AiWorkspacePage({ requestedRepo, onRequestedRepoConsumed }: AiWorkspacePageProps) {
  const { t } = useI18n()
  const { settings } = useSettings()
  const [runtime, setRuntime] = useState<CodexRuntimeStatus | null>(null)
  const [account, setAccount] = useState<Record<string, unknown> | null>(null)
  const [workspaces, setWorkspaces] = useState<AiWorkspace[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState<AiWorkspace | null>(null)
  const [threads, setThreads] = useState<CodexThread[]>([])
  const [recentThreads, setRecentThreads] = useState<CodexThread[]>([])
  const [selectedThread, setSelectedThread] = useState<CodexThread | null>(null)
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [composer, setComposer] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [cloneUrl, setCloneUrl] = useState('')
  const [showClone, setShowClone] = useState(false)
  const [linkedLibraryRepo, setLinkedLibraryRepo] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [models, setModels] = useState<CodexModel[]>([])
  const [model, setModel] = useState('')
  const [collaborationMode, setCollaborationMode] = useState('default')
  const [effort, setEffort] = useState('medium')
  const [approvalPolicy, setApprovalPolicy] = useState('on-request')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('changes')
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const autoConnectRef = useRef(false)

  const accountName = useMemo(() => accountLabel(account), [account])
  const accountReady = useMemo(() => Boolean(account?.account || accountName), [account, accountName])
  const activePath = selectedWorkspace?.path ?? selectedThread?.cwd ?? undefined
  const selectedTitle = selectedThread
    ? threadTitle(selectedThread, t('ai.codexSession'))
    : t('ai.newChat')
  const pendingApprovals = activity.filter((entry) => entry.pendingApproval)
  const visibleActivity = activity.filter((entry) => {
    if (inspectorTab === 'approvals') return entry.kind === 'approval' || entry.pendingApproval
    if (inspectorTab === 'terminal') return entry.kind === 'command'
    return entry.kind !== 'approval'
  })
  const runtimeTitle = !runtime
    ? t('ai.runtimeNotChecked')
    : !runtime.installed
      ? t('ai.codexMissing')
      : runtime.running
        ? t('ai.codexConnected')
        : t('ai.runtimeStopped')
  const runtimeText = !runtime
    ? t('ai.runtimeNotCheckedText')
    : !runtime.installed
      ? t('ai.codexMissingText')
      : runtime.running
        ? t('ai.runtimeReadyText')
        : t('ai.runtimeStoppedText')
  const runtimeHeaderKey = runtime?.running
    ? 'ai.codexConnected'
    : runtime?.installed
      ? 'ai.runtimeStoppedShort'
      : 'ai.codexDisconnected'
  const runtimeHeaderClass = runtime?.running ? 'ready' : runtime?.installed ? 'warning' : ''

  const refreshRuntime = async () => {
    const status = await getCodexRuntimeStatus()
    setRuntime(status)
    return status
  }

  const refreshWorkspaces = async () => {
    const all = await listAiWorkspaces()
    setWorkspaces(all)
    setSelectedWorkspace((current) => current ?? all[0] ?? null)
  }

  const refreshRecentThreads = async () => {
    if (!settings.aiWorkspaceEnabled) return
    try {
      const response = await codexRequest<{ data?: CodexThread[] }>('thread/list', { limit: 30 })
      setRecentThreads(response.data ?? [])
    } catch {
      setRecentThreads([])
    }
  }

  const connectCodex = async () => {
    setBusy(true)
    setError(null)
    try {
      try {
        const nextAccount = await getCodexAccountStatus()
        setAccount(nextAccount)
      } catch {
        setAccount(null)
      }
      const modelResponse = await codexRequest<{ data?: CodexModel[] }>('model/list', {})
        .catch(() => ({ data: [] }))
      setModels(modelResponse.data ?? [])
      await refreshRuntime()
      await refreshRecentThreads()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ai.connectError'))
    } finally {
      setBusy(false)
    }
  }

  const reconnectCodex = async () => {
    await connectCodex()
    if (selectedWorkspace) {
      codexRequest<{ data?: CodexThread[] }>('thread/list', {
        cwd: [selectedWorkspace.path],
        limit: 30,
      })
        .then((response) => setThreads(response.data ?? []))
        .catch(() => setThreads([]))
    }
  }

  useEffect(() => {
    Promise.all([refreshRuntime(), refreshWorkspaces()]).catch(() => {})
  }, [])

  useEffect(() => {
    if (!settings.aiWorkspaceEnabled || autoConnectRef.current) return
    autoConnectRef.current = true
    connectCodex().catch(() => {})
  }, [settings.aiWorkspaceEnabled])

  useEffect(() => {
    if (!requestedRepo) return
    setCloneUrl(requestedRepo.html_url)
    setLinkedLibraryRepo(requestedRepo.full_name)
    setShowClone(true)
    onRequestedRepoConsumed?.()
  }, [requestedRepo, onRequestedRepoConsumed])

  useEffect(() => {
    let unlisten: Array<() => void> = []
    listenCodexEvents(
      (payload) => {
        const method = payload.method ?? ''
        const detail = textFromUnknown(payload.params)
        if (method.includes('agentMessage') && method.toLowerCase().includes('delta')) {
          setStreaming(true)
          setEntries((current) => {
            const last = current[current.length - 1]
            if (last?.id === 'streaming') {
              return [...current.slice(0, -1), { ...last, text: last.text + detail }]
            }
            return [...current, { id: 'streaming', role: 'assistant', text: detail }]
          })
        } else if (method === 'turn/completed') {
          setStreaming(false)
          setEntries((current) => current.map((entry) => entry.id === 'streaming'
            ? { ...entry, id: `assistant-${Date.now()}` }
            : entry))
          setActivity((current) => [{
            id: String(Date.now()),
            label: t('ai.turnCompleted'),
            kind: 'turn',
            status: 'completed',
          }, ...current])
        } else {
          const approval = method.toLowerCase().includes('approval')
          const kind = classifyActivityKind(method, approval)
          setActivity((current) => [{
            id: `${method}-${Date.now()}`,
            label: approval ? t('ai.approvalRequested') : method || t('ai.runtimeEvent'),
            detail,
            kind,
            status: classifyActivityStatus(method, approval),
            pendingApproval: approval,
            requestId: payload.id,
          }, ...current].slice(0, 24))
        }
      },
      (message) => {
        setError(message)
        setRuntime((current) => current ? { ...current, running: false, error: message } : current)
        setStreaming(false)
        setActivity((current) => [{
          id: `runtime-failure-${Date.now()}`,
          label: t('ai.runtimeDisconnected'),
          detail: message,
          kind: 'runtime',
          status: 'failed',
        } satisfies ActivityEntry, ...current].slice(0, 24))
      },
    )
      .then((listeners) => { unlisten = listeners })
      .catch(() => {})
    return () => unlisten.forEach((stop) => stop())
  }, [t])

  useEffect(() => {
    if (!selectedWorkspace || !settings.aiWorkspaceEnabled || !runtime?.running) {
      setThreads([])
      return
    }
    codexRequest<{ data?: CodexThread[] }>('thread/list', {
      cwd: [selectedWorkspace.path],
      limit: 30,
    })
      .then((response) => setThreads(response.data ?? []))
      .catch(() => setThreads([]))
  }, [runtime?.running, selectedWorkspace, settings.aiWorkspaceEnabled])

  const enableBeta = async () => {
    setBusy(true)
    try {
      await updateSettings({ ...settings, aiWorkspaceEnabled: true })
      await connectCodex()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ai.enableError'))
    } finally {
      setBusy(false)
    }
  }

  const handleAddFolder = async () => {
    const path = await pickDirectory()
    if (!path) return
    try {
      const workspace = await addAiWorkspace(path)
      setWorkspaces((current) => [workspace, ...current.filter((item) => item.id !== workspace.id)])
      setSelectedWorkspace(workspace)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ai.workspaceError'))
    }
  }

  const handleClone = async () => {
    if (!cloneUrl.trim()) return
    setBusy(true)
    setError(null)
    try {
      const workspace = await cloneAiWorkspace(cloneUrl.trim(), linkedLibraryRepo)
      setWorkspaces((current) => [workspace, ...current.filter((item) => item.id !== workspace.id)])
      setSelectedWorkspace(workspace)
      setShowClone(false)
      setCloneUrl('')
      setLinkedLibraryRepo(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ai.cloneError'))
    } finally {
      setBusy(false)
    }
  }

  const selectWorkspace = async (workspace: AiWorkspace) => {
    setSelectedWorkspace(workspace)
    setSelectedThread(null)
    setEntries([])
    await touchAiWorkspace(workspace.id).catch(() => {})
  }

  const startThread = async () => {
    if (!selectedWorkspace) return null
    setBusy(true)
    setError(null)
    try {
      const response = await codexRequest<{ thread: CodexThread }>('thread/start', {
        cwd: selectedWorkspace.path,
        runtimeWorkspaceRoots: [selectedWorkspace.path],
        model: model || null,
        approvalPolicy,
      })
      setSelectedThread(response.thread)
      setThreads((current) => [response.thread, ...current.filter((thread) => thread.id !== response.thread.id)])
      setRecentThreads((current) => [response.thread, ...current.filter((thread) => thread.id !== response.thread.id)])
      setEntries([])
      return response.thread
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ai.threadError'))
      return null
    } finally {
      setBusy(false)
    }
  }

  const resumeThread = async (thread: CodexThread) => {
    setBusy(true)
    try {
      const response = await codexRequest<{ thread: CodexThread }>('thread/resume', { threadId: thread.id })
      const workspace = workspaces.find((item) => pathsMatch(item.path, response.thread.cwd))
      setSelectedWorkspace(workspace ?? null)
      setSelectedThread(response.thread)
      setEntries(entriesFromThread(response.thread))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ai.threadError'))
    } finally {
      setBusy(false)
    }
  }

  const attachImage = async () => {
    const image = await pickImageFile()
    if (image) setAttachments((current) => [...current, image])
  }

  const handleDrop = (event: DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault()
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path))
    if (paths.length > 0) setAttachments((current) => [...current, ...paths])
  }

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files)
      .filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    event.preventDefault()
    setError(null)
    try {
      const savedImages = await Promise.all(imageFiles.map(async (file) => {
        const dataUrl = await fileToDataUrl(file)
        return saveCodexPastedImage(dataUrl, file.type)
      }))
      setAttachments((current) => [...current, ...savedImages])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ai.pasteImageError'))
    }
  }

  const sendMessage = async () => {
    if (!composer.trim() && attachments.length === 0) return
    const resolvedModel = model || models[0]?.model || models[0]?.id || ''
    if (collaborationMode === 'plan' && !resolvedModel) {
      setError(t('ai.modeRequiresModel'))
      return
    }
    const thread = selectedThread ?? await startThread()
    if (!thread) return
    const text = composer.trim()
    const pendingAttachments = attachments
    setEntries((current) => [...current, {
      id: `user-${Date.now()}`,
      role: 'user',
      text: text || t('ai.imageMessage', { count: pendingAttachments.length }),
    }])
    setComposer('')
    setAttachments([])
    setStreaming(true)
    try {
      await codexRequest('turn/start', {
        threadId: thread.id,
        cwd: activePath,
        runtimeWorkspaceRoots: activePath ? [activePath] : [],
        model: model || null,
        effort,
        approvalPolicy,
        collaborationMode: collaborationMode === 'plan' ? {
          mode: 'plan',
          settings: {
            model: resolvedModel,
            reasoning_effort: effort,
            developer_instructions: null,
          },
        } : null,
        input: [
          ...(text ? [{ type: 'text', text }] : []),
          ...pendingAttachments.map((path) => ({ type: 'localImage', path })),
        ],
      })
    } catch (caught) {
      setStreaming(false)
      setError(caught instanceof Error ? caught.message : t('ai.sendError'))
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void sendMessage()
    }
  }

  const answerApproval = async (entry: ActivityEntry, approved: boolean) => {
    if (entry.requestId === undefined) return
    await codexRespond(entry.requestId, { decision: approved ? 'accept' : 'decline' }).catch(() => {})
    setActivity((current) => current.map((item) => item.id === entry.id ? { ...item, pendingApproval: false } : item))
  }

  const startReview = async () => {
    if (!selectedThread) return
    setActivity((current) => [{
      id: `review-${Date.now()}`,
      label: t('ai.reviewStarting'),
      kind: 'diff',
      status: 'running',
    } satisfies ActivityEntry, ...current])
    try {
      await codexRequest('review/start', {
        threadId: selectedThread.id,
        target: { type: 'uncommittedChanges' },
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ai.reviewError'))
    }
  }

  const interruptTurn = async () => {
    if (!selectedThread) return
    await codexRequest('turn/interrupt', { threadId: selectedThread.id }).catch(() => {})
    setStreaming(false)
    setActivity((current) => [{
      id: `interrupt-${Date.now()}`,
      label: t('ai.turnInterrupted'),
      kind: 'turn',
      status: 'interrupted',
    } satisfies ActivityEntry, ...current].slice(0, 24))
  }

  const copyActivityEntry = async (entry: ActivityEntry) => {
    const lines = [
      `type: ${entry.kind ?? 'event'}`,
      `status: ${entry.status ?? 'unknown'}`,
      `label: ${entry.label}`,
      `detail: ${entry.detail ?? ''}`,
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
  }

  const renderActivityEntry = (entry: ActivityEntry, forceApprovalActions = false) => (
    <div key={entry.id} className={`ai-activity-entry ${entry.kind ? `kind-${entry.kind}` : ''}`}>
      <div className="ai-activity-entry-head">
        <strong>{entry.label}</strong>
        <span>{t(`ai.activityStatus.${entry.status ?? 'event'}`)}</span>
      </div>
      {entry.detail && <p>{entry.detail}</p>}
      <div className="ai-activity-entry-actions">
        <button type="button" onClick={() => copyActivityEntry(entry).catch(() => setError(t('ai.activityCopyError')))}>
          {t('ai.copyActivity')}
        </button>
        {(forceApprovalActions || entry.pendingApproval) && (
          <>
            <button type="button" onClick={() => void answerApproval(entry, true)}>{t('ai.allow')}</button>
            <button type="button" onClick={() => void answerApproval(entry, false)}>{t('ai.deny')}</button>
          </>
        )}
      </div>
    </div>
  )

  const removeWorkspace = async (removeFiles: boolean) => {
    if (!selectedWorkspace) return
    const prompt = removeFiles ? t('ai.deleteConfirm') : t('ai.unlinkConfirm')
    if (!window.confirm(prompt)) return
    try {
      if (removeFiles) {
        await deleteAiWorkspaceFiles(selectedWorkspace.id)
      } else {
        await unlinkAiWorkspace(selectedWorkspace.id)
      }
      setWorkspaces((current) => current.filter((workspace) => workspace.id !== selectedWorkspace.id))
      setSelectedWorkspace(null)
      setSelectedThread(null)
      setEntries([])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('ai.removeError'))
    }
  }

  const copyRuntimeDiagnostics = async () => {
    const lines = [
      `installed: ${runtime?.installed ? 'yes' : 'no'}`,
      `running: ${runtime?.running ? 'yes' : 'no'}`,
      `protocol: ${runtime?.protocol ?? 'not checked'}`,
      `auth: ${accountReady ? 'ready' : 'missing'}`,
      `path: ${runtime?.executablePath ?? 'missing'}`,
      `error: ${runtime?.error || error || 'none'}`,
    ]

    await navigator.clipboard.writeText(lines.join('\n'))
    setDiagnosticsCopied(true)
    window.setTimeout(() => setDiagnosticsCopied(false), 2600)
  }

  const renderRuntimeDiagnostics = () => (
    <section className={`ai-runtime-card ${runtime?.running ? 'ready' : runtime?.installed ? 'warning' : 'error'}`}>
      <div className="ai-runtime-card-heading">
        <span className="ai-runtime-card-mark" aria-hidden="true" />
        <div>
          <strong>{runtimeTitle}</strong>
          <p>{runtimeText}</p>
        </div>
      </div>
      <dl className="ai-runtime-facts">
        <div>
          <dt>{t('ai.runtimeInstalled')}</dt>
          <dd>{runtime?.installed ? t('ai.yes') : t('ai.no')}</dd>
        </div>
        <div>
          <dt>{t('ai.runtimeConnection')}</dt>
          <dd>{runtime?.running ? t('ai.connected') : t('ai.disconnected')}</dd>
        </div>
        <div>
          <dt>{t('ai.runtimeProtocol')}</dt>
          <dd>{runtime?.protocol ?? t('ai.notChecked')}</dd>
        </div>
        <div>
          <dt>{t('ai.runtimeAuth')}</dt>
          <dd>{accountReady ? t('ai.authReady') : t('ai.authMissing')}</dd>
        </div>
        <div className="wide">
          <dt>{t('ai.runtimePath')}</dt>
          <dd>{runtime?.executablePath || t('ai.runtimePathMissing')}</dd>
        </div>
        {(runtime?.error || error) && (
          <div className="wide">
            <dt>{t('ai.runtimeLastError')}</dt>
            <dd>{runtime?.error || error}</dd>
          </div>
        )}
      </dl>
      <div className="ai-runtime-card-actions">
        <button type="button" className="secondary-btn" onClick={() => refreshRuntime().catch(() => {})} disabled={busy}>
          {t('ai.checkRuntime')}
        </button>
        <button type="button" className="secondary-btn" onClick={() => void reconnectCodex()} disabled={busy || !runtime?.installed}>
          {t(runtime?.running ? 'ai.reconnect' : 'ai.connect')}
        </button>
        <button type="button" className="secondary-btn" onClick={() => openCodexDesktop(activePath).catch(() => {})}>
          {t('ai.openCodex')}
        </button>
        <button type="button" className="secondary-btn" onClick={() => copyRuntimeDiagnostics().catch(() => setError(t('ai.runtimeCopyError')))}>
          {diagnosticsCopied ? t('ai.runtimeCopied') : t('ai.copyRuntimeDiagnostics')}
        </button>
      </div>
    </section>
  )

  if (!settings.aiWorkspaceEnabled) {
    return (
      <div className="page ai-workspace-page ai-onboarding">
        <section className="ai-onboarding-panel">
          <span className="ai-kicker">{t('ai.beta')}</span>
          <h1>{t('ai.title')}</h1>
          <p>{t('ai.onboardingText')}</p>
          <div className="ai-onboarding-points">
            <span>{t('ai.pointRuntime')}</span>
            <span>{t('ai.pointSecurity')}</span>
            <span>{t('ai.pointThreads')}</span>
          </div>
          {renderRuntimeDiagnostics()}
          {error && (
            <StatePanel
              kind="error"
              title={t('ai.connection')}
              message={error}
              actionLabel={runtime?.installed ? t('ai.reconnect') : t('ai.checkRuntime')}
              onAction={runtime?.installed ? reconnectCodex : refreshRuntime}
            />
          )}
          <div className="ai-action-row">
            <button type="button" className="hero-primary-btn" disabled={busy || !runtime?.installed} onClick={enableBeta}>
              {t('ai.enable')}
            </button>
            <button type="button" className="secondary-btn" onClick={() => openCodexDesktop().catch(() => {})}>
              {t('ai.openCodex')}
            </button>
            <button type="button" className="secondary-btn" onClick={() => refreshRuntime().catch(() => {})}>
              {t('ai.checkRuntime')}
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page ai-workspace-page">
      <header className="ai-page-header">
        <div>
          <div className="ai-title-row">
            <h1>{t('ai.title')}</h1>
            <span>{t('ai.betaLabel')}</span>
          </div>
        </div>
        <div className="ai-header-actions">
          <span className={`ai-runtime-status ${runtimeHeaderClass}`}>
            <i aria-hidden="true" />
            {t(runtimeHeaderKey)}
          </span>
          <button type="button" className="hero-primary-btn" onClick={() => void startThread()} disabled={busy || !selectedWorkspace}>
            {t('ai.newChatAction')}
          </button>
          <button type="button" className="secondary-btn" onClick={() => openCodexDesktop(activePath).catch(() => {})}>
            {t('ai.openInCodex')}
          </button>
        </div>
      </header>

      {error && (
        <StatePanel
          kind="error"
          title={t('ai.connection')}
          message={error}
          actionLabel={runtime?.installed ? t('ai.reconnect') : t('ai.checkRuntime')}
          onAction={runtime?.installed ? reconnectCodex : refreshRuntime}
        />
      )}

      {renderRuntimeDiagnostics()}

      <div className="ai-workbench">
        <aside className="ai-workspaces">
          <div className="ai-pane-title">
            <h2>{t('ai.workspaces')}</h2>
            <button type="button" onClick={handleAddFolder} title={t('ai.addFolder')}>+</button>
          </div>
          {showClone && (
            <div className="ai-clone-form">
              <input value={cloneUrl} onChange={(event) => setCloneUrl(event.target.value)} placeholder="https://github.com/owner/repo" />
              <button type="button" className="secondary-btn" onClick={handleClone} disabled={busy}>{t('ai.cloneAction')}</button>
            </div>
          )}
          <div className="ai-workspace-list">
            {workspaces.map((workspace) => (
              <button
                type="button"
                key={workspace.id}
                className={selectedWorkspace?.id === workspace.id ? 'active' : ''}
                onClick={() => void selectWorkspace(workspace)}
              >
                <span className="ai-workspace-avatar">{workspace.name.slice(0, 1).toUpperCase()}</span>
                <span className="ai-workspace-copy">
                  <strong>{workspace.name}</strong>
                  <span>{workspace.path}</span>
                </span>
              </button>
            ))}
            {workspaces.length === 0 && <p>{t('ai.noWorkspaces')}</p>}
          </div>
          <div className="ai-sidebar-actions">
            <button type="button" className="secondary-btn" onClick={() => setShowClone((shown) => !shown)}>{t('ai.clone')}</button>
          </div>
          <div className={`ai-auth-card ${accountReady ? 'ready' : 'warning'}`}>
            <strong>{accountReady ? t('ai.authReady') : t('ai.authMissing')}</strong>
            <span>{accountReady ? (accountName || t('ai.authReadyText')) : t('ai.authMissingText')}</span>
            <div className="ai-auth-actions">
              <button type="button" className="secondary-btn" onClick={connectCodex} disabled={busy}>{t('ai.checkRuntime')}</button>
              <button type="button" className="secondary-btn" onClick={() => openCodexDesktop(activePath).catch(() => {})}>
                {accountReady ? t('ai.openCodex') : t('ai.signInViaCodex')}
              </button>
            </div>
          </div>
          <div className="ai-pane-title ai-thread-title">
            <h2>{t('ai.chats')}</h2>
            <button type="button" onClick={() => void refreshRecentThreads()} title={t('ai.refreshSessions')}>↻</button>
          </div>
          <div className="ai-thread-list ai-recent-thread-list">
            {recentThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={selectedThread?.id === thread.id ? 'active' : ''}
                onClick={() => void resumeThread(thread)}
              >
                <strong>{threadTitle(thread, t('ai.untitledThread'))}</strong>
                <span>{thread.cwd || t('ai.codexSession')}</span>
                {formatCodexTime(thread.updatedAt ?? thread.createdAt) && (
                  <em>{formatCodexTime(thread.updatedAt ?? thread.createdAt)}</em>
                )}
              </button>
            ))}
            {recentThreads.length === 0 && <p>{runtime?.running ? t('ai.noRecentSessions') : t('ai.connectForSessions')}</p>}
          </div>
          {selectedWorkspace && (
            <>
              <div className="ai-pane-title ai-thread-title">
                <h2>{t('ai.threads')}</h2>
                <button type="button" onClick={() => void startThread()} title={t('ai.newChat')}>+</button>
              </div>
              <div className="ai-thread-list">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={selectedThread?.id === thread.id ? 'active' : ''}
                    onClick={() => void resumeThread(thread)}
                  >
                    {threadTitle(thread, t('ai.untitledThread'))}
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <main className="ai-chat">
          {!selectedWorkspace && !selectedThread ? (
            <div className="ai-empty">
              <h2>{t('ai.startTitle')}</h2>
              <p>{t('ai.startText')}</p>
              <div className="ai-empty-actions">
                <button type="button" className="hero-primary-btn" onClick={handleAddFolder}>{t('ai.addFolder')}</button>
                <button type="button" className="secondary-btn" onClick={() => void refreshRecentThreads()}>{t('ai.refreshSessions')}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="ai-chat-heading">
                <div>
                  <strong>{selectedTitle}</strong>
                  <span>{selectedWorkspace?.name ?? t('ai.codexSession')}{activePath ? ` - ${activePath}` : ''}</span>
                </div>
                <button type="button" className="secondary-btn ai-inspector-toggle" onClick={() => setRightPanelOpen(true)}>
                  {t('ai.activity')}
                </button>
              </div>
              <div className="ai-messages">
                {entries.length === 0 && (
                  <div className="ai-chat-welcome">
                    <h2>{t('ai.newChat')}</h2>
                    <p>{accountReady ? t('ai.composerHint') : t('ai.authHint')}</p>
                  </div>
                )}
                {entries.map((entry) => (
                  <article key={entry.id} className={`ai-message ${entry.role}`}>
                    <span>{entry.role === 'user' ? t('ai.you') : t('ai.codex')}</span>
                    <p>{entry.text}</p>
                  </article>
                ))}
                {streaming && <div className="ai-streaming">{t('ai.working')}</div>}
              </div>
              <div className="ai-composer">
                {attachments.length > 0 && (
                  <div className="ai-attachments">
                    {attachments.map((path) => (
                      <span key={path}>{path.split(/[\\/]/).pop()}</span>
                    ))}
                  </div>
                )}
                <textarea
                  ref={composerRef}
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  onPaste={handlePaste}
                  placeholder={t('ai.composerPlaceholder')}
                />
                <div className="ai-composer-actions">
                  <button type="button" className="secondary-btn ai-attach-btn" onClick={attachImage}>{t('ai.addImage')}</button>
                  <select aria-label={t('ai.model')} value={model} onChange={(event) => setModel(event.target.value)}>
                    <option value="">{t('ai.defaultModel')}</option>
                    {models.map((availableModel) => {
                      const value = availableModel.model ?? availableModel.id ?? ''
                      if (!value) return null
                      return <option key={value} value={value}>{availableModel.displayName ?? value}</option>
                    })}
                  </select>
                  <select aria-label={t('ai.reasoning')} value={effort} onChange={(event) => setEffort(event.target.value)}>
                    <option value="low">{t('ai.effortLow')}</option>
                    <option value="medium">{t('ai.effortMedium')}</option>
                    <option value="high">{t('ai.effortHigh')}</option>
                  </select>
                  <select aria-label={t('ai.mode')} value={collaborationMode} onChange={(event) => setCollaborationMode(event.target.value)}>
                    <option value="default">{t('ai.modeDefault')}</option>
                    <option value="plan">{t('ai.modePlan')}</option>
                  </select>
                  <select aria-label={t('ai.permissions')} value={approvalPolicy} onChange={(event) => setApprovalPolicy(event.target.value)}>
                    <option value="on-request">{t('ai.approvalOnRequest')}</option>
                    <option value="untrusted">{t('ai.approvalGuarded')}</option>
                  </select>
                  <button type="button" className="hero-primary-btn" onClick={sendMessage} disabled={streaming || (!composer.trim() && attachments.length === 0)}>
                    {t('ai.send')}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>

        <aside className={`ai-inspector ${rightPanelOpen ? 'open' : ''}`}>
          <div className="ai-pane-title">
            <h2>{t('ai.activity')}</h2>
            <button type="button" className="ai-inspector-close" onClick={() => setRightPanelOpen(false)}>{'\u00d7'}</button>
          </div>
          <div className="ai-inspector-tabs" role="tablist" aria-label={t('ai.activity')}>
            <button type="button" className={inspectorTab === 'changes' ? 'active' : ''} onClick={() => setInspectorTab('changes')}>
              {t('ai.changes')}
            </button>
            <button type="button" className={inspectorTab === 'terminal' ? 'active' : ''} onClick={() => setInspectorTab('terminal')}>
              {t('ai.terminal')}
            </button>
            <button type="button" className={inspectorTab === 'approvals' ? 'active' : ''} onClick={() => setInspectorTab('approvals')}>
              {t('ai.approvals')}
            </button>
          </div>
          {(selectedWorkspace || activePath || selectedThread) && (
            <div className="ai-inspector-actions">
              {activePath && (
                <button type="button" className="secondary-btn ai-open-folder" onClick={() => openDir(activePath).catch(() => {})}>
                  {t('ai.openFolder')}
                </button>
              )}
              {selectedThread && (
                <button type="button" className="secondary-btn" onClick={startReview}>
                  {t('ai.review')}
                </button>
              )}
              {streaming && (
                <button type="button" className="secondary-btn" onClick={interruptTurn}>
                  {t('ai.interrupt')}
                </button>
              )}
              {selectedWorkspace && (
                <button type="button" className="secondary-btn" onClick={() => void removeWorkspace(false)}>
                  {t('ai.unlink')}
                </button>
              )}
              {selectedWorkspace?.clonedByLauncher && (
                <button type="button" className="secondary-btn ai-danger-action" onClick={() => void removeWorkspace(true)}>
                  {t('ai.deleteFiles')}
                </button>
              )}
            </div>
          )}
          {inspectorTab === 'changes' && (
            <div className="ai-activity-list">
              {visibleActivity.length === 0 && <p>{t('ai.noChanges')}</p>}
              {visibleActivity.map((entry) => renderActivityEntry(entry))}
            </div>
          )}
          {inspectorTab === 'terminal' && (
            <div className="ai-activity-list ai-terminal-panel">
              {visibleActivity.length === 0 && <p>{t('ai.noTerminal')}</p>}
              {visibleActivity.map((entry) => renderActivityEntry(entry))}
            </div>
          )}
          {inspectorTab === 'approvals' && (
            <div className="ai-activity-list">
              {pendingApprovals.length === 0 && <p>{t('ai.noApprovals')}</p>}
              {pendingApprovals.map((entry) => renderActivityEntry(entry, true))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export default AiWorkspacePage
