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

type FatigueCardsProps = {
  value: number
  onChange: (value: number) => void
}

export default function FatigueCards({ onChange, value }: FatigueCardsProps) {
  return (
    <div className="fatigue-field" aria-label="疲劳程度">
      <div className="field-label">疲劳程度</div>
      <div className="fatigue-grid">
        {options.map((option) => (
          <button
            aria-pressed={option.value === value}
            className={option.value === value ? 'fatigue-card active' : 'fatigue-card'}
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
          >
            <span className="fatigue-face" aria-hidden="true">{option.face}</span>
            <strong>{option.label}</strong>
            <small>{option.value}/5 · {option.hint}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
