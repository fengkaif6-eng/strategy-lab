import { apiJson } from './apiBase'

export type StoredHeroImageEntry =
  | { type: 'default'; id: string }
  | { type: 'custom'; dataUrl: string }

interface HomeHeroImage {
  id: string
  src: string
  sourceType: 'default' | 'custom'
}

interface HomeSiteContentPayload {
  heroImages: HomeHeroImage[]
}

function toStoredEntry(image: HomeHeroImage): StoredHeroImageEntry | null {
  if (image.sourceType === 'default') {
    return { type: 'default', id: image.id }
  }
  if (typeof image.src === 'string' && image.src.startsWith('data:image/')) {
    return { type: 'custom', dataUrl: image.src }
  }
  return null
}

function toApiImage(entry: StoredHeroImageEntry, index: number): HomeHeroImage {
  if (entry.type === 'default') {
    return {
      id: entry.id,
      src: '',
      sourceType: 'default',
    }
  }
  return {
    id: `hero-bg-custom-${index + 1}`,
    src: entry.dataUrl,
    sourceType: 'custom',
  }
}

export async function loadStoredHeroImageEntries(): Promise<StoredHeroImageEntry[] | null> {
  try {
    const payload = await apiJson<HomeSiteContentPayload>(`/api/site-content/home?ts=${Date.now()}`)
    const entries = Array.isArray(payload.heroImages)
      ? payload.heroImages.map((item) => toStoredEntry(item)).filter((item): item is StoredHeroImageEntry => item !== null)
      : []
    return entries.length > 0 ? entries : null
  } catch {
    return null
  }
}

export async function saveStoredHeroImageEntries(entries: StoredHeroImageEntry[]): Promise<void> {
  await apiJson<HomeSiteContentPayload>('/api/admin/site-content/home', {
    method: 'PUT',
    body: JSON.stringify({
      heroImages: entries.map((item, index) => toApiImage(item, index)),
    }),
  })
}
