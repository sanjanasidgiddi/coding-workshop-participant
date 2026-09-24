import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import IncidentStatusStepper from '../../src/components/IncidentStatusStepper'

const COLOR_CLASSES = [
  'incident-status-stepper__node--filled',
  'incident-status-stepper__node--in-progress',
  'incident-status-stepper__node--resolved',
  'incident-status-stepper__node--closed',
  'incident-status-stepper__node--blocked',
]

function expectPlainNode(step) {
  const node = screen.getByTestId(`incident-status-stepper__node--${step}`)
  COLOR_CLASSES.forEach((cls) => expect(node).not.toHaveClass(cls))
}

function expectColoredNode(step, colorClass) {
  expect(screen.getByTestId(`incident-status-stepper__node--${step}`)).toHaveClass(colorClass)
}

describe('IncidentStatusStepper', () => {
  it('OPEN: only the OPEN node is highlighted, the rest stay plain/uncolored', () => {
    render(<IncidentStatusStepper status="OPEN" />)

    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()

    expectColoredNode('OPEN', 'incident-status-stepper__node--filled')
    expectPlainNode('IN_PROGRESS')
    expectPlainNode('RESOLVED')
    expectPlainNode('CLOSED')
  })

  it('IN_PROGRESS: only OPEN and IN_PROGRESS turn blue, RESOLVED/CLOSED stay plain', () => {
    render(<IncidentStatusStepper status="IN_PROGRESS" />)

    expectColoredNode('OPEN', 'incident-status-stepper__node--in-progress')
    expectColoredNode('IN_PROGRESS', 'incident-status-stepper__node--in-progress')
    expectPlainNode('RESOLVED')
    expectPlainNode('CLOSED')
  })

  it('RESOLVED: OPEN through RESOLVED turn green, CLOSED stays plain (not colored yet)', () => {
    render(<IncidentStatusStepper status="RESOLVED" />)

    expectColoredNode('OPEN', 'incident-status-stepper__node--resolved')
    expectColoredNode('IN_PROGRESS', 'incident-status-stepper__node--resolved')
    expectColoredNode('RESOLVED', 'incident-status-stepper__node--resolved')
    expectPlainNode('CLOSED')
  })

  it('CLOSED: the entire sequence turns violet, since the lifecycle is fully complete', () => {
    render(<IncidentStatusStepper status="CLOSED" />)

    expectColoredNode('OPEN', 'incident-status-stepper__node--closed')
    expectColoredNode('IN_PROGRESS', 'incident-status-stepper__node--closed')
    expectColoredNode('RESOLVED', 'incident-status-stepper__node--closed')
    expectColoredNode('CLOSED', 'incident-status-stepper__node--closed')
  })

  it('BLOCKED: only OPEN and IN_PROGRESS turn red, RESOLVED/CLOSED stay plain, plus a separate red branch - never a 5th main node', () => {
    render(<IncidentStatusStepper status="BLOCKED" />)

    expect(screen.getAllByTestId(/^incident-status-stepper__node--/)).toHaveLength(4)

    expectColoredNode('OPEN', 'incident-status-stepper__node--blocked')
    expectColoredNode('IN_PROGRESS', 'incident-status-stepper__node--blocked')
    expectPlainNode('RESOLVED')
    expectPlainNode('CLOSED')

    // The main OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED line stays fully visible and unchanged.
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()

    // The BLOCKED branch is a separate, additional element - a red circle with its own label.
    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(screen.getByTestId('incident-status-stepper__branch-node')).toBeInTheDocument()
  })
})
