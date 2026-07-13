import type { ReactNode } from 'react'
import { ClaudeIcon } from '@/components/icons/ClaudeIcon'
import { NanoBananaIcon } from '@/components/NanoBananaIcon'
import { OpenAIIcon } from '@/components/OpenAIIcon'
import { QwenIcon } from '@/components/QwenIcon'
import { ZhipuIcon } from '@/components/ZhipuIcon'
import { isClaudeModel } from '@/features/settings/modelBrand'
import { themeClasses } from '@/styles/themeClasses'
import type { ProviderId } from '@/config/modelCatalog'
import type { CustomImageModelConfig } from '@/types'

function getModelIconMeta(model: Pick<CustomImageModelConfig, 'modelId' | 'name'> & { provider?: ProviderId }) {
  const normalized = `${model.name} ${model.modelId}`.toLowerCase()

  if (normalized.includes('banana')) {
    return {
      glyph: '🍌',
      className: 'border-amber-300/25 bg-amber-300/12 text-amber-200',
    }
  }

  if (normalized.includes('gpt')) {
    return {
      glyph: '◎',
      className: 'border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-secondary)]',
    }
  }

  if (normalized.includes('qwen')) {
    return {
      glyph: '',
      className: '',
    }
  }

  if (model.provider === 'openai') {
    return {
      glyph: '◎',
      className: 'border-[var(--border-subtle)] bg-[var(--control-bg)] text-[var(--text-secondary)]',
    }
  }

  return {
    glyph: '✦',
    className: 'border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]',
  }
}

export function ModelOptionIcon({ model }: { model: Pick<CustomImageModelConfig, 'modelId' | 'name'> & { provider?: ProviderId } }) {
  const normalized = `${model.name} ${model.modelId}`.toLowerCase()

  if (isClaudeModel(model)) {
    return (
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <ClaudeIcon className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (normalized.includes('gemini-3.1-flash-image-preview') || normalized.includes('gemini-3-pro-image-preview') || normalized.includes('gemini')) {
    return (
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <NanoBananaIcon className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (normalized.includes('qwen')) {
    return (
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <QwenIcon className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (normalized.includes('glm') || normalized.includes('zhipu') || normalized.includes('智谱')) {
    return (
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <ZhipuIcon className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (normalized.includes('gpt') || model.provider === 'openai') {
    return (
      <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-secondary)]">
        <OpenAIIcon className="h-3 w-3" />
      </span>
    )
  }

  const iconMeta = getModelIconMeta(model)

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${iconMeta.className}`}
    >
      {iconMeta.glyph}
    </span>
  )
}

export function RatioPreview({ ratio }: { ratio: string }) {
  const [rawWidth, rawHeight] = ratio.split(':').map(Number)

  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    return (
      <span aria-hidden="true" className="inline-flex h-5 w-7 shrink-0 items-center justify-center">
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-dashed border-[color-mix(in_srgb,var(--text-primary)_70%,transparent)] bg-transparent" />
      </span>
    )
  }

  const maxWidth = 20
  const maxHeight = 16
  const scale = Math.min(maxWidth / rawWidth, maxHeight / rawHeight)
  const width = Math.round(rawWidth * scale)
  const height = Math.round(rawHeight * scale)

  return (
    <span aria-hidden="true" className="inline-flex h-5 w-7 shrink-0 items-center justify-center">
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[3px] border border-[color-mix(in_srgb,var(--text-primary)_80%,transparent)] bg-transparent"
        style={{ width, height }}
      />
    </span>
  )
}

export function SettingsSegment<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
  renderOption,
  groupClassName = '',
  buttonClassName = '',
  slider = false,
  gridSlider,
}: {
  value: T | string
  options: readonly T[]
  ariaLabel: string
  onChange: (value: T) => void
  renderOption?: (value: T, active: boolean) => ReactNode
  groupClassName?: string
  buttonClassName?: string
  slider?: boolean
  gridSlider?: {
    columns: number
    rowHeightRem: number
    columnGapRem: number
    rowGapRem: number
    insetRem: number
  }
}) {
  const activeIndex = Math.max(0, options.findIndex((option) => option === value))
  const sliderGapRem = 0.25
  const sliderHorizontalInsetRem = 0.5
  const sliderTotalGapRem = Math.max(0, options.length - 1) * sliderGapRem
  const hasAnimatedIndicator = slider || Boolean(gridSlider)
  const gridColumn = gridSlider ? activeIndex % gridSlider.columns : 0
  const gridRow = gridSlider ? Math.floor(activeIndex / gridSlider.columns) : 0
  const gridTotalColumnGapRem = gridSlider ? Math.max(0, gridSlider.columns - 1) * gridSlider.columnGapRem : 0

  return (
    <div
      className={`${themeClasses.nodeSegmentGroup} ${hasAnimatedIndicator ? 'relative' : ''} ${slider ? 'gap-1' : ''} ${groupClassName}`}
      role="group"
      aria-label={ariaLabel}
    >
      {slider && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-[7px] border border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] shadow-[0_6px_18px_rgba(124,58,237,0.22),inset_0_0_0_1px_color-mix(in_srgb,var(--text-primary)_7%,transparent)] transition-transform duration-200 ease-out"
          style={{
            width: `calc((100% - ${sliderHorizontalInsetRem}rem - ${sliderTotalGapRem}rem) / ${options.length})`,
            transform: `translateX(calc(${activeIndex} * (100% + ${sliderGapRem}rem)))`,
          }}
        />
      )}
      {gridSlider && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[7px] border border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] shadow-[0_6px_18px_rgba(124,58,237,0.22),inset_0_0_0_1px_color-mix(in_srgb,var(--text-primary)_7%,transparent)] transition-transform duration-200 ease-out"
          style={{
            left: `${gridSlider.insetRem}rem`,
            top: `${gridSlider.insetRem}rem`,
            width: `calc((100% - ${gridSlider.insetRem * 2}rem - ${gridTotalColumnGapRem}rem) / ${gridSlider.columns})`,
            height: `${gridSlider.rowHeightRem}rem`,
            transform: `translate(calc(${gridColumn} * (100% + ${gridSlider.columnGapRem}rem)), calc(${gridRow} * (${gridSlider.rowHeightRem}rem + ${gridSlider.rowGapRem}rem)))`,
          }}
        />
      )}
      {options.map((option) => {
        const active = option === value

        return (
          <button
            key={option}
            type="button"
            className={`${themeClasses.nodeSegmentButton} ${hasAnimatedIndicator ? 'relative z-10 bg-transparent shadow-none' : ''} ${buttonClassName} ${
              active
                ? hasAnimatedIndicator
                  ? 'text-[var(--text-primary)]'
                  : themeClasses.nodeSegmentButtonActive
                : ''
            }`}
            aria-pressed={active}
            onClick={() => onChange(option)}
          >
            {renderOption ? renderOption(option, active) : option}
          </button>
        )
      })}
    </div>
  )
}

export function SettingsSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-1.5 px-0.5 text-[10px] font-semibold tracking-[0.04em] text-[var(--text-muted)]">
        {title}
      </div>
      {children}
    </section>
  )
}
