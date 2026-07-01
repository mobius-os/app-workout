import React from 'react'
import { SportIcon } from './SportIcon.jsx'

// A tappable exercise name + icon that opens the per-exercise detail sheet.
export function ExerciseLink({ icon, color, activity, onOpen }) {
  return (
    <button type="button" className="wk-ex-link" onClick={onOpen} aria-label={`${activity} details`}>
      <SportIcon name={icon} color={color} size={16} />
      {activity}
      <span className="wk-ex-chevron" aria-hidden>›</span>
    </button>
  )
}
