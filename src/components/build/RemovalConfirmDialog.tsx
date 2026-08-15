import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * The "switching this will remove some currently-equipped items" confirm
 * shell — shared by RaceControl (SpecialLoadoutSection) and ArmorTypeControl
 * (ArmorSection), which each independently hand-rolled the same Dialog +
 * bulleted removal list + Cancel/Switch & remove footer. Each caller keeps
 * its own `pending` state and dispatch (they differ: different action types,
 * different field names, different removal-list computation), so this only
 * extracts the presentational shell, not the state — same shape as
 * `OptionBadge`'s extraction, not a forced merge of dissimilar logic.
 */
export function RemovalConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Display names of the items that will be removed. */
  items: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ul className="text-negative list-inside list-disc text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Switch &amp; remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
