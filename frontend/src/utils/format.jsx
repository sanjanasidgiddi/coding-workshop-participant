export function formatEnumLabel(value) {
  if (!value) return ''
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatDateTime(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatFacility(facility) {
  if (!facility) return '—'
  const parts = [facility.building]
  if (facility.floor) parts.push(`Floor ${facility.floor}`)
  if (facility.room) parts.push(`Room ${facility.room}`)
  return parts.join(' · ')
}
