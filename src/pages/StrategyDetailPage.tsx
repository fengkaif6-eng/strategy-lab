import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MetricChip } from '../components/MetricChip'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { useStrategies } from '../context/StrategyContext'
import { trackStrategyVisit } from '../services/analyticsService'
import type { StrategyAttachment, StrategyChannel } from '../types/strategy'
import { buildEquityAxisScale } from '../utils/chartAxis'
import { formatDate } from '../utils/format'
import { getStrategyMetricItems } from '../utils/strategyMetrics'

interface AttachmentFormState {
  title: string
  url: string
  note: string
}

const initialAttachmentForm: AttachmentFormState = {
  title: '',
  url: '',
  note: '',
}

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024

function isChannel(value: string | undefined): value is StrategyChannel {
  return value === 'backtest' || value === 'live' || value === 'thirdparty'
}

function plazaPath(channel: StrategyChannel) {
  if (channel === 'backtest') {
    return '/incubation-strategies'
  }
  if (channel === 'live') {
    return '/published-strategies'
  }
  return '/third-party-strategies'
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('invalid file content'))
        return
      }
      resolve(result)
    }
    reader.onerror = () => reject(new Error('read file failed'))
    reader.readAsDataURL(file)
  })
}

function isLocalAttachment(attachment: StrategyAttachment) {
  return attachment.sourceType === 'file' || attachment.url.startsWith('data:')
}

function getAttachmentFileName(attachment: StrategyAttachment) {
  if (attachment.fileName?.trim()) {
    return attachment.fileName.trim()
  }

  if (!isLocalAttachment(attachment)) {
    try {
      const parsedUrl = new URL(attachment.url)
      const lastSegment = parsedUrl.pathname.split('/').filter(Boolean).pop()
      if (lastSegment) {
        return decodeURIComponent(lastSegment)
      }
    } catch {
      return attachment.title
    }
  }

  return attachment.title
}

function getAttachmentMimeType(attachment: StrategyAttachment) {
  if (attachment.mimeType?.trim()) {
    return attachment.mimeType.trim().toLowerCase()
  }

  if (attachment.url.startsWith('data:')) {
    const mimeMatch = attachment.url.match(/^data:([^;,]+)/i)
    if (mimeMatch?.[1]) {
      return mimeMatch[1].toLowerCase()
    }
  }

  const extension = getAttachmentFileName(attachment).split('.').pop()?.toLowerCase()
  if (!extension) {
    return ''
  }

  const extensionMimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    md: 'text/markdown',
  }

  return extensionMimeMap[extension] ?? ''
}

function isPreviewableAttachment(attachment: StrategyAttachment) {
  const mimeType = getAttachmentMimeType(attachment)
  return (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    mimeType.startsWith('text/') ||
    mimeType === 'application/json'
  )
}

function dataUrlToBlob(dataUrl: string) {
  const matches = dataUrl.match(/^data:([^;,]+)?((?:;[^,]+)*?),(.*)$/s)
  if (!matches) {
    return null
  }

  const mimeType = (matches[1] || 'application/octet-stream').toLowerCase()
  const metadata = matches[2] || ''
  const payload = matches[3] || ''

  if (metadata.includes(';base64')) {
    const binaryString = atob(payload)
    const bytes = new Uint8Array(binaryString.length)
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index)
    }
    return new Blob([bytes], { type: mimeType })
  }

  return new Blob([decodeURIComponent(payload)], { type: mimeType })
}

function revokeObjectUrlLater(objectUrl: string) {
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 60_000)
}

function triggerObjectUrlDownload(objectUrl: string, fileName: string) {
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function triggerAttachmentNavigation(
  attachment: StrategyAttachment,
  mode: 'view' | 'download',
) {
  const fileName = getAttachmentFileName(attachment)

  if (isLocalAttachment(attachment)) {
    const blob =
      attachment.url.startsWith('data:') ? dataUrlToBlob(attachment.url) : null

    if (!blob) {
      window.alert('附件内容无效，请重新上传。')
      return
    }

    const objectUrl = URL.createObjectURL(blob)

    if (mode === 'download') {
      triggerObjectUrlDownload(objectUrl, fileName)
      revokeObjectUrlLater(objectUrl)
      return
    }

    if (!isPreviewableAttachment(attachment)) {
      triggerObjectUrlDownload(objectUrl, fileName)
      revokeObjectUrlLater(objectUrl)
      window.alert('该附件类型不支持浏览器预览，已开始下载。')
      return
    }

    const previewWindow = window.open(objectUrl, '_blank')
    if (!previewWindow) {
      const link = document.createElement('a')
      link.href = objectUrl
      link.target = '_blank'
      link.rel = 'noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
    revokeObjectUrlLater(objectUrl)
    return
  }

  const link = document.createElement('a')
  link.href = attachment.url

  if (mode === 'download') {
    link.download = fileName
  }
  link.target = '_blank'
  link.rel = 'noreferrer'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function StrategyDetailPage() {
  const { channel, id } = useParams()
  const { t } = useLocale()
  const { isLoading, findStrategy, upsertStrategy } = useStrategies()
  const { role, user, canAccessStrategy } = useAuth()
  const [attachmentForm, setAttachmentForm] = useState(initialAttachmentForm)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [attachmentError, setAttachmentError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const channelValid = isChannel(channel)
  const strategy = channelValid && id ? findStrategy(channel, id) : undefined
  const hasAccess = strategy ? canAccessStrategy(strategy.channel, strategy.id) : false
  const equityAxisScale = strategy
    ? buildEquityAxisScale(strategy.detail.equityCurve.map((point) => point.value))
    : undefined

  useEffect(() => {
    if (!strategy || role !== 'user') {
      return
    }
    void trackStrategyVisit(strategy.channel, strategy.id, strategy.name, role)
  }, [strategy, role])

  if (!channelValid || !id) {
    return (
      <section className="empty-panel">
        <h1>页面参数错误</h1>
        <Link className="btn btn-primary" to="/incubation-strategies">
          返回策略列表
        </Link>
      </section>
    )
  }

  if (isLoading) {
    return (
      <section className="empty-panel">
        <h1>{t('策略加载中...', 'Loading strategy...')}</h1>
      </section>
    )
  }

  if (!strategy) {
    return (
      <section className="empty-panel">
        <h1>策略不存在或已删除</h1>
        <Link className="btn btn-primary" to={plazaPath(channel)}>
          返回策略列表
        </Link>
      </section>
    )
  }

  if (!hasAccess) {
    return (
      <section className="empty-panel">
        <h1>当前账号无权限查看该策略详情</h1>
        <p>请联系管理员分配对应策略访问权限。</p>
        <Link className="btn btn-primary" to={plazaPath(strategy.channel)}>
          返回策略列表
        </Link>
      </section>
    )
  }

  const metrics = getStrategyMetricItems(strategy, t)
  const canManageAttachments = role === 'admin'

  const addAttachment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAttachmentError('')

    const title = attachmentForm.title.trim()
    const note = attachmentForm.note.trim()
    const url = attachmentForm.url.trim()

    if (!title) {
      setAttachmentError('附件名称不能为空。')
      return
    }

    let nextAttachment: StrategyAttachment

    if (selectedFile) {
      if (selectedFile.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setAttachmentError('单个附件大小不能超过 5MB。')
        return
      }

      try {
        const dataUrl = await readFileAsDataUrl(selectedFile)
        const createdAt = new Date().toISOString()
        nextAttachment = {
          id: `att_${createdAt.replace(/[:.]/g, '-')}_${strategy.detail.attachments.length + 1}`,
          title,
          url: dataUrl,
          note: note || undefined,
          createdAt,
          createdBy: user?.username ?? 'admin',
          sourceType: 'file',
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type || 'application/octet-stream',
        }
      } catch {
        setAttachmentError('本地文件读取失败，请重试。')
        return
      }
    } else {
      if (!url) {
        setAttachmentError('请提供附件链接或选择本地文件。')
        return
      }

      try {
        const normalized = new URL(url)
        const createdAt = new Date().toISOString()
        nextAttachment = {
          id: `att_${createdAt.replace(/[:.]/g, '-')}_${strategy.detail.attachments.length + 1}`,
          title,
          url: normalized.toString(),
          note: note || undefined,
          createdAt,
          createdBy: user?.username ?? 'admin',
          sourceType: 'url',
        }
      } catch {
        setAttachmentError('请输入合法的附件 URL。')
        return
      }
    }

    await upsertStrategy({
      ...strategy,
      updatedAt: new Date().toISOString().slice(0, 10),
      detail: {
        ...strategy.detail,
        attachments: [nextAttachment, ...strategy.detail.attachments],
      },
    })

    setAttachmentForm(initialAttachmentForm)
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeAttachment = async (attachmentId: string) => {
    const confirmed = window.confirm('确认删除该附件吗？')
    if (!confirmed) {
      return
    }

    await upsertStrategy({
      ...strategy,
      updatedAt: new Date().toISOString().slice(0, 10),
      detail: {
        ...strategy.detail,
        attachments: strategy.detail.attachments.filter((item) => item.id !== attachmentId),
      },
    })
  }

  return (
    <div className="page-stack">
      <section className="section-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">策略详情</p>
            <h1>{strategy.name}</h1>
            <p>{strategy.summary}</p>
          </div>
          <Link className="btn btn-secondary" to={plazaPath(strategy.channel)}>
            返回
            {strategy.channel === 'backtest'
              ? '孵化策略'
              : strategy.channel === 'live'
                ? '已发布策略'
                : '第三方策略'}
          </Link>
        </div>
        <div className="detail-meta">
          <span>作者：{strategy.author}</span>
          <span>更新时间：{formatDate(strategy.updatedAt)}</span>
          <span>风险等级：{strategy.riskLevel}</span>
        </div>
      </section>

      <section className="metric-grid metric-grid-wide">
        {metrics.map((metric) => (
          <MetricChip
            key={metric.label}
            label={metric.label}
            value={metric.value}
            rawValue={metric.rawValue}
          />
        ))}
      </section>

      <section className="chart-grid">
        <article className="chart-panel">
          <h2>净值曲线</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={strategy.detail.equityCurve}>
              <CartesianGrid stroke="#1d4a82" strokeDasharray="4 4" />
              <XAxis dataKey="date" />
              <YAxis domain={equityAxisScale?.domain} ticks={equityAxisScale?.ticks} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#d4a340" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </article>
        <article className="chart-panel">
          <h2>回撤曲线</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={strategy.detail.drawdownCurve}>
              <CartesianGrid stroke="#2d4777" strokeDasharray="4 4" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="detail-grid">
        <article className="section-panel">
          <h2>策略说明</h2>
          <p>{strategy.detail.description}</p>
          <h3>核心逻辑</h3>
          <p>{strategy.detail.logic}</p>
        </article>
        <article className="section-panel">
          <h2>参数设置</h2>
          <div className="param-list">
            {Object.entries(strategy.detail.params).map(([key, value]) => (
              <div key={key} className="param-item">
                <span>{key}</span>
                <strong>{String(value)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="section-panel">
        <h2>风险提示</h2>
        <ul className="risk-list">
          {strategy.detail.riskNotes.map((risk) => (
            <li key={risk}>- {risk}</li>
          ))}
        </ul>
      </section>

      <section className="section-panel">
        <div className="section-head">
          <h2>策略附件</h2>
        </div>

        {strategy.detail.attachments.length === 0 ? (
          <p className="empty-copy">当前策略暂无附件。</p>
        ) : (
          <div className="attachment-board" role="table" aria-label="策略附件列表">
            <div className="attachment-row attachment-row-head" role="row">
              <div className="attachment-cell" role="columnheader">
                标题
              </div>
              <div className="attachment-cell" role="columnheader">
                备注
              </div>
              <div className="attachment-cell" role="columnheader">
                操作
              </div>
              <div className="attachment-cell" role="columnheader">
                创建信息
              </div>
            </div>
            {strategy.detail.attachments.map((attachment) => {
              const fileName = getAttachmentFileName(attachment)
              return (
                <article key={attachment.id} className="attachment-row" role="row">
                  <div className="attachment-cell attachment-cell-title" role="cell" data-label="标题">
                    <h3>{attachment.title}</h3>
                  </div>
                  <div className="attachment-cell" role="cell" data-label="备注">
                    {attachment.note?.trim() ? (
                      <p>{attachment.note}</p>
                    ) : (
                      <p className="attachment-placeholder">无备注</p>
                    )}
                  </div>
                  <div className="attachment-cell" role="cell" data-label="操作">
                    <div className="attachment-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => triggerAttachmentNavigation(attachment, 'view')}
                      >
                        查看附件
                      </button>
                      {canManageAttachments ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => triggerAttachmentNavigation(attachment, 'download')}
                        >
                          下载附件
                        </button>
                      ) : null}
                      {canManageAttachments ? (
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => void removeAttachment(attachment.id)}
                        >
                          删除附件
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="attachment-cell" role="cell" data-label="创建信息">
                    <div className="attachment-meta">
                      <p>
                        <span>创建人：</span>
                        <strong>{attachment.createdBy}</strong>
                      </p>
                      <p>
                        <span>创建时间：</span>
                        <strong>{new Date(attachment.createdAt).toLocaleString('zh-CN')}</strong>
                      </p>
                      <p>
                        <strong>{fileName}</strong>
                      </p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {canManageAttachments ? (
          <form className="attachment-form" onSubmit={(event) => void addAttachment(event)}>
            <h3>添加附件</h3>
            <label>
              附件名称
              <input
                value={attachmentForm.title}
                onChange={(event) =>
                  setAttachmentForm((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="例如：策略说明文档"
              />
            </label>
            <label>
              本地文件（可选）
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv,.doc,.docx,.xls,.xlsx,.txt,.ppt,.pptx,image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setSelectedFile(file)
                }}
              />
            </label>
            <label>
              外部链接（可选）
              <input
                value={attachmentForm.url}
                onChange={(event) =>
                  setAttachmentForm((prev) => ({ ...prev, url: event.target.value }))
                }
                placeholder="https://..."
              />
            </label>
            <label>
              备注
              <textarea
                rows={2}
                value={attachmentForm.note}
                onChange={(event) =>
                  setAttachmentForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </label>
            <p className="empty-copy">可上传 PDF / CSV / DOC / XLSX / 图片等，单文件上限 5MB。</p>
            {attachmentError ? (
              <p className="form-error" role="alert">
                {attachmentError}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary">
              添加附件
            </button>
          </form>
        ) : (
          <p className="empty-copy">仅管理员可添加或删除附件。</p>
        )}
      </section>
    </div>
  )
}
