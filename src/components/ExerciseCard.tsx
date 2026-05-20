import type { Exercise } from '../lib/types'
import { formatExerciseDose } from '../lib/planDisplay'

export default function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <article className="exercise-card">
      <div className="exercise-card-main">
        <h3>{exercise.name}</h3>
        <p>{exercise.note}</p>
      </div>
      <span className="exercise-dose">{formatExerciseDose(exercise)}</span>
    </article>
  )
}
