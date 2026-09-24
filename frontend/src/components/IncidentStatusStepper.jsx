import PropTypes from 'prop-types'
import { formatEnumLabel } from '../utils/format'
import './IncidentStatusStepper.css'

const STEPS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const IN_PROGRESS_INDEX = STEPS.indexOf('IN_PROGRESS')

// Only the portion of the track actually reached so far takes the current
// status's color - everything after stays the plain (bright, near-white)
// default styling, since it hasn't happened yet. BLOCKED counts as having
// reached IN_PROGRESS (it's still "in progress", just stalled), so RESOLVED
// and CLOSED stay uncolored while blocked, same as they would mid-progress.
const COLOR_BY_STATUS = {
  IN_PROGRESS: 'in-progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  BLOCKED: 'blocked',
}

function stepState(index, status) {
  const color = COLOR_BY_STATUS[status]
  if (!color) return index === 0 ? 'filled' : null // OPEN, or an unrecognized status
  const activeIndex = status === 'BLOCKED' ? IN_PROGRESS_INDEX : STEPS.indexOf(status)
  return index <= activeIndex ? color : null
}

/**
 * Dominant status tracker: OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED circles
 * joined by thick, directly-touching lines. BLOCKED is never a 5th node on
 * that line - a blocked incident is still "in progress", just stalled - so
 * it's rendered as a separate red branch forking diagonally off the
 * IN_PROGRESS circle, alongside the reached portion of the main track
 * turning red too.
 */
export default function IncidentStatusStepper({ status }) {
  const isBlocked = status === 'BLOCKED'

  return (
    <div
      className={`incident-status-stepper${isBlocked ? ' incident-status-stepper--blocked' : ''}`}
      role="img"
      aria-label={`Status: ${formatEnumLabel(status)}`}
    >
      <div className="incident-status-stepper__track">
        {STEPS.map((step, index) => {
          const state = stepState(index, status)
          const isBranchAnchor = isBlocked && index === IN_PROGRESS_INDEX

          return (
            <div className="incident-status-stepper__segment" key={step}>
              {index > 0 && (
                <span
                  className={`incident-status-stepper__line${state ? ` incident-status-stepper__line--${state}` : ''}`}
                />
              )}
              <div className="incident-status-stepper__step">
                <span
                  data-testid={`incident-status-stepper__node--${step}`}
                  className={`incident-status-stepper__node${state ? ` incident-status-stepper__node--${state}` : ''}`}
                />
                <span
                  className={`incident-status-stepper__label${state ? ' incident-status-stepper__label--active' : ''}`}
                >
                  {formatEnumLabel(step)}
                </span>

                {isBranchAnchor && (
                  <>
                    <span className="incident-status-stepper__branch-line" />
                    <div className="incident-status-stepper__branch-endpoint">
                      <span
                        data-testid="incident-status-stepper__branch-node"
                        className="incident-status-stepper__branch-node"
                      />
                      <span className="incident-status-stepper__branch-label">Blocked</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

IncidentStatusStepper.propTypes = {
  status: PropTypes.string.isRequired,
}
