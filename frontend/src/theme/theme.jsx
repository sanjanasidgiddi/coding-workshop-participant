import { createTheme } from '@mui/material/styles'

/**
 * Centralized ACME Inc. theme: an understated, muted mauve palette on a
 * warm off-white background. Mauve is reserved for primary actions, active
 * states, and accents rather than filling every surface.
 */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#8E6C7D',
      light: '#A98B9A',
      dark: '#6E4F5E',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#C9A9A0',
      light: '#DDC3BC',
      dark: '#A98277',
      contrastText: '#2E2A28',
    },
    background: {
      default: '#FAF6F4',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#2E2A28',
      secondary: '#6B615D',
    },
    divider: '#E6DAD6',
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: ['"Inter"', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'].join(','),
    h1: { fontWeight: 600 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          color: '#2E2A28',
          borderBottom: '1px solid #E6DAD6',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
  },
})

// Status/priority chip colors stay on MUI's semantic palette (success/
// warning/error/info) rather than the mauve brand palette, so ticket state
// always reads as itself regardless of theming.
export const statusColors = {
  OPEN: 'default',
  IN_PROGRESS: 'info',
  BLOCKED: 'warning',
  RESOLVED: 'success',
  CLOSED: 'default',
}

export const priorityColors = {
  LOW: 'default',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'error',
}
