import IncidentTable from '../../components/IncidentTable'

// Module-level constant so IncidentTable receives a stable reference
// instead of a new object literal on every render.
const OPEN_FILTER = { status: 'OPEN' }

export default function MyOpenTicketsPage() {
  return <IncidentTable title="My Open Tickets" baseFilters={OPEN_FILTER} emptyMessage="You have no open tickets." />
}
