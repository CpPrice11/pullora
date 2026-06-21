import type { GitHubSearchResult } from '../../types'
import type {
  ReleaseAssetArchitecture,
  ReleaseAssetKind,
  ReleaseRuntime,
} from './assetClassifier'

export interface StoreInstallability {
  checked: boolean
  checking: boolean
  installable: boolean
  source?: 'release' | 'cache' | 'degraded'
  latestTag?: string | null
  assetKinds?: ReleaseAssetKind[]
  installableAssetCount?: number
  incompatibleAssetCount?: number
  platform?: ReleaseRuntime['platform']
  architecture?: ReleaseAssetArchitecture
}

export interface StoreSection {
  id: string
  titleKey: string
  subtitleKey: string
  items: GitHubSearchResult[]
}
