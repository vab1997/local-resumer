// Scroll-reveal wiring (ticket 03). CSS-first: the fade + translate + stagger live in
// global.css on [data-reveal]; this only toggles .is-visible when a group enters the
// viewport, via Motion's inView (~0.5 kB). No React, no islands — imported from a
// vanilla <script> that Vite bundles. prefers-reduced-motion is handled in CSS.
import { inView } from 'motion'

/** Reveal every [data-reveal] inside the groups; idempotent, so a re-enter is a no-op. */
export function initReveals(): void {
  const groups = document.querySelectorAll<HTMLElement>('[data-reveal-group]')

  // Fallback: with no IntersectionObserver, show everything rather than hide it.
  if (!('IntersectionObserver' in window) || groups.length === 0) {
    document
      .querySelectorAll<HTMLElement>('[data-reveal]')
      .forEach((el) => el.classList.add('is-visible'))
    return
  }

  groups.forEach((group) => {
    inView(
      group,
      () => {
        group
          .querySelectorAll<HTMLElement>('[data-reveal]')
          .forEach((el) => el.classList.add('is-visible'))
      },
      { amount: 0.15 }
    )
  })
}
