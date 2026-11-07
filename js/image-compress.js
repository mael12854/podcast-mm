// Compression des dessins dans le navigateur, avant l'envoi :
// 2000 px max sur le grand côté, JPG qualité 85 (guidelines « Le scan »), fond blanc pour les PNG transparents.
// On redescend la qualité si le fichier reste trop lourd pour l'envoi.

const MAX_SIDE = 2000;
const TARGET_BYTES = 2.8 * 1024 * 1024;

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* repli ci-dessous */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas, q) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compression'))), 'image/jpeg', q));
}

export async function compressImage(file) {
  const src = await decode(file);
  const w0 = src.width || src.naturalWidth;
  const h0 = src.height || src.naturalHeight;
  let side = MAX_SIDE;
  for (const q of [0.85, 0.78, 0.7, 0.62]) {
    const scale = Math.min(1, side / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    const blob = await toBlob(canvas, q);
    if (blob.size <= TARGET_BYTES || q === 0.62) {
      if (src.close) src.close();
      return { blob, width: w, height: h };
    }
    if (q === 0.7) side = 1600;
  }
  throw new Error('compression');
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
