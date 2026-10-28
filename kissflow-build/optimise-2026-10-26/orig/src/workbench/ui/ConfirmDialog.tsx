// A confirmation dialog, optionally with a required reason (cancel case, discard draft, …).
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { Field, TextArea } from "@/components/ui/form";
import { Modal } from "./overlay";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  danger,
  reason,
  minReason = 1,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Label of a required reason field; omit for a plain confirmation. */
  reason?: string;
  minReason?: number;
  onConfirm(reason: string): void | Promise<void>;
  onClose(): void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = !reason || text.trim().length >= minReason;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={!ok || busy}
            data-testid="wb-confirm"
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(text.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13.5px] text-ink-2">
        {children}
        {reason && (
          <Field label={reason} required>
            <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={3} data-testid="wb-confirm-reason" />
          </Field>
        )}
      </div>
    </Modal>
  );
}
