/** Hall bathroom example access. Open never overwrites; restore does, after confirm. */

export const RESTORE_EXAMPLE_CONFIRM =
  "Replace the example Hall bathroom job with the original sample? Existing changes to the example will be replaced. This cannot be undone.";

export function confirmExampleRestore(ask = (message) => globalThis.confirm(message)) {
  return ask(RESTORE_EXAMPLE_CONFIRM) === true;
}
