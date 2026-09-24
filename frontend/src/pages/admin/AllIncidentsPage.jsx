import IncidentTable from '../../components/IncidentTable'

export default function AllIncidentsPage() {
  return <IncidentTable title="All Incidents" emptyMessage="No incidents have been reported yet." splitByOwnership />
}
