import { useEffect, useRef } from 'react'

interface Props {
  src: string | null | undefined
  /** Blur radius in CSS pixels. Zero once the answer is out. */
  blur: number
  /** True until the answer is out, when colour comes back. */
  obscured: boolean
  label: string
  className?: string
}

/** Slight overscale so a heavy blur doesn't drag empty edges into frame. */
const OVERSCALE = 1.14

/**
 * Draws the art into a canvas with the blur already baked in, rather than shipping an
 * <img> and blurring it with CSS.
 *
 * With an <img>, the un-obscured picture is sitting in the DOM: "open image in new tab",
 * "save image as", or deleting one CSS property in devtools all hand over the answer. A
 * canvas has no src to open and no underlying element to unstyle — the only pixels it
 * ever receives are blurred ones.
 *
 * This raises the bar rather than sealing it: the source file is still fetched, so it
 * can be found in the network panel. Closing that would mean shipping pre-blurred assets
 * and only serving the full-resolution art after a solve.
 */
export function ObscuredArt({ src, blur, obscured, label, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !src) return

    let cancelled = false
    const image = new Image()

    image.onload = () => {
      if (cancelled) return
      const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect()
      if (!cssWidth || !cssHeight) return

      // Cap the pixel ratio: at 3x a heavy blur over a large canvas gets expensive.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.filter = `blur(${blur * dpr}px) grayscale(${obscured ? 1 : 0})`

      // Cover-fit, matching object-fit: cover, then overscale for the blur bleed.
      const scale =
        Math.max(canvas.width / image.width, canvas.height / image.height) * OVERSCALE
      const w = image.width * scale
      const h = image.height * scale
      ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
    }

    image.src = src
    return () => {
      cancelled = true
    }
  }, [src, blur, obscured])

  return <canvas ref={canvasRef} className={className} role="img" aria-label={label} />
}
