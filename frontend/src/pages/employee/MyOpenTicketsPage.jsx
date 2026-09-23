import IncidentTable from '../../components/IncidentTable'

// "Open" means "not yet closed" - an incident stays here through
// IN_PROGRESS/BLOCKED/RESOLVED and only drops off once an admin closes it.
// Module-level constant so IncidentTable receives a stable reference
// instead of a new object literal on every render.
const OPEN_FILTER = { status_ne: 'CLOSED' }

export default function MyOpenTicketsPage() {
  return <IncidentTable title="My Open Tickets" baseFilters={OPEN_FILTER} emptyMessage="You have no open tickets." />
}
