import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

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
    <div className={cn("relative w-full", marks && marks.some(m => m.label !== undefined) && "pb-4")}>
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
              className="bg-primary focus-visible:ring-ring/30 hover:ring-ring/30 block size-3 shrink-0 border-none transition-colors select-none hover:ring-2 focus-visible:ring-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
            />
          ))}
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
      {marks && max > min && (
        // top-4 = directly under the 16px slider row (top-full would land past the wrapper's label padding).
        <div data-slot="slider-marks" className="pointer-events-none absolute inset-x-2 top-4">
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
