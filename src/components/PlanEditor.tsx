import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { normalizePlanDraftForSave } from '../lib/plan'
import type { PlanDraft } from '../lib/types'

type PlanEditorProps = {
  checkInDeadline: string
  initial: PlanDraft
  submitLabel: string
  onSubmit: (draft: PlanDraft) => Promise<void>
}

export default function PlanEditor({ checkInDeadline, initial, onSubmit, submitLabel }: PlanEditorProps) {
  const initialKey = useMemo(
    () => `${initial.id ?? 'new'}:${initial.user_id}:${initial.date}:${initial.source}`,
    [initial.date, initial.id, initial.source, initial.user_id],
  )
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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
      await onSubmit(normalizePlanDraftForSave(draft, checkInDeadline))
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
      <div className="plan-mode-group plan-mode-toolbar" role="group" aria-label="计划类型">
        <button
          aria-pressed={draft.is_training}
          className={`plan-mode-option${draft.is_training ? ' selected' : ''}`}
          type="button"
          onClick={() => changeTrainingMode(true)}
        >
          训练日
        </button>
        <button
          aria-pressed={!draft.is_training}
          className={`plan-mode-option${!draft.is_training ? ' selected' : ''}`}
          type="button"
          onClick={() => changeTrainingMode(false)}
        >
          休息日
        </button>
      </div>

      {draft.is_training ? (
        <>
          <div className="plan-title-focus-row">
            <label>
              标题
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label>
              重点
              <input value={draft.focus} onChange={(event) => setDraft({ ...draft, focus: event.target.value })} />
            </label>
          </div>

          <div className="section-heading compact-heading contract-section-heading">
            <h3>动作</h3>
            <button className="icon-action" type="button" onClick={addItem} aria-label="添加动作">
              <Plus size={18} />
            </button>
          </div>

          <div className="plan-item-list contract-term-list">
            {draft.items.map((item, index) => (
              <article className="plan-item-editor contract-term-editor" key={item.id ?? index}>
                <div className="plan-item-editor-head">
                  <span className="plan-item-index">动作 {index + 1}</span>
                  <button className="icon-action danger-action plan-item-remove" type="button" onClick={() => removeItem(index)} aria-label={`删除动作 ${index + 1}`}>
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="plan-item-fields">
                  <label className="plan-item-name-field">
                    动作名
                    <input value={item.name} onChange={(event) => updateItem(index, 'name', event.target.value)} />
                  </label>
                  <label>
                    组数
                    <input value={item.sets} onChange={(event) => updateItem(index, 'sets', event.target.value)} />
                  </label>
                  <label>
                    次数/时间
                    <input value={item.reps} onChange={(event) => updateItem(index, 'reps', event.target.value)} />
                  </label>
                </div>
                <label className="plan-item-note-field">
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
            <strong>今日设为休息日</strong>
            <span className="plan-rest-badge">休息日</span>
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
