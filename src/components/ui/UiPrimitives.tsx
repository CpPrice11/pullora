import {
  forwardRef,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useModalFocus } from '../../hooks/useModalFocus'
import './Ui.css'

type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'destructive'

interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export const UiButton = forwardRef<HTMLButtonElement, UiButtonProps>(function UiButton({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`ui-button ui-button--${variant} ${className}`.trim()}
      {...props}
    />
  )
})

interface UiSurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article'
  level?: 1 | 2 | 3
}

export function UiSurface({ as: Element = 'div', level = 1, className = '', ...props }: UiSurfaceProps) {
  return <Element className={`ui-surface ui-surface--${level} ${className}`.trim()} {...props} />
}

interface UiFieldProps extends HTMLAttributes<HTMLDivElement> {
  label: string
  helpText?: string
  error?: string
  children: ReactNode
}

export function UiField({ label, helpText, error, children, className = '', ...props }: UiFieldProps) {
  return (
    <div className={`ui-field ${className}`.trim()} {...props}>
      <span className="ui-field-label">{label}</span>
      {children}
      {(error || helpText) && (
        <span className={`ui-field-help ${error ? 'is-error' : ''}`} role={error ? 'alert' : undefined}>
          {error ?? helpText}
        </span>
      )}
    </div>
  )
}

type StatusTone = 'neutral' | 'success' | 'warning' | 'error' | 'update' | 'installed'

export function UiStatus({ tone = 'neutral', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return <span className={`ui-status ui-status--${tone} ${className}`.trim()} {...props} />
}

interface UiDialogProps {
  open: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
  closeLabel: string
  onClose: () => void
  dismissible?: boolean
  className?: string
}

export function UiDialog({
  open,
  title,
  children,
  footer,
  closeLabel,
  onClose,
  dismissible = true,
  className = '',
}: UiDialogProps) {
  const titleId = `ui-dialog-${useId().replace(/:/g, '')}`
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(dialogRef, { active: open, onEscape: dismissible ? onClose : undefined })
  if (!open) return null

  return createPortal(
    <div className="ui-dialog-backdrop" onMouseDown={() => dismissible && onClose()}>
      <div
        ref={dialogRef}
        className={`ui-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ui-dialog-header">
          <h2 id={titleId}>{title}</h2>
          {dismissible && <UiButton variant="subtle" aria-label={closeLabel} onClick={onClose}>×</UiButton>}
        </header>
        <div className="ui-dialog-body">{children}</div>
        {footer && <footer className="ui-dialog-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

interface UiEmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string
  message?: string
  action?: ReactNode
}

export function UiEmptyState({ title, message, action, className = '', ...props }: UiEmptyStateProps) {
  return (
    <div className={`ui-empty-state ${className}`.trim()} role="status" {...props}>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}
