type FatigueOption = {
  value: number
  label: string
  hint: string
  face: string
}

const options: FatigueOption[] = [
  { value: 1, label: '轻松', hint: '状态很好', face: '🙂' },
  { value: 2, label: '正常', hint: '可以坚持', face: '😐' },
  { value: 3, label: '有点累', hint: '需要放慢', face: '😮‍💨' },
  { value: 4, label: '很累', hint: '建议减量', face: '🥵' },
  { value: 5, label: '不舒服', hint: '先停下来', face: '🤒' },
]

const leaveOptions: FatigueOption[] = [
  { value: 1, label: '可训练', hint: '状态稳定', face: '✓' },
  { value: 2, label: '轻度疲劳', hint: '能缓一缓', face: '·' },
  { value: 3, label: '有点透支', hint: '需要调整', face: '!' },
  { value: 4, label: '身体不适', hint: '建议请假', face: '+' },
  { value: 5, label: '需要暂停', hint: '先休息', face: '×' },
]

type FatigueCardsProps = {
  disabled?: boolean
  value: number | null
  onChange: (value: number) => void
  variant?: 'checkin' | 'leave'
}

export default function FatigueCards({ disabled = false, onChange, value, variant = 'checkin' }: FatigueCardsProps) {
  const fatigueOptions = variant === 'leave' ? leaveOptions : options
  const fieldLabel = variant === 'leave' ? '请假状态' : '疲劳程度'

  return (
    <div className={`fatigue-field fatigue-field-${variant}`} aria-label={fieldLabel}>
      <div className="field-label">{fieldLabel}</div>
      <div className="fatigue-grid">
        {fatigueOptions.map((option) => (
          <button
            aria-pressed={option.value === value}
            className={option.value === value ? 'fatigue-card active' : 'fatigue-card'}
            disabled={disabled}
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
          >
            <span className="fatigue-main">
              <span className="fatigue-face" aria-hidden="true">{option.face}</span>
              <strong>{option.label}</strong>
            </span>
            <span className="fatigue-detail">
              <b>{option.value}/5</b>
              <small>{option.hint}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
