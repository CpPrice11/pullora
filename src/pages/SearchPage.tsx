import { useState } from 'react'
import './PageStyles.css'

function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    setLoading(true)
    // TODO: Implement GitHub API search
    setTimeout(() => {
      setResults([])
      setLoading(false)
    }, 500)
  }

  return (
    <div className="page">
      <h2>Search GitHub Repositories</h2>

      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Search for a repository (e.g., 'deno', 'rust')..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="search-results">
        {results.length === 0 && !loading && (
          <div className="empty-state">
            <p>Search for a repository to get started</p>
          </div>
        )}

        {loading && <p>Loading results...</p>}

        {results.map((result) => (
          <div key={result.id} className="result-card">
            <h3>{result.name}</h3>
            <p>{result.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SearchPage
