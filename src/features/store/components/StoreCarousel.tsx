import type { GitHubSearchResult, InstalledApp, ProjectArt } from '../../../types'
import type { StoreInstallability } from '../hooks/useStoreCatalog'
import StoreProjectCard from './StoreProjectCard'
import { repoKey } from '../storeCatalog'
import { useI18n } from '../../../i18n'

interface StoreCarouselProps {
  titleKey: string
  subtitleKey?: string
  items: GitHubSearchResult[]
  favoriteKeys: Set<string>
  installedByRepo: Map<string, InstalledApp>
  installability: Record<string, StoreInstallability>
  projectArt: Record<string, ProjectArt>
  onSelect: (repo: GitHubSearchResult) => void
  onFavorite: (repo: GitHubSearchResult) => void
  onInstall: (repo: GitHubSearchResult) => void
  onOpenSource: (repo: GitHubSearchResult) => void
  onDetails: (repo: GitHubSearchResult) => void
}

function StoreCarousel({
  titleKey,
  subtitleKey,
  items,
  favoriteKeys,
  installedByRepo,
  installability,
  projectArt,
  onSelect,
  onFavorite,
  onInstall,
  onOpenSource,
  onDetails,
}: StoreCarouselProps) {
  const { t } = useI18n()

  if (items.length === 0) return null

  return (
    <section className="store-section">
      <div className="store-section-head">
        <div>
          <h2>{t(titleKey)}</h2>
          {subtitleKey && <p>{t(subtitleKey)}</p>}
        </div>
      </div>
      <div className="store-carousel" tabIndex={0}>
        {items.map((repo) => {
          const key = repoKey(repo)
          return (
            <StoreProjectCard
              key={key}
              repo={repo}
              art={projectArt[key]}
              installedApp={installedByRepo.get(key)}
              installability={installability[key]}
              favorite={favoriteKeys.has(key)}
              onSelect={onSelect}
              onFavorite={onFavorite}
              onInstall={onInstall}
              onOpenSource={onOpenSource}
              onDetails={onDetails}
            />
          )
        })}
      </div>
    </section>
  )
}

export default StoreCarousel
