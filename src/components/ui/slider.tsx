import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

export interface SliderMark {
  /** Position in the slider's own min/max coordinate space. */
  value: number
  /** Tick label; omitted = tick only. */
  label?: React.ReactNode
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  marks,
  ...props
}: SliderPrimitive.Root.Props & { marks?: SliderMark[] }) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max]
  )

  return (
    <div className="w-full">
      <SliderPrimitive.Root
        data-slot="slider"
        defaultValue={defaultValue}
        value={value}
        min={min}
        max={max}
        // Radix always behaved edge-ish at min/max; Base UI defaults to
        // centering the thumb on the track's endpoint, which lets it
        // overflow past the track. edge keeps the prior look.
        thumbAlignment="edge"
        className={className}
        {...props}
      >
        <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50">
          <SliderPrimitive.Track
            data-slot="slider-track"
            className="bg-input/50 relative h-0.5 w-full grow overflow-hidden select-none"
          >
            <SliderPrimitive.Indicator
              data-slot="slider-range"
              className="bg-primary absolute h-full select-none"
            />
          </SliderPrimitive.Track>
          {Array.from({ length: _values.length }, (_, index) => (
            <SliderPrimitive.Thumb
              data-slot="slider-thumb"
              key={index}
              className="bg-primary focus-visible:ring-ring/30 hover:ring-ring/30 relative block size-3 shrink-0 border-none transition-colors select-none hover:ring-2 focus-visible:ring-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
            >
              {/* Invisible padded hit-area, not a bigger visible dot — grows the
                  real touch target for mobile without resizing what's drawn.
                  Pointer/touch handling lives on the thumb's own node and just
                  reads clientX/clientY off the event, so a pointerdown that
                  starts on this child bubbles up and behaves identically. */}
              <span className="absolute -inset-2" />
            </SliderPrimitive.Thumb>
          ))}
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
      {/* Normal document flow, not absolutely positioned over the slider —
          its own height always pushes whatever comes next down for real, so
          it can't silently overlap a sibling (in this file or a caller's) the
          way an absolutely-positioned overlay with a guessed clearance can. */}
      {marks && max > min && (
        // mx-2 (not px-2): percentages on the absolutely-positioned mark
        // children resolve against this row's padding box, which already
        // spans edge-to-edge — padding doesn't narrow that reference frame,
        // only a real inset (margin, here) does. Without it the 0%/100%
        // marks sit flush with the true edge and half their label bleeds
        // past it into the Card's overflow-hidden.
        <div data-slot="slider-marks" className="pointer-events-none relative mt-1.5 h-5 mx-2">
          {marks.map(m => (
            <div
              key={m.value}
              className="absolute flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${((m.value - min) / (max - min)) * 100}%` }}
            >
              <span className="bg-border block h-1 w-px" />
              {m.label !== undefined && (
                <span className="text-muted-foreground text-[9px] leading-tight tabular-nums">{m.label}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { Slider }
