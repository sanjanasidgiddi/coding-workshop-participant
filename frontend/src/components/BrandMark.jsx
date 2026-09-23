import PropTypes from 'prop-types'
import './BrandMark.css'

/**
 * ACME Inc. brand mark. No logo asset exists anywhere in this repo, so this
 * is a simple text-based mark (a monogram tile + wordmark) built with
 * plain CSS rather than an imported image.
 */
export default function BrandMark({ variant = 'compact', align = 'left' }) {
  const rootClassName = `brand-mark brand-mark--${variant}${align === 'center' ? ' brand-mark--center' : ''}`

  return (
    <div className={rootClassName}>
      <div className={`brand-mark__icon brand-mark__icon--${variant}`}>A</div>
      <div className="brand-mark__text">
        <p className={`brand-mark__title brand-mark__title--${variant}`}>ACME Inc.</p>
        <p className={`brand-mark__subtitle brand-mark__subtitle--${variant}`}>Facilities Incident Management</p>
      </div>
    </div>
  )
}

BrandMark.propTypes = {
  /** 'full' for auth pages (larger, stacked), 'compact' for the app header. */
  variant: PropTypes.oneOf(['full', 'compact']),
  align: PropTypes.oneOf(['left', 'center']),
}
