import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

export type AppLocale = 'zh' | 'en'

interface LocaleContextValue {
  locale: AppLocale
  setLocale: (value: AppLocale) => void
  toggleLocale: () => void
  t: (zhText: string, enText: string) => string
}

const LOCALE_STORAGE_KEY = 'strategy_lab_locale'

function readLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return 'zh'
  }

  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  return saved === 'en' ? 'en' : 'zh'
}

const defaultContextValue: LocaleContextValue = {
  locale: 'zh',
  setLocale: () => {},
  toggleLocale: () => {},
  t: (zhText) => zhText,
}

const LocaleContext = createContext<LocaleContextValue>(defaultContextValue)

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<AppLocale>(() => readLocale())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      toggleLocale: () =>
        setLocaleState((current) => (current === 'zh' ? 'en' : 'zh')),
      t: (zhText, enText) => (locale === 'zh' ? zhText : enText),
    }),
    [locale],
  )

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale() {
  return useContext(LocaleContext)
}
