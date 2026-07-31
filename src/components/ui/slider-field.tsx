import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { firstSliderValue } from '@/lib/slider-value';

/** A labeled percent slider with min/max end marks — shared across build sections. */
export function SliderField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}: {value}%
      </Label>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(firstSliderValue(v))}
        marks={[
          { value: min, label: `${min}%` },
          { value: max, label: `${max}%` },
        ]}
      />
    </div>
  );
}
