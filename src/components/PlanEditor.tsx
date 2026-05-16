import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { PlanDraft } from '../lib/types'

type PlanEditorProps = {
  initial: PlanDraft
  submitLabel: string
  onSubmit: (draft: PlanDraft) => Promise<void>
}

export default function PlanEditor({ initial, onSubmit, submitLabel }: PlanEditorProps) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(initial)
    setError('')
  }, [initial])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const items = draft.items
        .map((item, index) => ({ ...item, sort_order: index }))
        .filter((item) => item.name.trim())
      await onSubmit({
        ...draft,
        title: draft.title.trim() || '今日训练',
        focus: draft.focus.trim() || '自定训练',
        deadline: draft.deadline || '23:00',
        items: draft.is_training
          ? items.length > 0
            ? items
            : [{ name: '自定训练', sets: '1 次', reps: '完成即可', note: '按身体状态量力而行', sort_order: 0 }]
          : items,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试。')
    } finally {
      setSaving(false)
    }
  }

  const updateItem = (index: number, key: 'name' | 'sets' | 'reps' | 'note', value: string) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }))
  }

  const addItem = () => {
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        { name: '', sets: '3 组', reps: '8 次', note: '动作慢一点，注意安全', sort_order: current.items.length },
      ],
    }))
  }

  const removeItem = (index: number) => {
    setDraft((current) => ({ ...current, items: current.items.filter((_item, itemIndex) => itemIndex !== index) }))
  }

  return (
    <form className="form-card plan-editor" onSubmit={submit}>
      <label>
        计划标题
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </label>
      <label>
        训练重点
        <input value={draft.focus} onChange={(event) => setDraft({ ...draft, focus: event.target.value })} />
      </label>
      <div className="form-grid">
        <label>
          截止时间
          <input
            type="time"
            value={draft.deadline}
            onChange={(event) => setDraft({ ...draft, deadline: event.target.value })}
          />
        </label>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={draft.is_training}
            onChange={(event) => setDraft({ ...draft, is_training: event.target.checked })}
          />
          训练日
        </label>
      </div>

      <div className="section-heading compact-heading">
        <h3>动作</h3>
        <button className="icon-action" type="button" onClick={addItem} aria-label="添加动作">
          <Plus size={18} />
        </button>
      </div>

      <div className="plan-item-list">
        {draft.items.map((item, index) => (
          <article className="plan-item-editor" key={item.id ?? index}>
            <div className="form-grid">
              <label>
                动作名
                <input value={item.name} onChange={(event) => updateItem(index, 'name', event.target.value)} />
              </label>
              <label>
                组数
                <input value={item.sets} onChange={(event) => updateItem(index, 'sets', event.target.value)} />
              </label>
            </div>
            <div className="form-grid">
              <label>
                次数/时间
                <input value={item.reps} onChange={(event) => updateItem(index, 'reps', event.target.value)} />
              </label>
              <button className="icon-action danger-action" type="button" onClick={() => removeItem(index)} aria-label="删除动作">
                <Trash2 size={18} />
              </button>
            </div>
            <label>
              注意事项
              <input value={item.note} onChange={(event) => updateItem(index, 'note', event.target.value)} />
            </label>
          </article>
        ))}
      </div>

      {error && <strong className="form-error">{error}</strong>}
      <button className="primary-action" disabled={saving} type="submit">
        {saving ? '保存中...' : submitLabel}
      </button>
    </form>
  )
}
