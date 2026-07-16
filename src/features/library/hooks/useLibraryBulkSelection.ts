import { useCallback, useRef, useState } from 'react'

export function toggleSelectedKey(current: Set<string>, key: string) {
  const next = new Set(current)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

export function selectKeyRange(orderedKeys: string[], anchorKey: string | null, key: string) {
  const anchorIndex = anchorKey ? orderedKeys.indexOf(anchorKey) : -1
  const keyIndex = orderedKeys.indexOf(key)
  if (anchorIndex < 0 || keyIndex < 0) return new Set([key])
  const [start, end] = anchorIndex < keyIndex ? [anchorIndex, keyIndex] : [keyIndex, anchorIndex]
  return new Set(orderedKeys.slice(start, end + 1))
}

export function selectVisibleKeys(orderedKeys: string[]) {
  return new Set(orderedKeys)
}

export function clearSelectedKeys() {
  return new Set<string>()
}

export function useLibraryBulkSelection(orderedKeys: string[]) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const anchorKeyRef = useRef<string | null>(null)

  const select = useCallback((key: string, range = false) => {
    setSelectedKeys((current) => range
      ? selectKeyRange(orderedKeys, anchorKeyRef.current, key)
      : toggleSelectedKey(current, key))
    if (!range || !anchorKeyRef.current) anchorKeyRef.current = key
  }, [orderedKeys])

  const selectAll = useCallback(() => {
    setSelectedKeys(selectVisibleKeys(orderedKeys))
    anchorKeyRef.current = orderedKeys[0] ?? null
  }, [orderedKeys])

  const clear = useCallback(() => {
    setSelectedKeys(clearSelectedKeys())
    anchorKeyRef.current = null
  }, [])

  const remove = useCallback((keys: Iterable<string>) => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      for (const key of keys) next.delete(key)
      return next
    })
  }, [])

  return { selectedKeys, select, selectAll, clear, remove }
}
