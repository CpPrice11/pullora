import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayPosition } from './useOverlayPosition'
import './Ui.css'

export interface UiSelectOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

interface UiSelectProps<T extends string> {
  value: T
  options: readonly UiSelectOption<T>[]
  onChange: (value: T) => void
  label: string
  id?: string
  helpText?: string
  error?: string
  disabled?: boolean
  className?: string
}

export default function UiSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  id,
  helpText,
  error,
  disabled = false,
  className = '',
}: UiSelectProps<T>) {
  const generatedId = useId().replace(/:/g, '')
  const fieldId = id ?? `ui-select-${generatedId}`
  const labelId = `${fieldId}-label`
  const listboxId = `${fieldId}-listbox`
  const helpId = helpText || error ? `${fieldId}-help` : undefined
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeaheadRef = useRef('')
  const typeaheadTimerRef = useRef<number>()
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const style = useOverlayPosition(open, listRef, triggerRef.current, true)

  useEffect(() => {
    if (!open) return
    setActiveIndex(selectedIndex)
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, selectedIndex])

  useEffect(() => () => window.clearTimeout(typeaheadTimerRef.current), [])

  const enabledIndexes = options.flatMap((option, index) => option.disabled ? [] : [index])
  const moveActive = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return
    const current = enabledIndexes.indexOf(activeIndex)
    setActiveIndex(enabledIndexes[
      current < 0 ? 0 : (current + direction + enabledIndexes.length) % enabledIndexes.length
    ])
  }
  const selectIndex = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      else moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault()
      if (enabledIndexes.length) {
        setActiveIndex(event.key === 'Home' ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1])
      }
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) selectIndex(activeIndex)
      else setOpen(true)
      return
    }
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return
    typeaheadRef.current += event.key.toLocaleLowerCase()
    window.clearTimeout(typeaheadTimerRef.current)
    typeaheadTimerRef.current = window.setTimeout(() => { typeaheadRef.current = '' }, 650)
    const match = options.findIndex((option) => (
      !option.disabled && option.label.toLocaleLowerCase().startsWith(typeaheadRef.current)
    ))
    if (match >= 0) {
      setOpen(true)
      setActiveIndex(match)
    }
  }

  return (
    <div className={`ui-field ui-select-field ${className}`.trim()}>
      <span id={labelId} className="ui-field-label">{label}</span>
      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        className="ui-select-trigger"
        role="combobox"
        aria-labelledby={labelId}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-describedby={helpId}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span>{options[selectedIndex]?.label ?? value}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {helpId && (
        <span id={helpId} className={`ui-field-help ${error ? 'is-error' : ''}`} role={error ? 'alert' : undefined}>
          {error ?? helpText}
        </span>
      )}
      {open && createPortal(
        <div
          ref={listRef}
          id={listboxId}
          className="ui-select-list"
          role="listbox"
          aria-labelledby={labelId}
          style={style}
          onMouseDown={(event) => event.preventDefault()}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listboxId}-option-${index}`}
              className={`ui-select-option ${index === activeIndex ? 'is-active' : ''} ${option.value === value ? 'is-selected' : ''}`}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              onMouseEnter={() => !option.disabled && setActiveIndex(index)}
              onClick={() => selectIndex(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <span className="ui-select-check" aria-hidden="true">✓</span>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
