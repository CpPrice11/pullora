import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import ukDictionary from './i18n/dictionaries/uk'

export type AppLanguage = 'uk' | 'en'

type Dictionary = Record<string, string>

const dictionaries: Partial<Record<AppLanguage, Dictionary>> = {
  uk: ukDictionary,
}

async function ensureDictionary(language: AppLanguage) {
  if (dictionaries[language]) return dictionaries[language] as Dictionary

  const dictionary = language === 'en'
    ? (await import('./i18n/dictionaries/en')).default
    : ukDictionary
  dictionaries[language] = dictionary
  return dictionary
}

interface LanguageContextValue {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  t: (key: string, values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function translate(
  language: AppLanguage,
  key: string,
  values?: Record<string, string | number>,
) {
  let text = dictionaries[language]?.[key] ?? ukDictionary[key] ?? key
  Object.entries(values ?? {}).forEach(([name, value]) => {
    text = text.split(`{${name}}`).join(String(value))
  })
  return text
}

function normalizeLanguage(language: string | null | undefined): AppLanguage {
  return language === 'en' ? 'en' : 'uk'
}

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: React.ReactNode
  initialLanguage: string
}) {
  const normalizedInitialLanguage = normalizeLanguage(initialLanguage)
  const [language, setLanguageState] = useState<AppLanguage>(
    dictionaries[normalizedInitialLanguage] ? normalizedInitialLanguage : 'uk',
  )
  const [ready, setReady] = useState(Boolean(dictionaries[normalizedInitialLanguage]))

  useEffect(() => {
    let cancelled = false
    const nextLanguage = normalizeLanguage(initialLanguage)

    void ensureDictionary(nextLanguage)
      .then(() => {
        if (cancelled) return
        setLanguageState(nextLanguage)
        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setLanguageState('uk')
        setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [initialLanguage])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: (nextLanguage) => {
      void ensureDictionary(nextLanguage)
        .then(() => setLanguageState(nextLanguage))
        .catch(() => undefined)
    },
    t: (key, values) => translate(language, key, values),
  }), [language])

  if (!ready) {
    return <div className="app-locale-loading" role="status" aria-label="Pullora">Pullora</div>
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useI18n must be used inside LanguageProvider')
  }
  return context
}
