import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import heroBackground1 from '../assets/hero-bg-1.jpg'
import heroBackground2 from '../assets/hero-bg-2.png'
import heroBackground3 from '../assets/hero-bg-3.png'
import { StrategyCard } from '../components/StrategyCard'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { useStrategies } from '../context/StrategyContext'
import { useMarketData } from '../hooks/useMarketData'
import {
  loadStoredHeroImageEntries,
  saveStoredHeroImageEntries,
  type StoredHeroImageEntry,
} from '../services/heroImageStorage'
import type { MarketCard, MarketSeries } from '../types/market'
import { buildNumericAxisScale } from '../utils/chartAxis'
import { formatPercent, formatSigned } from '../utils/format'

const MARKET_CARD_CODES = ['000001', 'NHCI', 'CN10Y', 'USDCNY'] as const
const IMPORTANT_CARD_CODES = ['CHINA_EPU', 'QVIX300ETF', 'SHIBOR', 'LPR'] as const
const DAILY_SERIES_ONLY_CODES = new Set(['000001', 'USDCNY'])
const INTRADAY_LABEL_PATTERN = /intraday|分时/i
const HERO_IMAGE_ROTATE_MS = 3000
const HERO_UPLOAD_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
const HERO_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const HERO_MAX_IMAGE_SIZE_BYTES = 16 * 1024 * 1024

type HeroImageSourceType = 'default' | 'custom'

interface HeroImageEntry {
  id: string
  src: string
  sourceType: HeroImageSourceType
}

const DEFAULT_HERO_IMAGES: HeroImageEntry[] = [
  { id: 'hero-bg-default-1', src: heroBackground1, sourceType: 'default' },
  { id: 'hero-bg-default-2', src: heroBackground2, sourceType: 'default' },
  { id: 'hero-bg-default-3', src: heroBackground3, sourceType: 'default' },
]
const DEFAULT_HERO_IMAGE_MAP = new Map(DEFAULT_HERO_IMAGES.map((item) => [item.id, item] as const))

type FeatureIconKind = 'lifecycle' | 'metrics' | 'live' | 'knowledge'

interface FeatureItem {
  title: string
  front: string
  back: string
  icon: FeatureIconKind
  highlights: string[]
  cta: string
}

interface CurvePoint {
  label: string
  isoTime: string
  value: number
}

type MarketTone = 'profit' | 'loss' | 'flat'

const CARD_LABELS: Record<
  string,
  {
    zh: string
    en: string
  }
> = {
  '000001': {
    zh: '上证指数',
    en: 'SSE Composite',
  },
  CN10Y: {
    zh: '中国10年期国债收益率',
    en: 'China 10Y Treasury Yield',
  },
  NHCI: {
    zh: '南华商品指数',
    en: 'Nanhua Commodity Index',
  },
  USDCNY: {
    zh: '美元人民币',
    en: 'USD/CNY',
  },
  CHINA_EPU: {
    zh: '国家和地区指数',
    en: 'Country & Region Index',
  },
  QVIX300ETF: {
    zh: '300ETF期权波动率',
    en: '300ETF Option Volatility',
  },
  SHIBOR: {
    zh: '3个月 Shibor',
    en: '3M Shibor',
  },
  LPR: {
    zh: '5年期 LPR',
    en: '5Y LPR',
  },
}

function FeatureIcon({ kind }: { kind: FeatureIconKind }) {
  if (kind === 'lifecycle') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v3A2.5 2.5 0 0 1 17.5 12h-11A2.5 2.5 0 0 1 4 9.5z" />
        <path d="M4 14.5A2.5 2.5 0 0 1 6.5 12h11a2.5 2.5 0 0 1 0 5h-11A2.5 2.5 0 0 1 4 14.5z" />
      </svg>
    )
  }

  if (kind === 'metrics') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18.5V11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7.5" />
        <path d="M10 18.5V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v11.5" />
        <path d="M16 18.5v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4" />
      </svg>
    )
  }

  if (kind === 'live') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h4l2.1-3.5L13.8 16l2.2-4H20" />
        <path d="M5.5 5.5h13A1.5 1.5 0 0 1 20 7v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V7a1.5 1.5 0 0 1 1.5-1.5z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  )
}

const featureItemsZh: FeatureItem[] = [
  {
    title: '策略收益画像',
    front: '集中查看收益率、最大回撤、波动率与胜率等关键表现指标。',
    back: '支持按阶段与策略类型快速对比，帮助客户理解收益来源和风险特征。',
    icon: 'lifecycle',
    highlights: ['收益风险同屏查看', '阶段表现快速对比', '关键指标一眼识别'],
    cta: '查看画像',
  },
  {
    title: '回测指标透视',
    front: '聚焦年化收益、夏普、回撤、胜率等核心指标，支持横向比较。',
    back: '指标口径统一并结合可视化曲线，提升策略评审与版本筛选效率。',
    icon: 'metrics',
    highlights: ['一屏横向比较', '收益回撤同屏对照', '异常阶段快速定位'],
    cta: '查看指标',
  },
  {
    title: '已发布策略跟踪',
    front: '持续跟踪收益、Alpha、最大回撤与运行天数，观察策略稳定性。',
    back: '提供关键点标注与区间信息，便于识别波动阶段和风格切换。',
    icon: 'live',
    highlights: ['收益动态更新', '关键区间可见', '组合表现联动'],
    cta: '查看发布',
  },
  {
    title: '知识归档与复盘',
    front: '通过 FAQ 与附件沉淀方法论、复盘结论与交付材料。',
    back: '形成可审计、可复用、可传承的策略档案体系。',
    icon: 'knowledge',
    highlights: ['附件集中管理', '复盘材料可追溯', '团队协作可传承'],
    cta: '查看文档',
  },
]

const featureItemsEn: FeatureItem[] = [
  {
    title: 'Performance Snapshot',
    front: 'View return, max drawdown, volatility, and win rate in one profile.',
    back: 'Compare phases and strategy styles quickly to understand return drivers and risks.',
    icon: 'lifecycle',
    highlights: ['Return-risk in one view', 'Fast phase comparison', 'Key metrics at a glance'],
    cta: 'View Snapshot',
  },
  {
    title: 'Backtest Insights',
    front: 'Compare annual return, Sharpe, drawdown, and win rate with aligned definitions.',
    back: 'Consistent metric schema with trend context improves review and selection speed.',
    icon: 'metrics',
    highlights: ['Side-by-side comparison', 'Return/drawdown context', 'Anomaly detection'],
    cta: 'View Metrics',
  },
  {
    title: 'Published Monitoring',
    front: 'Track return, alpha, max drawdown, and running days for live stability.',
    back: 'Key-point annotations reveal volatility zones and regime shifts quickly.',
    icon: 'live',
    highlights: ['Live return updates', 'Visible key zones', 'Portfolio linkage'],
    cta: 'View Published',
  },
  {
    title: 'Knowledge Base',
    front: 'Preserve methodology and post-trade evidence with FAQ and attachments.',
    back: 'Build auditable strategy records for review, handover, and governance.',
    icon: 'knowledge',
    highlights: ['Centralized files', 'Review-ready artifacts', 'Team continuity'],
    cta: 'Open FAQ',
  },
]

const contactItems = [
  { labelZh: '联系电话', labelEn: 'Phone', value: '010-0000-0000（占位）' },
  { labelZh: '联系邮箱', labelEn: 'Email', value: 'fi-strategy@example.com（占位）' },
  { labelZh: '办公地址', labelEn: 'Address', value: '北京市朝阳区（占位）' },
]

function getCardLabel(code: string, locale: 'zh' | 'en') {
  const label = CARD_LABELS[code]
  if (!label) {
    return code
  }
  return locale === 'zh' ? label.zh : label.en
}

function formatMarketPrice(code: string, value: number | null | undefined) {
  const numeric = value ?? Number.NaN
  if (!Number.isFinite(numeric)) {
    return '--'
  }
  if (code === 'USDCNY') {
    return numeric.toFixed(4)
  }
  if (code === 'CN10Y' || code === 'SHIBOR' || code === 'LPR') {
    return `${numeric.toFixed(3)}%`
  }
  return numeric.toFixed(2)
}

function formatMarketAxisTick(code: string, value: number) {
  if (code === 'USDCNY') {
    return value.toFixed(4)
  }
  if (code === 'CN10Y' || code === 'SHIBOR' || code === 'LPR') {
    return value.toFixed(3)
  }
  return value.toFixed(2)
}

function formatMarketChange(code: string, value: number | null | undefined) {
  const numeric = value ?? Number.NaN
  if (!Number.isFinite(numeric)) {
    return '--'
  }
  if (code === 'USDCNY') {
    return formatSigned(numeric, 4)
  }
  if (code === 'CN10Y' || code === 'SHIBOR' || code === 'LPR') {
    return `${formatSigned(numeric, 3)}%`
  }
  return formatSigned(numeric)
}

function getMarketTone(value: number | null | undefined): MarketTone {
  const numeric = value ?? Number.NaN
  if (!Number.isFinite(numeric) || numeric === 0) {
    return 'flat'
  }
  return numeric > 0 ? 'profit' : 'loss'
}

function getToneClassName(tone: MarketTone) {
  if (tone === 'profit') {
    return 'text-profit'
  }
  if (tone === 'loss') {
    return 'text-loss'
  }
  return 'text-neutral'
}

function getToneLabel(tone: MarketTone, t: (zh: string, en: string) => string) {
  if (tone === 'profit') {
    return t('上涨', 'Up')
  }
  if (tone === 'loss') {
    return t('下跌', 'Down')
  }
  return t('持平', 'Flat')
}

function formatCardChangeSummary(card: MarketCard, t: (zh: string, en: string) => string) {
  if (!Number.isFinite(card.change) || !Number.isFinite(card.changePct)) {
    return '--'
  }

  const tone = getMarketTone(card.change)

  return `${formatMarketChange(card.code, card.change)} / ${formatPercent((card.changePct ?? 0) / 100)} ${
    `（${getToneLabel(tone, t)}）`
  }`
}

function formatSeriesLabel(granularity: MarketSeries['granularity'], locale: 'zh' | 'en') {
  if (granularity === 'daily') {
    return locale === 'zh' ? '近60个交易日日线' : '60D Daily'
  }
  return locale === 'zh' ? '暂无曲线' : 'No Series'
}

function normalizeOverviewSeries(code: string, series: MarketSeries): MarketSeries {
  if (DAILY_SERIES_ONLY_CODES.has(code) && series.granularity === 'intraday') {
    return {
      granularity: 'none',
      points: [],
      note: null,
    }
  }
  return series
}

function resolveOverviewNote(
  code: string,
  cardNote: string | null | undefined,
  seriesNote: string | null | undefined,
  locale: 'zh' | 'en',
) {
  const note = cardNote ?? seriesNote ?? null
  if (!note) {
    return null
  }
  if (DAILY_SERIES_ONLY_CODES.has(code) && INTRADAY_LABEL_PATTERN.test(note)) {
    return formatSeriesLabel('daily', locale)
  }
  return note
}

function getDefaultHeroImages() {
  return DEFAULT_HERO_IMAGES.map((item) => ({ ...item }))
}

function restoreHeroImages(entries: StoredHeroImageEntry[]): HeroImageEntry[] {
  const restored: HeroImageEntry[] = []
  let customIndex = 0

  entries.forEach((entry) => {
    if (entry.type === 'default') {
      const preset = DEFAULT_HERO_IMAGE_MAP.get(entry.id)
      if (preset) {
        restored.push({ ...preset })
      }
      return
    }

    restored.push({
      id: `hero-bg-custom-stored-${customIndex}`,
      src: entry.dataUrl,
      sourceType: 'custom',
    })
    customIndex += 1
  })

  return restored.length > 0 ? restored : getDefaultHeroImages()
}

function toStoredHeroImages(images: HeroImageEntry[]): StoredHeroImageEntry[] {
  return images
    .map((image): StoredHeroImageEntry | null => {
      if (image.sourceType === 'default') {
        return { type: 'default', id: image.id }
      }
      if (image.src.startsWith('data:image/')) {
        return { type: 'custom', dataUrl: image.src }
      }
      return null
    })
    .filter((item): item is StoredHeroImageEntry => item !== null)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string' && result.startsWith('data:image/')) {
        resolve(result)
        return
      }
      reject(new Error('Invalid image file'))
    }
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

function HeroImageCarousel({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useLocale()
  const [activeIndex, setActiveIndex] = useState(0)
  const [images, setImages] = useState<HeroImageEntry[]>([])
  const [hasLoadedInitialImages, setHasLoadedInitialImages] = useState(false)
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const rotationTimerRef = useRef<number | null>(null)
  const customImageSeqRef = useRef(0)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const imagesRef = useRef(images)
  const activeIndexRef = useRef(activeIndex)

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    let isActive = true

    const applyImagesIfChanged = (nextImages: HeroImageEntry[]) => {
      const currentSignature = JSON.stringify(imagesRef.current.map((item) => item.src))
      const nextSignature = JSON.stringify(nextImages.map((item) => item.src))
      if (currentSignature !== nextSignature) {
        setImages(nextImages)
      }
    }

    const restoreStoredImages = async (initial: boolean) => {
      try {
        const storedEntries = await loadStoredHeroImageEntries()
        if (!isActive) {
          return
        }

        if (storedEntries && storedEntries.length > 0) {
          applyImagesIfChanged(restoreHeroImages(storedEntries))
        } else if (initial && imagesRef.current.length === 0) {
          setImages(getDefaultHeroImages())
        }
      } finally {
        if (initial && isActive) {
          setHasLoadedInitialImages(true)
        }
      }
    }

    void restoreStoredImages(true)
    const timer = window.setInterval(() => {
      void restoreStoredImages(false)
    }, 5_000)

    return () => {
      isActive = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    setActiveIndex((previous) => {
      if (images.length === 0) {
        return 0
      }
      return Math.min(previous, images.length - 1)
    })
  }, [images.length])

  useEffect(() => {
    if (images.length <= 1 || !autoRotateEnabled) {
      return
    }

    rotationTimerRef.current = window.setInterval(() => {
      setActiveIndex((previous) => (previous + 1) % images.length)
    }, HERO_IMAGE_ROTATE_MS)

    return () => {
      if (rotationTimerRef.current !== null) {
        window.clearInterval(rotationTimerRef.current)
        rotationTimerRef.current = null
      }
    }
  }, [autoRotateEnabled, images.length])

  const handleSelectSlide = (index: number) => {
    setActiveIndex(index)
    setAutoRotateEnabled(false)
  }

  const saveImages = async (nextImages: HeroImageEntry[]) => {
    try {
      await saveStoredHeroImageEntries(toStoredHeroImages(nextImages))
      setEditorError(null)
      return true
    } catch {
      setEditorError(
        t(
          '轮播图保存失败，请检查站点后端服务是否可用后重试。',
          'Failed to save slides. Check backend availability and retry.',
        ),
      )
      return false
    }
  }

  const handleUploadClick = () => {
    uploadInputRef.current?.click()
  }

  const handleUploadChange = async (event: any) => {
    const fileList = event.target.files as FileList | null
    if (!fileList || fileList.length === 0) {
      return
    }

    const files = Array.from(fileList).filter((file): file is File => file instanceof File)
    const validFiles = files.filter(
      (file) => HERO_ALLOWED_IMAGE_TYPES.has(file.type) && file.size <= HERO_MAX_IMAGE_SIZE_BYTES,
    )

    if (validFiles.length === 0) {
      setEditorError(
        t(
          '请上传 JPG/PNG/WebP 格式图片，且单张不超过 16MB。',
          'Use JPG/PNG/WebP images, with each file no larger than 16MB.',
        ),
      )
      event.target.value = ''
      return
    }

    if (validFiles.length < files.length) {
      setEditorError(
        t(
          '已忽略不符合要求的文件，请使用 JPG/PNG/WebP 且单张不超过 16MB。',
          'Some files were skipped. Use JPG/PNG/WebP and keep each file under 16MB.',
        ),
      )
    }

    try {
      const previousImages = imagesRef.current
      const uploadedDataUrls = await Promise.all(validFiles.map((file) => readFileAsDataUrl(file)))
      const uploadedEntries: HeroImageEntry[] = uploadedDataUrls.map((dataUrl) => {
        const nextSeq = customImageSeqRef.current
        customImageSeqRef.current += 1
        return {
          id: `hero-bg-custom-${Date.now()}-${nextSeq}`,
          src: dataUrl,
          sourceType: 'custom',
        }
      })

      const nextImages = [...previousImages, ...uploadedEntries]
      setImages(nextImages)
      setAutoRotateEnabled(false)

      const saved = await saveImages(nextImages)
      if (!saved) {
        setImages(previousImages)
      }
    } catch {
      setEditorError(
        t('上传失败，请选择有效图片文件。', 'Upload failed. Please choose valid image files.'),
      )
    } finally {
      event.target.value = ''
    }
  }

  const handleDeleteSlide = async (index: number) => {
    const previousImages = imagesRef.current
    const previousActiveIndex = activeIndexRef.current
    if (previousImages.length <= 1) {
      setEditorError(t('至少保留一张背景图。', 'Keep at least one slide.'))
      return
    }

    const nextImages = previousImages.filter((_, itemIndex) => itemIndex !== index)
    setImages(nextImages)
    setActiveIndex((current) => {
      if (current > index) {
        return current - 1
      }
      return Math.min(current, nextImages.length - 1)
    })

    const saved = await saveImages(nextImages)
    if (!saved) {
      setImages(previousImages)
      setActiveIndex(Math.min(previousActiveIndex, previousImages.length - 1))
    }
  }

  const handleResetDefault = async () => {
    const previousImages = imagesRef.current
    const previousActiveIndex = activeIndexRef.current
    const defaults = getDefaultHeroImages()
    setImages(defaults)
    setActiveIndex(0)
    setAutoRotateEnabled(true)
    const saved = await saveImages(defaults)
    if (!saved) {
      setImages(previousImages)
      setActiveIndex(Math.min(previousActiveIndex, previousImages.length - 1))
    }
  }

  return (
    <>
      <div className="hero-image-carousel" aria-label={t('首页背景轮播', 'Hero background carousel')}>
        {hasLoadedInitialImages
          ? images.map((image, index) => (
          <div
            key={image.id}
            className={
              index === activeIndex
                ? 'hero-image-slide hero-image-slide-active'
                : 'hero-image-slide'
            }
            aria-hidden={index !== activeIndex}
          >
            <img
              src={image.src}
              alt=""
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          </div>
            ))
          : null}

        <div className="hero-image-overlay" aria-hidden="true" />
      </div>

      <div className="hero-carousel-controls">
        <div className="hero-image-dots" role="tablist" aria-label={t('轮播切换', 'Carousel navigation')}>
          {images.map((_, index) => (
            <button
              key={`hero-image-dot-${index}`}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-pressed={index === activeIndex}
              aria-label={`${t('查看第', 'View slide ')}${index + 1}${t('张图片', '')}`}
              className={
                index === activeIndex
                  ? 'hero-image-dot hero-image-dot-active'
                  : 'hero-image-dot'
              }
              onClick={() => handleSelectSlide(index)}
            />
          ))}
        </div>

        {isAdmin && hasLoadedInitialImages ? (
          <button
            type="button"
            className="hero-image-admin-btn"
            onClick={() => setEditorOpen((previous) => !previous)}
          >
            {t('编辑', 'Edit')}
          </button>
        ) : null}
      </div>

      {isAdmin && hasLoadedInitialImages ? (
        <input
          ref={uploadInputRef}
          className="hero-image-file-input"
          type="file"
          accept={HERO_UPLOAD_ACCEPT}
          multiple
          onChange={handleUploadChange}
        />
      ) : null}

      {isAdmin && hasLoadedInitialImages && editorOpen ? (
        <div className="hero-image-editor-panel" role="dialog" aria-label={t('轮播图编辑', 'Slide editor')}>
          <div className="hero-image-editor-actions">
            <button type="button" className="hero-image-editor-btn" onClick={handleUploadClick}>
              {t('上传图片', 'Upload images')}
            </button>
            <button type="button" className="hero-image-editor-btn" onClick={handleResetDefault}>
              {t('恢复默认', 'Reset default')}
            </button>
          </div>
          <p className="hero-image-editor-hint">
            {t(
              '支持 JPG / PNG / WebP，建议 16:9 横图，单张不超过 16MB。',
              'Supports JPG / PNG / WebP. Recommended 16:9 landscape, up to 16MB each.',
            )}
          </p>
          <ul className="hero-image-editor-list">
            {images.map((image, index) => (
              <li key={image.id} className="hero-image-editor-item">
                <span>{`${t('第', 'Slide ')}${index + 1}${t('张', '')}`}</span>
                <button
                  type="button"
                  className="hero-image-editor-remove"
                  onClick={() => handleDeleteSlide(index)}
                >
                  {t('删除', 'Delete')}
                </button>
              </li>
            ))}
          </ul>
          {editorError ? <p className="hero-image-editor-error">{editorError}</p> : null}
        </div>
      ) : null}
    </>
  )
}

function toCurvePoints(series: MarketSeries): CurvePoint[] {
  return series.points.map((point) => ({
    label: point.label,
    isoTime: point.isoTime,
    value: point.price,
  }))
}

function buildCardAxis(code: string, points: CurvePoint[]) {
  const values = points.map((item) => item.value)
  if (code === 'USDCNY') {
    return buildNumericAxisScale(values, {
      paddingRatio: 0.18,
      minPadding: 0.0003,
      flatPaddingRatio: 0.0002,
      tickCount: 5,
    })
  }
  if (code === 'CN10Y' || code === 'SHIBOR' || code === 'LPR') {
    return buildNumericAxisScale(values, {
      paddingRatio: 0.16,
      minPadding: 0.002,
      flatPaddingRatio: 0.001,
      tickCount: 5,
    })
  }
  return buildNumericAxisScale(values)
}

function getCardTone(card: MarketCard) {
  const tone = getMarketTone(card.change)
  if (tone === 'profit') {
    return '#ef4444'
  }
  if (tone === 'loss') {
    return '#22c55e'
  }
  return '#94a3b8'
}

export function HomePage() {
  const { role } = useAuth()
  const { t, locale } = useLocale()
  const navigate = useNavigate()
  const { backtestStrategies, liveStrategies, thirdpartyStrategies } = useStrategies()
  const {
    marketCards,
    importantCards,
    tickerStrip,
    seriesByCode,
    loading,
    stale,
    updatedAt,
    error,
  } = useMarketData()

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return
    }

    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (elements.length === 0) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.16,
        rootMargin: '0px 0px -10% 0px',
      },
    )

    elements.forEach((element) => observer.observe(element))

    return () => {
      observer.disconnect()
    }
  }, [])

  const manuallyFeatured = [...backtestStrategies, ...liveStrategies, ...thirdpartyStrategies]
    .filter((strategy) => strategy.showOnHome)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const featured =
    manuallyFeatured.length > 0
      ? manuallyFeatured
      : [...backtestStrategies.slice(0, 1), ...liveStrategies.slice(0, 1)]
  const featureItems = locale === 'zh' ? featureItemsZh : featureItemsEn
  const marketCardMap = new Map(marketCards.map((item) => [item.code, item] as const))
  const importantCardMap = new Map(importantCards.map((item) => [item.code, item] as const))

  const overviewCards = MARKET_CARD_CODES.map((code) => {
    const card =
      marketCardMap.get(code) ?? {
        code,
        name: getCardLabel(code, locale),
        kind: 'index' as const,
        price: null,
        change: null,
        changePct: null,
        note: null,
      }
    const series = normalizeOverviewSeries(code, seriesByCode[code] ?? {
      granularity: 'none' as const,
      points: [],
      note: null,
    })
    const curve = toCurvePoints(series)
    const axis = buildCardAxis(code, curve)
    const high = curve.length > 0 ? Math.max(...curve.map((item) => item.value)) : null
    const low = curve.length > 0 ? Math.min(...curve.map((item) => item.value)) : null
    const note = resolveOverviewNote(code, card.note, series.note, locale)

    return {
      code,
      card,
      series,
      curve,
      axis,
      high,
      low,
      color: getCardTone(card),
      label: getCardLabel(code, locale),
      note,
      seriesLabel: formatSeriesLabel(series.granularity, locale),
    }
  })

  const importantOverviewCards = IMPORTANT_CARD_CODES.map((code) => {
    const card =
      importantCardMap.get(code) ?? {
        code,
        name: getCardLabel(code, locale),
        kind: 'index' as const,
        price: null,
        change: null,
        changePct: null,
        note: null,
      }
    return {
      code,
      card,
      label: getCardLabel(code, locale),
    }
  })

  const marketTimestamp = updatedAt
    ? new Date(updatedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
    : t('暂无', 'N/A')

  const redirectGuestToLogin = () => {
    if (role === 'guest') {
      navigate('/login?notice=auth-required')
    }
  }

  const handleGuestFeatureKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (role !== 'guest') {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigate('/login?notice=auth-required')
    }
  }

  return (
    <div className="page-stack home-page">
      <section
        className="hero-panel hero-panel-upgraded hero-panel-business home-hero"
        data-reveal="up"
      >
        <HeroImageCarousel isAdmin={role === 'admin'} />
        <div className="home-hero-main">
          <div className="hero-copy-wrap hero-copy-business home-hero-copy">
            <div className="home-hero-copy-lead" data-reveal="left">
              <div className="home-hero-intro">
                <h1>{t('量化策略展业平台', 'Quant Strategy Business Platform')}</h1>
                <p className="hero-slogan">
                  <span>Where Innovation Happens,</span>
                  <span>For Clients We Serve</span>
                </p>
                <p className="hero-copy">
                  {t(
                    '面向国泰海通证券固定收益客需部客户，平台覆盖量化策略、定价与展业情况，统一呈现策略收益、回撤、风险暴露和运行状态等核心信息。',
                    'For clients of Guotai Haitong Securities Fixed Income Client Solutions, the platform covers quant strategies, pricing, and client-development progress, with unified views of strategy return, drawdown, risk exposure, and live status.',
                  )}
                </p>
              </div>
            </div>

          </div>
        </div>

        <div className="ticker-strip home-hero-ticker" aria-label={t('市场滚动行情', 'Market Ticker')}>
          <div className="ticker-track">
            {tickerStrip.length === 0 ? (
              <span className="ticker-item">
                <strong>
                  {loading
                    ? t('行情加载中', 'Loading quotes')
                    : error
                      ? t('行情暂不可用', 'Quotes unavailable')
                      : t('暂无行情', 'No quotes')}
                </strong>
                <span>
                  {loading
                    ? t('请稍候...', 'Please wait...')
                    : error
                      ? t('请检查行情服务连接', 'Please check market data service')
                      : t('请稍后刷新', 'Please refresh later')}
                </span>
              </span>
            ) : (
              [...tickerStrip, ...tickerStrip].map((item, index) => (
                <span key={`${item.code}-${index}`} className="ticker-item">
                  <strong>{item.name}</strong>
                  <span>{item.code}</span>
                  <span>{Number.isFinite(item.price) ? item.price?.toFixed(2) : '--'}</span>
                  <span className={getToneClassName(getMarketTone(item.changePct))}>
                    {Number.isFinite(item.changePct)
                      ? formatPercent((item.changePct ?? 0) / 100)
                      : '--'}
                    {Number.isFinite(item.changePct)
                      ? `（${getToneLabel(getMarketTone(item.changePct), t)}）`
                      : ''}
                  </span>
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="eficc-panel" data-reveal="up">
        <div className="section-head">
          <div>
            <h2>{t('市场行情', 'Market Overview')}</h2>
            {loading ? <p>{t('正在加载最新行情...', 'Loading latest quotes...')}</p> : null}
            {stale ? (
              <p>{t('当前显示最近一次可用快照。', 'Displaying the latest available snapshot.')}</p>
            ) : null}
            {error ? (
              <p>
                {t(
                  '市场接口当前不可用，页面已自动回退到最近一次成功数据。',
                  'Market API unavailable. Showing the latest successful snapshot when possible.',
                )}
              </p>
            ) : null}
          </div>
          <p className="market-time">
            {t('更新时间：', 'Updated: ')}
            {marketTimestamp}
          </p>
        </div>
        <div className="eficc-grid">
          {overviewCards.map((card) => (
            <article
              key={card.code}
              className="market-card market-card-with-chart eficc-card"
              data-reveal="up"
            >
                <header>
                  <div className="market-card-header-meta">
                    <h3>{card.label}</h3>
                    <p className="market-card-note">{card.note ?? '\u00a0'}</p>
                  </div>
                  <div className="market-card-tags">
                    <span>{card.code}</span>
                    <span className="market-curve-badge">{card.seriesLabel}</span>
                </div>
              </header>
              <strong>{formatMarketPrice(card.code, card.card.price)}</strong>
              <p className={getToneClassName(getMarketTone(card.card.change))}>
                {formatCardChangeSummary(card.card, t)}
              </p>

              {card.curve.length > 0 ? (
                <div className="market-mini-chart">
                  <ResponsiveContainer width="100%" height={152}>
                    <AreaChart data={card.curve}>
                      <defs>
                        <linearGradient id={`eficc-${card.code}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={card.color} stopOpacity={0.34} />
                          <stop offset="100%" stopColor={card.color} stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(188,210,245,0.16)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        hide
                        axisLine={{ stroke: 'rgba(188,210,245,0.2)' }}
                        tickLine={{ stroke: 'rgba(188,210,245,0.2)' }}
                      />
                      <YAxis
                        width={card.code === 'USDCNY' ? 58 : 64}
                        domain={card.axis.domain}
                        ticks={card.axis.ticks}
                        tick={{ fill: '#c7d8f4', fontSize: 10 }}
                        tickFormatter={(value: number) => formatMarketAxisTick(card.code, value)}
                        axisLine={{ stroke: 'rgba(188,210,245,0.25)' }}
                        tickLine={{ stroke: 'rgba(188,210,245,0.25)' }}
                      />
                      <Tooltip
                        formatter={(value) => {
                          const numeric = Number(value)
                          return [
                            Number.isFinite(numeric) ? formatMarketPrice(card.code, numeric) : '--',
                            card.label,
                          ]
                        }}
                        labelFormatter={(label) => `${t('日期', 'Date')} ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={card.color}
                        strokeWidth={2}
                        fill={`url(#eficc-${card.code})`}
                        dot={false}
                        activeDot={{ r: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="market-mini-chart market-mini-chart-empty">
                  <span>{card.series.note ?? t('暂无可展示曲线。', 'No curve available.')}</span>
                </div>
              )}

              <div className="eficc-kpis">
                <span>
                  {t('区间高点', 'High')}:
                  <strong>{formatMarketPrice(card.code, card.high)}</strong>
                </span>
                <span>
                  {t('区间低点', 'Low')}:
                  <strong>{formatMarketPrice(card.code, card.low)}</strong>
                </span>
                <span>
                  {t('振幅', 'Range')}:
                  <strong>
                    {card.high !== null && card.low !== null
                      ? formatPercent((card.high - card.low) / Math.max(Math.abs(card.low), 1e-6))
                      : '--'}
                  </strong>
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section data-reveal="up">
        <div className="section-head">
          <div>
            <h2>{t('重要数据', 'Key Data')}</h2>
          </div>
        </div>
        <div className="market-grid market-grid-4">
          {importantOverviewCards.map((card) => (
            <article key={card.code} className="market-card" data-reveal="up">
              <header>
                <h3>{card.label}</h3>
                <span>{card.code}</span>
              </header>
              <strong>{formatMarketPrice(card.code, card.card.price)}</strong>
              <p className={getToneClassName(getMarketTone(card.card.change))}>
                {formatCardChangeSummary(card.card, t)}
              </p>
              <p className="market-card-updated">
                {t('数据更新时间：', 'Updated: ')}
                {marketTimestamp}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section data-reveal="up">
        <div className="section-head">
          <h2>{t('核心能力', 'Core Capabilities')}</h2>
        </div>
        <div className="flip-grid">
          {featureItems.map((item) => (
            <article key={item.title} className="flip-card" tabIndex={0} data-reveal="up">
              <div className="flip-inner">
                <div className="flip-face">
                  <div className="flip-icon-shell">
                    <span className="flip-icon" aria-hidden="true">
                      <FeatureIcon kind={item.icon} />
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.front}</p>
                </div>
                <div
                  className={role === 'guest' ? 'flip-face flip-back flip-back-clickable' : 'flip-face flip-back'}
                  onClick={role === 'guest' ? redirectGuestToLogin : undefined}
                  onKeyDown={role === 'guest' ? handleGuestFeatureKeyDown : undefined}
                  role={role === 'guest' ? 'button' : undefined}
                  tabIndex={role === 'guest' ? 0 : undefined}
                  aria-label={
                    role === 'guest' ? t(`登录后查看 ${item.title}`, `Sign in to view ${item.title}`) : undefined
                  }
                >
                  <div className="flip-back-glow" aria-hidden="true" />
                  <h3>{item.title}</h3>
                  <p>{item.back}</p>
                  <ul className="flip-points">
                    {item.highlights.map((text) => (
                      <li key={text}>
                        <span className="flip-check" aria-hidden="true">
                          <svg viewBox="0 0 20 20">
                            <path d="M4 10.5 8 14l8-8" />
                          </svg>
                        </span>
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flip-cta" aria-hidden="true">
                    <span>{item.cta}</span>
                    <svg viewBox="0 0 20 20">
                      <path d="M4 10h11M10.5 5.5 15 10l-4.5 4.5" />
                    </svg>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section data-reveal="up">
        <div className="section-head">
          <h2>{t('策略示例', 'Strategy Samples')}</h2>
          <Link to={role === 'guest' ? '/register' : '/incubation-strategies'}>
            {role === 'guest'
              ? t('注册后查看全部策略', 'Register to view all strategies')
              : t('查看全部策略', 'View all strategies')}
          </Link>
        </div>
        <div className="card-grid">
          {featured.map((strategy) => (
            <div key={strategy.id} data-reveal="up">
              <StrategyCard
                strategy={strategy}
                compact
                detailTo={role === 'guest' ? '/login' : undefined}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="contact-panel" data-reveal="up">
        <div className="section-head">
          <h2>{t('联系方式', 'Contact')}</h2>
        </div>
        <div className="contact-grid">
          {contactItems.map((item) => (
            <article key={item.labelZh} data-reveal="up">
              <p>{locale === 'zh' ? item.labelZh : item.labelEn}</p>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
