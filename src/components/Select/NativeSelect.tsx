import type { SelectHTMLAttributes } from 'react'

export interface NativeSelectOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

interface NativeSelectProps<T extends string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'onChange' | 'value'> {
  value: T
  options: readonly NativeSelectOption<T>[]
  onValueChange: (value: T) => void
}

export default function NativeSelect<T extends string>({
  value,
  options,
  onValueChange,
  ...props
}: NativeSelectProps<T>) {
  return (
    <select
      {...props}
      value={value}
      onChange={(event) => onValueChange(event.currentTarget.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
