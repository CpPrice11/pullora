import { useI18n } from '../../../i18n'
import type { GitHubSearchResult } from '../../../types'
import { formatNumber } from '../../../utils/format'

interface ApplicationDetailsProps {
  repo: GitHubSearchResult
  updatedDate: string
  latestVersion?: string | null
  installPath?: string | null
}

export default function ApplicationDetails({
  repo,
  updatedDate,
  latestVersion,
  installPath,
}: ApplicationDetailsProps) {
  const { language, t } = useI18n()
  const unknown = t('details.unknown')

  return (
    <section
      className="library-inline-panel library-inline-panel--details library-inline-panel--default"
      aria-label={t('details.open')}
    >
      <div className="library-inline-panel-head">
        <div>
          <span>{t('details.kicker')}</span>
          <strong>{repo.full_name}</strong>
        </div>
      </div>
      <div className="library-inline-summary library-inline-summary--details">
        <div>
          <span>{t('library.ops.owner')}</span>
          <strong>{repo.owner.login}</strong>
        </div>
        <div>
          <span>{t('library.ops.updated')}</span>
          <strong>{updatedDate}</strong>
        </div>
        <div>
          <span>{t('library.ops.language')}</span>
          <strong>{repo.language ?? unknown}</strong>
        </div>
        <div>
          <span>{t('library.ops.stars')}</span>
          <strong>{formatNumber(repo.stargazers_count, language)}</strong>
        </div>
        <div>
          <span>{t('release.installPath')}</span>
          <strong className="library-inline-install-path" title={installPath ?? unknown}>
            {installPath ?? unknown}
          </strong>
        </div>
        <div>
          <span>{t('library.ops.latest')}</span>
          <strong>{latestVersion ?? t('library.ops.notChecked')}</strong>
        </div>
      </div>
    </section>
  )
}
