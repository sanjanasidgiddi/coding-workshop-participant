import { Component } from 'react'
import PropTypes from 'prop-types'
import { Button, Paper } from '@mui/material'
import './ErrorBoundary.css'

// Error boundaries must be class components - React has no hook equivalent.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <Paper variant="outlined" className="error-boundary__card">
            <p className="error-boundary__title">Something went wrong</p>
            <p className="error-boundary__message">This page hit an unexpected error. Reloading usually fixes it.</p>
            <Button variant="contained" onClick={() => window.location.assign('/')}>
              Back to Home
            </Button>
          </Paper>
        </div>
      )
    }

    return this.props.children
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
}
