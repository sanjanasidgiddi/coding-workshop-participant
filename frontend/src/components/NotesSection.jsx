import { useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Button, CircularProgress, Paper, TextField } from '@mui/material'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { createNote, listNotes } from '../services/notesService'
import { formatDateTime, formatEnumLabel } from '../utils/format'
import './NotesSection.css'

/**
 * Chronological note/comment history for an incident, plus an add-note
 * form. `canAddNote` is computed by the caller from data it already has
 * (role + incident ownership/status), since reaching this page at all
 * already proves view access.
 */
export default function NotesSection({ incidentId, canAddNote }) {
  const { token } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const { data, loading, error } = useAsync(() => listNotes(token, incidentId), [token, incidentId, refreshKey])
  const notes = data?.notes || []

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')
    setSubmitting(true)
    try {
      await createNote(token, incidentId, note)
      setNote('')
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setSubmitError(err.message || 'Failed to add note')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="notes-section">
      <p className="notes-section__title">Notes &amp; History</p>

      {error && (
        <Alert severity="error" className="notes-section__alert">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="notes-section__loading">
          <CircularProgress size={24} />
        </div>
      ) : notes.length === 0 ? (
        <p className="notes-section__empty">No notes yet.</p>
      ) : (
        <div className="notes-section__list">
          {notes.map((entry) => (
            <Paper key={entry.id} variant="outlined" className="notes-section__note">
              <div className="notes-section__note-header">
                <p className="notes-section__note-author">
                  {entry.author_name || `User #${entry.author_user_id}`} ·{' '}
                  {formatEnumLabel(entry.author_role)}
                </p>
                <p className="notes-section__note-time">{formatDateTime(entry.created_at)}</p>
              </div>
              <p className="notes-section__note-text">{entry.note}</p>
            </Paper>
          ))}
        </div>
      )}

      {canAddNote && (
        <form onSubmit={handleSubmit} className="notes-section__form">
          {submitError && (
            <Alert severity="error" className="notes-section__alert">
              {submitError}
            </Alert>
          )}
          <TextField
            label="Add a note"
            fullWidth
            multiline
            minRows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
          />
          <Button
            type="submit"
            variant="contained"
            className="notes-section__submit"
            disabled={submitting || !note.trim()}
          >
            {submitting ? 'Posting…' : 'Post Note'}
          </Button>
        </form>
      )}
    </div>
  )
}

NotesSection.propTypes = {
  incidentId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  canAddNote: PropTypes.bool.isRequired,
}
