import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

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
}: React.ComponentProps<typeof SliderPrimitive.Root> & { marks?: SliderMark[] }) {
  const _values = React.useMemo(
    () => value ?? defaultValue ?? [min, max],
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
        className={cn(
          "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="bg-muted relative h-1.5 w-full grow overflow-hidden rounded-full"
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className="bg-primary absolute h-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="border-primary bg-background focus-visible:ring-ring/50 block size-4 rounded-full border shadow-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden disabled:pointer-events-none"
          />
        ))}
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
