import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * A clamped numeric Input that stays freely typeable while focused.
 *
 * A plain `<Input type="number" value={n} onChange={... Math.max(min, ...)}>`
 * clamps on every keystroke against a controlled value with no local buffer,
 * so an emptied/partial field is rewritten before you can retype it (e.g.
 * clearing to type "37" snaps back to `min` first). Here `onChange` only
 * updates a local string buffer — no clamping while the field has focus —
 * and the buffer is parsed/clamped/committed once on blur or Enter.
 *
 * `label` is optional: pass it for a self-contained `<Label>` + input pair
 * (matches this project's other labeled fields); omit it to place the bare
 * input under a `<Label>` you render yourself.
 */
export function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  className,
}: {
  id?: string;
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  const [text, setText] = React.useState(String(value));

  // Resync the buffer when `value` changes from outside (e.g. a reset, or
  // another control writing the same field) rather than mid-edit. Adjusting
  // state during render (not in an effect) per React's documented pattern
  // for deriving state from a changed prop — avoids an extra render pass.
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  const commit = () => {
    const n = Math.max(min, Math.min(max, parseInt(text, 10) || min));
    onChange(n);
    setText(String(n));
  };

  const input = (
    <Input
      id={id}
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      className={className}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        commit();
        e.currentTarget.blur();
      }}
    />
  );

  if (!label) return input;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {input}
    </div>
  );
}
