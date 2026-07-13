const NODE_SHELL_BASE_CLASS =
  'node-shell group relative flex h-full w-full flex-col overflow-visible rounded-xl border bg-[var(--node-bg)] text-[var(--text-primary)] shadow-[var(--shadow-panel)] transition-[border-color,box-shadow,background-color] duration-200'
const NODE_SHELL_SELECTED_CLASS = 'border-[var(--accent-violet-strong)] shadow-[0_16px_40px_var(--accent-violet-glow),0_0_0_1px_var(--accent-violet-soft)]'
const NODE_SHELL_UNSELECTED_CLASS = 'border-[var(--node-border)] hover:border-[var(--accent-violet-muted)] hover:shadow-[var(--shadow-panel)]'

type NodeShellClassNameOptions = {
  selected: boolean
  className?: string
}

export function getNodeShellClassName({ selected, className = '' }: NodeShellClassNameOptions) {
  return [
    NODE_SHELL_BASE_CLASS,
    selected ? NODE_SHELL_SELECTED_CLASS : NODE_SHELL_UNSELECTED_CLASS,
    className,
  ]
    .filter(Boolean)
    .join(' ')
}
