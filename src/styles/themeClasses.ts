export const themeClasses = {
  canvas: 'bg-[var(--canvas-bg)] text-[var(--text-primary)]',
  floatingPanel:
    'rounded-xl border border-[var(--floating-panel-border)] bg-[var(--floating-panel-bg)] shadow-[var(--shadow-floating-panel)] backdrop-blur-2xl',
  compactFloatingPanel:
    'rounded-lg border border-[var(--floating-panel-border)] bg-[var(--floating-panel-bg)] shadow-[var(--shadow-floating-panel)] backdrop-blur-2xl',
  strongPanel:
    'rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] shadow-[var(--shadow-panel)] backdrop-blur-2xl',
  iconButton:
    'inline-flex items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-muted)] transition hover:border-[var(--border-subtle)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--text-primary)_20%,transparent)]',
  iconButtonActive:
    'border-[var(--border-subtle)] bg-[var(--control-bg-hover)] text-[var(--text-primary)]',
  secondaryButton:
    'inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-primary)] transition hover:bg-[var(--control-bg-hover)]',
  input:
    'rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent-violet-strong)] focus:ring-2 focus:ring-[var(--accent-violet-soft)]',
  textPrimary: 'text-[var(--text-primary)]',
  textSecondary: 'text-[var(--text-secondary)]',
  textMuted: 'text-[var(--text-muted)]',
  divider: 'bg-[var(--border-subtle)]',
  tooltip:
    'whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-xl',
  shortcutKey:
    'shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] px-1.5 py-0.5 text-[9px] font-medium leading-none text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  nodeInput:
    'rounded-lg border border-[var(--border-subtle)] bg-[var(--node-control-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent-violet-strong)] focus:bg-[var(--node-control-bg-hover)] focus:ring-2 focus:ring-[var(--accent-violet-soft)]',
  nodeTextarea:
    'rounded-xl border border-[var(--border-subtle)] bg-[var(--node-control-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent-violet-strong)] focus:bg-[var(--node-control-bg-hover)] focus:ring-2 focus:ring-[var(--accent-violet-soft)]',
  nodeSubtlePanel:
    'rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg)]',
  nodeRaisedPanel:
    'rounded-xl border border-[var(--border-subtle)] bg-[var(--control-bg-hover)]',
  nodeToolbarPanel:
    'node-toolbar-panel rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] shadow-[var(--shadow-panel)] backdrop-blur-2xl',
  nodeToolbarButton:
    'inline-flex items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-muted)] transition hover:border-[var(--accent-violet-muted)] hover:bg-[var(--accent-violet-soft)] hover:text-[var(--accent-violet-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet-soft)] disabled:cursor-not-allowed disabled:text-[var(--text-muted)] disabled:hover:border-transparent disabled:hover:bg-transparent',
  nodeActionButton:
    'inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-secondary)] transition hover:border-[var(--accent-violet-muted)] hover:bg-[var(--accent-violet-soft)] hover:text-[var(--accent-violet-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet-soft)]',
  nodePrimaryButton:
    'inline-flex items-center justify-center rounded-lg border border-[var(--accent-violet-muted)] bg-[var(--accent-violet)] text-white transition hover:bg-[var(--accent-violet-strong)] disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:bg-[var(--control-bg)] disabled:text-[var(--text-muted)]',
  nodeFooter: 'mt-auto border-t border-[var(--border-subtle)] bg-transparent px-0 pt-1.5',
  nodeBadge:
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]',
  nodeBadgeViolet: 'border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]',
  nodeBadgeAmber: 'border-amber-400/25 bg-amber-400/10 text-amber-600 dark:text-amber-200',
  nodeBadgeRed: 'border-red-400/25 bg-red-500/10 text-red-500 dark:text-red-200',
  nodeBadgeEmerald: 'border-emerald-400/20 bg-emerald-400/8 text-emerald-600 dark:text-emerald-200',
  nodeAssetStrip: 'inline-flex max-w-full items-center self-start rounded-lg border border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] px-1.5 py-1',
  nodeAssetThumb:
    'relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
  nodeAssetIndexBadge:
    'absolute left-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] px-1 text-[7px] font-semibold leading-none text-[var(--text-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.28)]',
  nodeAssetRemoveButton:
    'pointer-events-none absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-red-300/20 bg-red-500 text-white opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.45)] transition-opacity duration-150 hover:bg-red-400',
  nodeInlineNotice: 'mt-1.5 px-0.5 text-[10px] leading-relaxed text-[var(--text-secondary)]',
  nodeWarningText: 'text-amber-500 dark:text-amber-300',
  nodeErrorText: 'text-red-500 dark:text-red-400',
  nodeSegmentGroup:
    'nodrag nopan grid h-9 grid-flow-col auto-cols-fr overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--control-bg)] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]',
  nodeSegmentButton:
    'flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-[var(--text-muted)] transition hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)]',
  nodeSegmentButtonActive:
    'bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)] shadow-[inset_0_0_0_1px_var(--accent-violet-muted)]',
  nodeLabel: 'text-[var(--text-secondary)]',
  nodeHint: 'text-[var(--text-muted)]',
  nodeDivider: 'border-[var(--border-subtle)]',
} as const
