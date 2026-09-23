const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Basic email shape check (e.g. rejects "bob"), separate from the backend's @acme.inc domain check. */
export function isValidEmail(value) {
  return EMAIL_FORMAT_RE.test(value)
}
