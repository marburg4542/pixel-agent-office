import { toast } from './toast';

/** Save text as a file in the browser's downloads. */
export function downloadText(filename: string, text: string, type = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string, done: string, failed: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error(failed);
  }
}

/** A file-name-safe version of a title (keeps Thai). */
export const slug = (s: string) =>
  s
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'result';
