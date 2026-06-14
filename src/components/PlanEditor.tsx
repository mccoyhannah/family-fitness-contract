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

const PLAN_ITEM_INDEX_LABELS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

function planItemIndexLabel(index: number) {
  return `动作${PLAN_ITEM_INDEX_LABELS[index] ?? index + 1}`
}

function planItemNumberLabel(index: number) {
  return String(index + 1).padStart(2, '0')
}

export default function PlanEditor({ checkInDeadline, initial, onSubmit, submitLabel }: PlanEditorProps) {
  const initialKey = useMemo(
    () => {
      const itemKey = initial.items
        .map((item) => [item.name, item.sets, item.reps, item.note, item.sort_order].join('~'))
        .join('|')
      return `${initial.id ?? 'new'}:${initial.user_id}:${initial.date}:${initial.source}:${initial.title}:${initial.focus}:${initial.deadline}:${initial.is_training}:${itemKey}`
    },
    [initial],
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
    setError('')
    const normalizedDraft = normalizePlanDraftForSave(draft, checkInDeadline)
    if (normalizedDraft.is_training && normalizedDraft.items.length === 0) {
      setError('请先添加至少一个训练动作。')
      return
    }
    setSaving(true)
    try {
      await onSubmit(normalizedDraft)
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
      <section className="plan-editor-section plan-editor-mode-section" aria-label="今日性质">
        <div className="plan-editor-section-head">
          <span>今日性质</span>
          <strong>{draft.is_training ? '训练日' : '恢复日'}</strong>
        </div>
        <div className="plan-mode-group plan-mode-toolbar" role="group" aria-label="计划类型">
          <button
            aria-pressed={draft.is_training}
            className={`plan-mode-option${draft.is_training ? ' selected' : ''}`}
            type="button"
            onClick={() => changeTrainingMode(true)}
          >
            训练
          </button>
          <button
            aria-pressed={!draft.is_training}
            className={`plan-mode-option${!draft.is_training ? ' selected' : ''}`}
            type="button"
            onClick={() => changeTrainingMode(false)}
          >
            休息
          </button>
        </div>
      </section>

      {draft.is_training ? (
        <>
          <section className="plan-editor-section plan-summary-card" aria-label="计划摘要">
            <div className="plan-editor-section-head">
              <span>计划摘要</span>
              <strong>{draft.title || '未命名计划'}</strong>
            </div>
            <div className="plan-title-focus-row">
              <label className="plan-title-field">
                标题
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label>
                重点
                <input value={draft.focus} onChange={(event) => setDraft({ ...draft, focus: event.target.value })} />
              </label>
            </div>
          </section>

          <div className="section-heading compact-heading contract-section-heading plan-items-heading">
            <div>
              <span>训练内容</span>
              <h3>动作清单</h3>
            </div>
            <button className="icon-action" type="button" onClick={addItem} aria-label="添加动作">
              <Plus size={18} />
            </button>
          </div>

          <div className="plan-item-list contract-term-list">
            {draft.items.map((item, index) => (
              <article className="plan-item-editor contract-term-editor" key={item.id ?? index}>
                <div className="plan-item-editor-head">
                  <span className="plan-item-number" aria-hidden="true">{planItemNumberLabel(index)}</span>
                  <span className="plan-item-index">{planItemIndexLabel(index)}</span>
                  <button className="icon-action danger-action plan-item-remove" type="button" onClick={() => removeItem(index)} aria-label={`删除${planItemIndexLabel(index)}`}>
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="plan-item-fields">
                  <label className="plan-item-name-field">
                    <span className="visually-hidden">{planItemIndexLabel(index)}名称</span>
                    <input
                      aria-label={`${planItemIndexLabel(index)}名称`}
                      placeholder="动作名称"
                      value={item.name}
                      onChange={(event) => updateItem(index, 'name', event.target.value)}
                    />
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
            <strong>设为恢复日</strong>
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
