// Client-side photo shrinking. Phones produce 4-12 MB JPEGs; the map only
// ever shows them at a few hundred pixels, and Storage costs by the byte.

import { QUALITY } from './config.js';

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

/** Resize to QUALITY.photoMaxEdgePx on the longest edge and return a JPEG Blob. */
export async function shrink(file) {
  const src = await decode(file);
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const scale = Math.min(1, QUALITY.photoMaxEdgePx / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  canvas.getContext('2d').drawImage(src, 0, 0, cw, ch);
  if (src.close) src.close();

  let q = QUALITY.photoQuality;
  let blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
  // Rarely a busy photo is still too big; step the quality down.
  while (blob && blob.size > QUALITY.photoMaxBytes && q > 0.4) {
    q -= 0.1;
    blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
  }
  if (!blob) throw new Error('Could not encode the photo');
  return blob;
}
