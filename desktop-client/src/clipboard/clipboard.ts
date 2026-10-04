import clipboardy from 'clipboardy';
export type CopyText = (text: string) => Promise<void>;
export const copyText: CopyText = async (text) => {
  await clipboardy.write(text);
  if (await clipboardy.read() !== text) throw new Error('Clipboard verification failed: written text does not match.');
};
