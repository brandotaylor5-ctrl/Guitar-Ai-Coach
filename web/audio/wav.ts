/**
 * WAV encoding, so a saved riff's original audio can be played or downloaded.
 *
 * Uncompressed on purpose: it is a few seconds of audio, the encoder is thirty
 * lines, and it plays everywhere without asking anything of the browser.
 */

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);           // PCM header size
  view.setUint16(20, 1, true);            // format: PCM
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);            // block align
  view.setUint16(34, 16, true);           // bits per sample
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    // Asymmetric scaling: 16-bit signed reaches -32768 but only +32767.
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/** A playable object URL for a clip. Revoke it when you are done with it. */
export function clipUrl(samples: Float32Array, sampleRate: number): string {
  return URL.createObjectURL(encodeWav(samples, sampleRate));
}
