import { createTheme } from '@mui/material/styles'

/**
 * Centralized ACME Inc. theme: an understated, muted violet-grey mauve
 * palette on a cool off-white background. Mauve is reserved for primary
 * actions, active states, and accents rather than filling every surface.
 * Deliberately kept away from pink/lilac - the hue sits in the violet-grey
 * range (desaturated, hue ~265-275°) rather than the rose/pink range.
 */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6E6479',
      light: '#8B8296',
      dark: '#4F4759',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#A79CB0',
      light: '#C2B9C9',
      dark: '#8A8091',
      contrastText: '#2B2830',
    },
    background: {
      default: '#F7F5F8',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#2B2830',
      secondary: '#6A6470',
    },
    divider: '#E1DCE5',
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
          color: '#2B2830',
          borderBottom: '1px solid #E1DCE5',
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

// Hex equivalents of the semantic keys above (MUI's default light-mode
// palette, not overridden in this theme), for chart libraries that need an
// actual color value rather than an MUI component `color` prop. Keep these
// in sync with the --color-semantic-* custom properties in theme.css.
export const semanticColorHex = {
  default: '#6A6470',
  info: '#0288D1',
  warning: '#ED6C02',
  success: '#2E7D32',
  error: '#D32F2F',
}
