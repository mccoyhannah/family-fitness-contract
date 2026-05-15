import type { Exercise } from '../lib/types'

export default function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <article className="exercise-card">
      <div>
        <h3>{exercise.name}</h3>
        <p>{exercise.note}</p>
      </div>
      <strong>
        {exercise.sets}
        <span>{exercise.reps}</span>
      </strong>
    </article>
  )
}
