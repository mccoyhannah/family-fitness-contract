export function scrollListStartIntoScreenView(list: HTMLElement | null) {
  if (!list) return
  const screen = list.closest<HTMLElement>('.screen')
  const target = list.querySelector<HTMLElement>('.penalty-card') ?? list
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth'

  if (!screen) {
    target.scrollIntoView({ behavior, block: 'start' })
    return
  }

  const screenTop = screen.getBoundingClientRect().top
  const targetTop = target.getBoundingClientRect().top
  const nextTop = Math.max(0, screen.scrollTop + targetTop - screenTop - 12)
  screen.scrollTo({ behavior, top: nextTop })
}
