import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@redwoodjs/web'
import { Check, Download, Loader2, AlertCircle, FileText, ImageIcon, Database, Info } from 'lucide-react'

const START_EXPORT_MUTATION = gql`
  mutation StartExport($options: ExportOptions!) {
    startExport(options: $options) {
      jobId
      status
      progress
    }
  }
`

const EXPORT_JOB_QUERY = gql`
  query ExportJob($jobId: String!) {
    exportJob(jobId: $jobId) {
      jobId
      status
      progress
      downloadUrl
      fileCount
      totalSize
      expiresAt
      error
    }
  }
`

const SPACES_QUERY = gql`
  query GetSpacesForExport {
    spaces {
      id
      name
    }
  }
`

const CATEGORIES = [
  { id: 'CORE', label: 'Core', icon: FileText, desc: 'Title, URL, Type, Tags, Dates' },
  { id: 'CONTENT', label: 'Content', icon: Info, desc: 'Scraped text, descriptions' },
  { id: 'MEDIA', label: 'Media', icon: ImageIcon, desc: 'Images & carousel bundling' },
  { id: 'METADATA', label: 'Metadata', icon: Database, desc: 'Colors, AI metrics, raw JSON' },
]

const FORMATS = [
  { id: 'JSON', label: 'JSON', desc: 'Full fidelity' },
  { id: 'CSV', label: 'CSV', desc: 'Mymind compatible' },
  { id: 'JSONL', label: 'JSONL', desc: 'Streaming lines' },
  { id: 'MARKDOWN', label: 'Markdown', desc: 'Obsidian/Notion' },
]

const ExportBuilder = () => {
  const [categories, setCategories] = useState(['CORE', 'CONTENT'])
  const [format, setFormat] = useState('JSON')
  const [spaceId, setSpaceId] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)

  const { data: spacesData } = useQuery(SPACES_QUERY)
  const [startExport, { loading: starting }] = useMutation(START_EXPORT_MUTATION, {
    onCompleted: (data) => {
      setJobId(data.startExport.jobId)
    },
  })

  const { data: jobData, stopPolling, startPolling } = useQuery(EXPORT_JOB_QUERY, {
    variables: { jobId: jobId || '' },
    skip: !jobId,
    pollInterval: 2000,
  })

  useEffect(() => {
    if (jobData?.exportJob?.status === 'COMPLETE' || jobData?.exportJob?.status === 'FAILED') {
      stopPolling()
    }
  }, [jobData, stopPolling])

  const toggleCategory = (id: string) => {
    setCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const handleStart = () => {
    startExport({
      variables: {
        options: {
          categories,
          format,
          spaceId: spaceId || null,
          includeArchived,
        }
      }
    })
  }

  const job = jobData?.exportJob
  const isProcessing = job?.status === 'QUEUED' || job?.status === 'PROCESSING'

  if (jobId && job) {
    return (
      <div className="p-6 rounded-xl border border-default bg-surface-card">
        <h3 className="text-sm font-medium mb-4">Export Status</h3>

        {job.status === 'FAILED' ? (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 text-red-700 border border-red-100">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Export Failed</p>
              <p className="text-xs opacity-90">{job.error}</p>
              <button
                onClick={() => setJobId(null)}
                className="mt-3 text-xs font-bold uppercase tracking-wider underline"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
                {job.status === 'COMPLETE' ? 'Ready' : 'Processing...'}
              </span>
              <span className="text-xs font-mono">{job.progress}%</span>
            </div>

            <div className="w-full h-2 bg-surface-soft rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary transition-all duration-500 ease-out"
                style={{ width: `${job.progress}%` }}
              />
            </div>

            {job.status === 'COMPLETE' && (
              <div className="pt-2 animate-in fade-in slide-in-from-bottom-2">
                <p className="text-xs text-foreground-muted mb-4">
                  Successfully bundled {job.fileCount} items ({Math.round(job.totalSize / 1024)} KB).
                  The link expires in 1 hour.
                </p>
                <a
                  href={job.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-accent-primary text-white font-medium hover:brightness-110 active:scale-[0.98] transition-all"
                >
                  <Download className="h-4 w-4" />
                  Download Archive
                </a>
                <button
                  onClick={() => setJobId(null)}
                  className="w-full mt-2 py-2 text-xs text-foreground-muted hover:text-foreground transition-colors"
                >
                  Create New Export
                </button>
              </div>
            )}

            {isProcessing && (
              <div className="flex items-center justify-center gap-2 text-xs text-foreground-muted py-4">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Preparing your files. This may take a minute for large libraries.</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Categories */}
      <div>
        <label className="text-[10px] uppercase font-bold tracking-widest text-foreground-muted mb-3 block">
          Select Categories
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            const isActive = categories.includes(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isActive
                    ? 'border-accent-primary bg-accent-light'
                    : 'border-default bg-surface-soft opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Icon className={`h-4 w-4 ${isActive ? 'text-accent-primary' : 'text-foreground-muted'}`} />
                  {isActive && <Check className="h-3 w-3 text-accent-primary" />}
                </div>
                <p className="text-xs font-bold" style={{ color: 'var(--foreground)' }}>{cat.label}</p>
                <p className="text-[10px] text-foreground-muted leading-tight mt-0.5">{cat.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Format */}
      <div>
        <label className="text-[10px] uppercase font-bold tracking-widest text-foreground-muted mb-3 block">
          Output Format
        </label>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                format === f.id
                  ? 'border-accent-primary bg-accent-primary text-white'
                  : 'border-default bg-surface-soft text-foreground-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="space-y-3 p-4 rounded-xl border border-default bg-surface-soft/50">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Include Archived</span>
          <button
            onClick={() => setIncludeArchived(!includeArchived)}
            className={`w-10 h-5 rounded-full relative transition-colors ${
              includeArchived ? 'bg-accent-primary' : 'bg-border-default'
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              includeArchived ? 'left-[22px]' : 'left-0.5'
            }`} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-medium">Filter by Space</span>
          <select
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            className="text-xs bg-surface-card border border-default rounded px-2 py-1 outline-none"
          >
            <option value="">All Cards</option>
            {spacesData?.spaces?.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={handleStart}
        disabled={starting || categories.length === 0}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-primary text-white font-bold transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Generate Export
      </button>
    </div>
  )
}

export default ExportBuilder
