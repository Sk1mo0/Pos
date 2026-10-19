'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

export function ErrorAlert({ message }: { message: string }) {
  return message ? <Alert variant="destructive" className="my-3"><AlertDescription>{message}</AlertDescription></Alert> : null;
}

export function DeleteConfirmation({ open, onOpenChange, description, busy, error, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  busy: boolean;
  error: string;
  onConfirm: () => Promise<void>;
}) {
  return <AlertDialog open={open} onOpenChange={open => { if (!busy) onOpenChange(open); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <ErrorAlert message={error} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={busy} onClick={onConfirm}>Confirmar eliminación</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
