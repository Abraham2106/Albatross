import { InferenceError } from './ports/inference-engine';
import { QUOTAS } from './ports/capture-protocol';

export interface ImageBounds {
  readonly width: number;
  readonly height: number;
  readonly pixels: number;
  readonly format: 'jpeg' | 'png';
}

function be32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return undefined;
    const marker = bytes[i + 1]!;
    i += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (i + 2 > bytes.length) return undefined;
    const length = (bytes[i]! << 8) | bytes[i + 1]!;
    if (length < 2) return undefined;
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof && i + 7 < bytes.length) {
      return { height: (bytes[i + 3]! << 8) | bytes[i + 4]!, width: (bytes[i + 5]! << 8) | bytes[i + 6]! };
    }
    i += length;
  }
  return undefined;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (sig.some((b, i) => bytes[i] !== b)) return undefined;
  if (bytes.length < 24) return undefined;
  return { width: be32(bytes, 16), height: be32(bytes, 20) };
}

export function inspectImage(bytes: Uint8Array, mimeType: string): ImageBounds {
  if (bytes.byteLength > QUOTAS.maxImageBytes) throw new InferenceError('INVALID_INPUT', 'La foto supera 10 MB.');
  const format = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpeg' : undefined;
  if (!format) throw new InferenceError('INVALID_INPUT', 'Formato de imagen no soportado.');
  const size = format === 'png' ? pngSize(bytes) : jpegSize(bytes);
  if (!size || size.width < 1 || size.height < 1) throw new InferenceError('INVALID_INPUT', 'Imagen malformada.');
  const pixels = size.width * size.height;
  if (pixels > QUOTAS.maxImagePixels) throw new InferenceError('INVALID_INPUT', 'La foto supera 20 megapíxeles.');
  return { ...size, pixels, format };
}
