import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown, X } from 'lucide-react';
import type { ReactNode } from 'react';

// Project-owned components, built on accessible Radix primitives and styled for Qingye.
export function Dialog({ open, onOpenChange, title, description, children, className = '' }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; className?: string }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay" />
      <DialogPrimitive.Content className={`dialog ${className}`}>
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
        <DialogPrimitive.Close className="icon-button dialog-close" aria-label="关闭预览"><X size={20} /></DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
export function Toggle({ checked, onCheckedChange, label, disabled = false }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <SwitchPrimitive.Root className="switch" checked={checked} onCheckedChange={onCheckedChange} aria-label={label} disabled={disabled}><SwitchPrimitive.Thumb className="switch-thumb" /></SwitchPrimitive.Root>;
}
export function Select({ value, onValueChange, label, options, disabled = false }: { value: string; onValueChange: (v: string) => void; label: string; options: { value: string; label: string }[]; disabled?: boolean }) {
  return <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
    <SelectPrimitive.Trigger className="select-trigger" aria-label={label}><SelectPrimitive.Value /><SelectPrimitive.Icon><ChevronDown size={15} /></SelectPrimitive.Icon></SelectPrimitive.Trigger>
    <SelectPrimitive.Portal><SelectPrimitive.Content className="select-content" position="popper" sideOffset={6}><SelectPrimitive.Viewport>
      {options.map(o => <SelectPrimitive.Item value={o.value} key={o.value} className="select-item"><SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText><SelectPrimitive.ItemIndicator><Check size={15} /></SelectPrimitive.ItemIndicator></SelectPrimitive.Item>)}
    </SelectPrimitive.Viewport></SelectPrimitive.Content></SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}
