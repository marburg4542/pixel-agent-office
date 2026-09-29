// Shrink images in the browser before uploading — ported from WMS src/utils/image.js.
// Profile pictures are shown tiny, so there's no reason to store a 4 MB camera photo.

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable image'));
    };
    img.src = url;
  });

/** Center-crop to a square and scale down; returns the original file if that doesn't help. */
export async function shrinkAvatar(file: File, edge = 256): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const img = await loadImage(file);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(edge, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob || (blob.size >= file.size && img.naturalWidth === img.naturalHeight)) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png', lastModified: Date.now() });
  } catch {
    return file;
  }
}
