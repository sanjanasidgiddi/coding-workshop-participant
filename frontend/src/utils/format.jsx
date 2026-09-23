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
  const parts = [facility.building, `Floor ${facility.floor}`]
  if (facility.seat) parts.push(`Seat ${facility.seat}`)
  return parts.join(' · ')
}
