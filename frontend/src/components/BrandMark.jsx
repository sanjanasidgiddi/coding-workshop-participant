import PropTypes from 'prop-types'
import { Box, Stack, Typography } from '@mui/material'

/**
 * ACME Inc. brand mark. No logo asset exists anywhere in this repo, so this
 * is a simple text-based mark (a monogram tile + wordmark) built with
 * MUI/CSS rather than an imported image.
 */
export default function BrandMark({ variant, align }) {
  const isFull = variant === 'full'

  return (
    <Stack
      direction={isFull ? 'column' : 'row'}
      spacing={isFull ? 1 : 1.5}
      alignItems="center"
      sx={{ justifyContent: align === 'center' ? 'center' : 'flex-start' }}
    >
      <Box
        sx={{
          width: isFull ? 48 : 36,
          height: isFull ? 48 : 36,
          borderRadius: 2,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: isFull ? 22 : 16,
          flexShrink: 0,
          letterSpacing: 0.5,
        }}
      >
        A
      </Box>
      <Box sx={{ textAlign: align === 'center' ? 'center' : 'left' }}>
        <Typography
          variant={isFull ? 'h5' : 'subtitle1'}
          sx={{ fontWeight: 700, lineHeight: 1.15, color: 'text.primary' }}
        >
          ACME Inc.
        </Typography>
        <Typography
          variant={isFull ? 'body2' : 'caption'}
          sx={{
            color: 'text.secondary',
            display: { xs: isFull ? 'block' : 'none', sm: 'block' },
          }}
        >
          Facilities Incident Management
        </Typography>
      </Box>
    </Stack>
  )
}

BrandMark.propTypes = {
  /** 'full' for auth pages (larger, stacked), 'compact' for the app header. */
  variant: PropTypes.oneOf(['full', 'compact']),
  align: PropTypes.oneOf(['left', 'center']),
}

BrandMark.defaultProps = {
  variant: 'compact',
  align: 'left',
}
