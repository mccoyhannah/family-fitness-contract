import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { defaultPlanFocusForSource } from '../lib/planDisplay'
import type { PlanDraft } from '../lib/types'

type PlanEditorProps = {
  initial: PlanDraft
  submitLabel: string
  onSubmit: (draft: PlanDraft) => Promise<void>
}

export default function PlanEditor({ initial, onSubmit, submitLabel }: PlanEditorProps) {
  const initialKey = useMemo(
    () => `${initial.id ?? 'new'}:${initial.user_id}:${initial.date}:${initial.source}`,
    [initial.date, initial.id, initial.source, initial.user_id],
  )
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const focusLabel = draft.is_training ? '训练重点' : '恢复重点'
  const modeClass = draft.is_training ? 'training-mode' : 'rest-mode'

  useEffect(() => {
    setDraft(initial)
    setError('')
  }, [initialKey])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const fallbackFocus = draft.is_training ? defaultPlanFocusForSource(draft.source) : '恢复调整'
      const items = draft.items
        .map((item, index) => ({ ...item, sort_order: index }))
        .filter((item) => item.name.trim())
      await onSubmit({
        ...draft,
        title: draft.title.trim() || (draft.is_training ? '今日训练' : '今日休息'),
        focus: draft.focus.trim() || fallbackFocus,
        deadline: draft.deadline || '23:00',
        items: draft.is_training
          ? items.length > 0
            ? items
            : [{ name: defaultPlanFocusForSource(draft.source), sets: '1 次', reps: '完成即可', note: '按身体状态量力而行', sort_order: 0 }]
          : [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试。')
    } finally {
      setSaving(false)
    }
  }

  const changeTrainingMode = (isTraining: boolean) => {
    setError('')
    setDraft({ ...draft, is_training: isTraining })
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
    <form className={`form-card plan-editor contract-clause-editor ${modeClass}`} onSubmit={submit}>
      <label>
        计划标题
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </label>
      <label>
        {focusLabel}
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
        <div className="plan-mode-group" role="group" aria-label="计划类型">
          <label className={`switch-row plan-mode-option${draft.is_training ? ' selected' : ''}`}>
            <input
              type="checkbox"
              checked={draft.is_training}
              onChange={(event) => changeTrainingMode(event.target.checked)}
            />
            训练日
          </label>
          <label className={`switch-row plan-mode-option${!draft.is_training ? ' selected' : ''}`}>
            <input
              type="checkbox"
              checked={!draft.is_training}
              onChange={(event) => changeTrainingMode(!event.target.checked)}
            />
            休息日
          </label>
        </div>
      </div>

      {draft.is_training ? (
        <>
          <div className="section-heading compact-heading contract-section-heading">
            <h3>动作</h3>
            <button className="icon-action" type="button" onClick={addItem} aria-label="添加动作">
              <Plus size={18} />
            </button>
          </div>

          <div className="plan-item-list contract-term-list">
            {draft.items.map((item, index) => (
              <article className="plan-item-editor contract-term-editor" key={item.id ?? index}>
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
        </>
      ) : (
        <section className="plan-rest-panel" aria-label="休息安排">
          <span className="plan-rest-mark" aria-hidden="true">休</span>
          <div className="plan-rest-copy">
            <strong>休息安排</strong>
            <div className="plan-rest-summary" aria-label="休息日摘要">
              <span>
                <small>状态</small>
                <b>休息日</b>
              </span>
              <span>
                <small>标题</small>
                <b>{draft.title.trim() || '今日休息'}</b>
              </span>
              <span>
                <small>恢复重点</small>
                <b>{draft.focus.trim() || '恢复调整'}</b>
              </span>
              <span>
                <small>动作</small>
                <b>无需安排</b>
              </span>
            </div>
          </div>
        </section>
      )}

      {error && <strong className="form-error">{error}</strong>}
      <button className="primary-action" disabled={saving} type="submit">
        {saving ? '保存中...' : submitLabel}
      </button>
    </form>
  )
}
