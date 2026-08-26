export const BACKUP_GUIDANCE =
  "Your jobs are stored on this computer, not in the cloud. Back up your workbook regularly so you can restore it if this computer is lost or replaced.";

export const RESTORE_WORKBOOK_CONFIRM =
  "Restore this backup? Your current business setup and jobs will be replaced with the backup. Cancel keeps your current workbook unchanged.";

export function confirmWorkbookRestore(ask = (message) => globalThis.confirm(message)) {
  return ask(RESTORE_WORKBOOK_CONFIRM) === true;
}
