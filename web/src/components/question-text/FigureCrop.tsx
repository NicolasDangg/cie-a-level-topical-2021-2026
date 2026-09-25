import type { ExtractedFigure } from '../../content/types'

// A figure is a box on an existing crop, shown by clipping that image: no
// separate figure files. The box is in fractions of the source image.
export function FigureCrop({ figure }: { figure: ExtractedFigure }) {
  const [x0, y0, x1, y1] = figure.box
  const [width, height] = figure.source_size
  const w = x1 - x0
  const h = y1 - y0
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5 py-1">
      <div
        className="relative w-full overflow-hidden bg-sheet"
        style={{ maxWidth: `${Math.round(w * width)}px`, aspectRatio: `${w * width} / ${h * height}` }}
      >
        <img
          src={figure.source_image}
          alt={figure.alt}
          loading="lazy"
          decoding="async"
          className="crop-img absolute max-w-none"
          style={{ width: `${100 / w}%`, height: `${100 / h}%`, left: `${(-x0 / w) * 100}%`, top: `${(-y0 / h) * 100}%` }}
        />
      </div>
      {figure.caption && <figcaption className="font-sans text-sm font-semibold">{figure.caption}</figcaption>}
    </figure>
  )
}
