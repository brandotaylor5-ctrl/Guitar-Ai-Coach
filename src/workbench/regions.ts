import type { AudioRegion, PcmAudio } from './types.ts';

export function validatePcm(audio: PcmAudio): void {
  if (!Number.isSafeInteger(audio.sampleRate) || audio.sampleRate <= 0 || audio.sampleRate > 384000) throw new Error('Invalid sample rate');
  if (audio.channels.length < 1 || audio.channels.length > 2) throw new Error('Use mono or stereo audio');
  const length = audio.channels[0]!.length;
  if (!length) throw new Error('Audio is empty');
  for (const channel of audio.channels) {
    if (!(channel instanceof Float32Array) || channel.length !== length) throw new Error('Audio channels must have equal lengths');
    for (const value of channel) if (!Number.isFinite(value)) throw new Error('Audio contains invalid samples');
  }
}

export function validateRegion(region: AudioRegion, sampleCount: number): void {
  if (!region.assetId || !Number.isSafeInteger(sampleCount) || !Number.isSafeInteger(region.startSample) || !Number.isSafeInteger(region.endSample)
    || region.startSample < 0 || region.startSample >= region.endSample || region.endSample > sampleCount) throw new Error('Choose a non-empty range inside the recording');
}

export function slicePcm(audio: PcmAudio, region: AudioRegion): PcmAudio {
  validatePcm(audio); validateRegion(region, audio.channels[0]!.length);
  return {sampleRate:audio.sampleRate,channels:audio.channels.map(c => c.slice(region.startSample, region.endSample))};
}

export function waveformPeaks(audio: PcmAudio, buckets: number): Array<{min:number;max:number}> {
  if (!Number.isSafeInteger(buckets) || buckets <= 0) throw new Error('Invalid waveform resolution');
  const length = audio.channels[0]?.length ?? 0;
  const count = Math.min(buckets, length);
  return Array.from({length:count}, (_, b) => {
    let min = 1, max = -1;
    const start = Math.floor(b * length / count), end = Math.floor((b + 1) * length / count);
    for (const channel of audio.channels) for (let i = start; i < end; i++) { min = Math.min(min,channel[i]!); max = Math.max(max,channel[i]!); }
    return {min,max};
  });
}
