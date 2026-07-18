// Hero demo choreography (ticket 04). Drives the recreated side panel through the
// summarize sequence in a loop: press → progress → word-stream title/TL;DR → points →
// metrics → hold → fade → reset. Motion's `animate` (mini/WAAPI build) handles the bar
// and panel fades; point/metric stagger rides CSS transitions toggled here; a tiny typing
// driver streams the text; a pause flag (hover) freezes the timeline between beats.
// Timings from docs/efforts/web-redesign/tickets/05-prototype-hero-demo.md. Under
// prefers-reduced-motion the server-rendered finished state is left untouched.
// motion/mini keeps the animation JS well under the ~20 kB budget vs the hybrid build.
import { inView } from 'motion'
import { animate } from 'motion/mini'

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

export function initHeroDemo(stage: HTMLElement): void {
  if (reduced) return

  const q = <T extends HTMLElement>(sel: string) =>
    stage.querySelector<T>(sel) as T
  const qa = <T extends HTMLElement>(sel: string) => [
    ...stage.querySelectorAll<T>(sel)
  ]

  const panel = q('[data-panel]')
  const run = q<HTMLButtonElement>('[data-run]')
  const status = q('[data-status]')
  const statusText = q('[data-status-text]')
  const bar = q('[data-bar]')
  const out = q('[data-out]')
  const titleEl = q('[data-title]')
  const tldrEl = q('[data-tldr]')
  const points = qa('[data-point]')
  const metrics = qa('[data-metric]')

  const TITLE = titleEl.textContent ?? ''
  const TLDR = tldrEl.textContent ?? ''
  const READING = status.dataset.reading ?? ''
  const SUMMARIZING = status.dataset.summarizing ?? ''

  // Freeze the timeline while the pointer is over the stage (lets people read) OR while
  // the stage is scrolled out of view (no work off-screen).
  let hovering = false
  let offscreen = false
  let paused = false
  const syncPaused = () => (paused = hovering || offscreen)
  stage.addEventListener('mouseenter', () => {
    hovering = true
    syncPaused()
  })
  stage.addEventListener('mouseleave', () => {
    hovering = false
    syncPaused()
  })

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const TICK = 50
  // Elapsed-time wait that stalls while paused, so hover freezes between beats.
  async function wait(ms: number) {
    let elapsed = 0
    while (elapsed < ms || paused) {
      await sleep(TICK)
      if (!paused) elapsed += TICK
    }
  }

  // Split text into word spans (opacity 0) for the streaming reveal.
  function seed(el: HTMLElement, text: string): HTMLElement[] {
    el.textContent = ''
    const frag = document.createDocumentFragment()
    for (const word of text.split(' ')) {
      const span = document.createElement('span')
      span.className = 'hd-w'
      span.textContent = word + ' '
      frag.appendChild(span)
    }
    el.appendChild(frag)
    return [...el.children] as HTMLElement[]
  }

  async function stream(spans: HTMLElement[], perWord: number) {
    const caret = document.createElement('span')
    caret.className = 'hd-caret'
    for (const span of spans) {
      span.classList.add('is-on')
      span.after(caret) // caret trails the word just revealed
      await wait(perWord)
    }
    caret.remove()
  }

  function reset() {
    run.classList.remove('is-pressed')
    run.style.display = ''
    status.classList.remove('is-on')
    bar.style.transform = 'scaleX(0)'
    seed(titleEl, TITLE)
    seed(tldrEl, TLDR)
    points.forEach((p) => p.classList.remove('is-on'))
    metrics.forEach((m) => m.classList.remove('is-on'))
    out.style.opacity = '0'
  }

  // First run waits for the visitor to click Summarize; if 5s pass with no click, it
  // starts on its own. Later loops auto-press after a short beat.
  let firstRun = true
  function armStart(): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const go = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        run.removeEventListener('click', go)
        resolve()
      }
      const timer = setTimeout(go, 5000)
      run.addEventListener('click', go)
    })
  }

  async function runOnce() {
    reset()
    if (firstRun) {
      firstRun = false
      await armStart()
    } else {
      await wait(900)
    }

    run.classList.add('is-pressed')
    await wait(180)
    run.style.display = 'none'

    status.classList.add('is-on')
    statusText.textContent = READING
    await animate(bar, { transform: 'scaleX(0.28)' }, { duration: 0.4 })
      .finished
    await wait(850)

    statusText.textContent = SUMMARIZING
    await animate(bar, { transform: 'scaleX(0.72)' }, { duration: 0.4 })
      .finished
    await wait(400)
    await animate(bar, { transform: 'scaleX(1)' }, { duration: 0.4 }).finished
    await wait(300)

    status.classList.remove('is-on')
    out.style.opacity = '1'

    await stream(seed(titleEl, TITLE), 70)
    await wait(150)
    await stream(seed(tldrEl, TLDR), 55)
    await wait(100)

    for (const p of points) {
      p.classList.add('is-on')
      await wait(80)
    }
    await wait(60)
    for (const m of metrics) {
      m.classList.add('is-on')
      await wait(90)
    }

    await wait(3200)
    await animate(panel, { opacity: 0 }, { duration: 0.26 }).finished
    reset()
    await animate(panel, { opacity: [0, 1] }, { duration: 0.32 }).finished
  }

  // Start the loop on first view; pause it whenever the stage scrolls out and resume on
  // return (the leave callback returned from the enter handler).
  let started = false
  inView(
    stage,
    () => {
      offscreen = false
      syncPaused()
      if (!started) {
        started = true
        void (async () => {
          for (;;) await runOnce()
        })()
      }
      return () => {
        offscreen = true
        syncPaused()
      }
    },
    { amount: 0.4 }
  )
}
