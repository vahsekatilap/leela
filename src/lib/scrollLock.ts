// Stops the page scrolling behind open sheets and full screens. Counted, so sheets and screens
// that open and close in any order (a sheet opening a screen, a screen closing a sheet) always
// leave the page scrollable once the last one closes.
let open = 0

export function lockScroll(): () => void {
  open++
  document.body.style.overflow = 'hidden'
  let done = false
  return () => {
    if (done) return
    done = true
    open = Math.max(0, open - 1)
    if (open === 0) document.body.style.overflow = ''
  }
}

// Safety net: if nothing is open, the page must scroll (e.g. after the app was in the background).
if (typeof document !== 'undefined') {
  const check = () => {
    if (open === 0 && document.body.style.overflow === 'hidden') document.body.style.overflow = ''
  }
  document.addEventListener('visibilitychange', check)
  window.addEventListener('pageshow', check)
}
