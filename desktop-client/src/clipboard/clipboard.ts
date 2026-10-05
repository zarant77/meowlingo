import clipboardy from 'clipboardy';
export type CopyText = (text: string) => Promise<void>;
export const copyText: CopyText = async (text) => {
  await clipboardy.write(text);
  if (await clipboardy.read() !== text) throw new Error('Clipboard verification failed: written text does not match.');
};

export function createVerifiedClipboardCopy(
  clipboard: { writeText(text: string): void; readText(): string },
  nativeCopy: CopyText = copyText,
  wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
): CopyText {
  return async text => {
    try {
      clipboard.writeText(text);
      for (const delay of [25, 50, 100, 200]) {
        await wait(delay);
        if (clipboard.readText() === text) return;
      }
    } catch {
      // Fall back to the native writer; do not log clipboard contents.
    }
    console.warn('Electron clipboard verification failed; using the native clipboard writer.');
    await nativeCopy(text);
  };
}
