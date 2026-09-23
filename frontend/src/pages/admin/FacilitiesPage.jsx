import { useState } from 'react'
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { createFacility, deleteFacility, listFacilities, updateFacility } from '../../services/facilitiesService'
import { formatDateTime } from '../../utils/format'
import './FacilitiesPage.css'

const EMPTY_FORM = { building: '', floor: '', seat: '' }

export default function FacilitiesPage() {
  const { token } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)

  const { data, loading, error } = useAsync(() => listFacilities(token), [token, refreshKey])
  const facilities = data?.facilities || []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  function openCreateDialog() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setDialogOpen(true)
  }

  function openEditDialog(facility) {
    setEditingId(facility.id)
    setForm({ building: facility.building, floor: facility.floor, seat: facility.seat || '' })
    setFormError('')
    setDialogOpen(true)
  }

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      const payload = { building: form.building, floor: form.floor, seat: form.seat || undefined }
      if (editingId) {
        await updateFacility(token, editingId, payload)
      } else {
        await createFacility(token, payload)
      }
      setDialogOpen(false)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setFormError(err.message || 'Failed to save facility')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    setDeleteError('')
    setDeleting(true)
    try {
      await deleteFacility(token, deleteTarget.id)
      setDeleteTarget(null)
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete facility')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="facilities-page__header">
        <p className="facilities-page__title">Facilities</p>
        <Button variant="contained" onClick={openCreateDialog}>
          Add Facility
        </Button>
      </div>

      {error && (
        <Alert severity="error" className="facilities-page__alert">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="facilities-page__loading">
          <CircularProgress />
        </div>
      ) : facilities.length === 0 ? (
        <Paper variant="outlined" className="facilities-page__empty">
          No facilities yet.
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Building</TableCell>
                <TableCell>Floor</TableCell>
                <TableCell>Seat</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {facilities.map((facility) => (
                <TableRow key={facility.id} hover>
                  <TableCell>{facility.building}</TableCell>
                  <TableCell>{facility.floor}</TableCell>
                  <TableCell>{facility.seat || '—'}</TableCell>
                  <TableCell>{formatDateTime(facility.created_at)}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEditDialog(facility)} aria-label="Edit facility">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleteTarget(facility)} aria-label="Delete facility">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editingId ? 'Edit Facility' : 'Add Facility'}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent className="facilities-page__dialog-content">
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Building" fullWidth required margin="normal" value={form.building} onChange={update('building')} />
            <TextField label="Floor" fullWidth required margin="normal" value={form.floor} onChange={update('floor')} />
            <TextField label="Seat (optional)" fullWidth margin="normal" value={form.seat} onChange={update('seat')} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Facility</DialogTitle>
        <DialogContent>
          {deleteError && <Alert severity="error">{deleteError}</Alert>}
          <p>
            Delete <strong>{deleteTarget?.building}</strong> (Floor {deleteTarget?.floor}
            {deleteTarget?.seat ? `, Seat ${deleteTarget.seat}` : ''})? This cannot be undone.
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
