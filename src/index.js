/**
 * mp3-to-wav-browser
 * Convert MP3 (or any audio the browser can decode) to WAV entirely client-side.
 * No server, no upload, no dependencies.
 *
 * Powers https://mp3towavconvert.com
 * MIT License
 */

const MPEG_SAMPLE_RATES = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};
const HEADER_BYTES = 44;
const MAX_WAV_BYTES = 0xffffffff;
const SCAN_LIMIT_BYTES = 256 * 1024;

/**
 * Read the sample rate from the first valid MPEG audio frame header.
 * Browsers' decodeAudioData() resamples to the AudioContext's rate (often 48 kHz),
 * so knowing the source rate lets us keep the original quality.
 * @param {ArrayBuffer} buffer MP3 file contents
 * @returns {number | null} sample rate in Hz, or null if no MPEG frame was found
 */
export function detectMp3SampleRate(buffer) {
  const bytes = new Uint8Array(buffer);
  let start = 0;
  // Skip an ID3v2 tag ("ID3" + version + flags + 4-byte syncsafe size).
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    start = 10 + size + ((bytes[5] & 0x10) !== 0 ? 10 : 0);
  }
  const end = Math.min(bytes.length - 4, start + SCAN_LIMIT_BYTES);
  for (let i = start; i < end; i++) {
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (bytes[i + 1] >> 3) & 0x03;
    const layer = (bytes[i + 1] >> 1) & 0x03;
    const bitrateIndex = bytes[i + 2] >> 4;
    const rateIndex = (bytes[i + 2] >> 2) & 0x03;
    const valid = version !== 1 && layer !== 0 && bitrateIndex !== 0 && bitrateIndex !== 0x0f && rateIndex !== 3;
    if (valid) return MPEG_SAMPLE_RATES[version][rateIndex];
  }
  return null;
}

/**
 * Encode PCM channel data as a WAV file (RIFF/WAVE, little-endian).
 * 16/24-bit are integer PCM (format 1); 32-bit is IEEE float (format 3).
 * @param {Float32Array[]} channels one Float32Array per channel, samples in [-1, 1]
 * @param {number} sampleRate sample rate in Hz
 * @param {{ bitDepth?: 16 | 24 | 32, mono?: boolean }} [options]
 * @returns {ArrayBuffer} complete WAV file
 */
export function encodeWav(channels, sampleRate, { bitDepth = 16, mono = false } = {}) {
  if (![16, 24, 32].includes(bitDepth)) throw new RangeError('bitDepth must be 16, 24 or 32');
  if (!channels.length) throw new RangeError('at least one channel is required');

  const sources = mono && channels.length > 1 ? [downmix(channels)] : channels;
  const channelCount = sources.length;
  const frames = sources[0].length;
  const bytesPerSample = bitDepth / 8;
  const dataBytes = frames * channelCount * bytesPerSample;
  if (HEADER_BYTES + dataBytes > MAX_WAV_BYTES) throw new RangeError('WAV would exceed the 4 GB format limit');

  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const blockAlign = channelCount * bytesPerSample;
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = HEADER_BYTES;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channelCount; c++) {
      const s = Math.max(-1, Math.min(1, sources[c][i]));
      if (bitDepth === 16) {
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      } else if (bitDepth === 24) {
        const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        view.setUint8(offset, v & 0xff);
        view.setUint8(offset + 1, (v >> 8) & 0xff);
        view.setUint8(offset + 2, (v >> 16) & 0xff);
      } else {
        view.setFloat32(offset, s, true);
      }
      offset += bytesPerSample;
    }
  }
  return buffer;
}

/**
 * Convert an MP3 (File, Blob or ArrayBuffer) to a WAV Blob in the browser.
 * Any format the browser can decode (MP3, AAC/M4A, OGG, FLAC, WAV) works as input.
 * @param {Blob | ArrayBuffer} input
 * @param {{ sampleRate?: number | 'original', bitDepth?: 16 | 24 | 32, mono?: boolean }} [options]
 * @returns {Promise<{ blob: Blob, sampleRate: number, channels: number, duration: number }>}
 */
export async function mp3ToWav(input, { sampleRate = 'original', bitDepth = 16, mono = false } = {}) {
  if (typeof OfflineAudioContext === 'undefined') throw new Error('This environment has no Web Audio API (OfflineAudioContext).');
  const source = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const rate = sampleRate === 'original' ? detectMp3SampleRate(source) ?? 44100 : sampleRate;

  // decodeAudioData resamples to the context's rate, so create the context at the target rate.
  const context = new OfflineAudioContext(1, 1, rate);
  const audio = await context.decodeAudioData(source.slice(0));
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  const wav = encodeWav(channels, rate, { bitDepth, mono });

  return {
    blob: new Blob([wav], { type: 'audio/wav' }),
    sampleRate: rate,
    channels: mono ? 1 : audio.numberOfChannels,
    duration: audio.duration,
  };
}

function downmix(channels) {
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i];
  const scale = 1 / channels.length;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
