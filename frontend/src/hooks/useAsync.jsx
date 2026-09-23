import { useEffect, useState } from 'react'

/**
 * Runs `fetcher` whenever `deps` change, tracking {data, loading, error}
 * and guarding against state updates after the effect is superseded or the
 * component unmounts. The synchronous loading/error reset at the top of the
 * effect is intentional - it shows a spinner immediately when deps change -
 * so this hook centralizes the one eslint suppression instead of repeating
 * it at every fetch-on-mount call site.
 */
export function useAsync(fetcher, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: '' })

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({ ...prev, loading: true, error: '' }))

    fetcher()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: '' })
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message || 'Request failed' })
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
