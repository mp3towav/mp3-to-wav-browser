export type BitDepth = 16 | 24 | 32;

export interface ConvertOptions {
  /** Output sample rate in Hz, or 'original' to keep the MP3's rate (default). */
  sampleRate?: number | 'original';
  /** 16 or 24-bit integer PCM, or 32-bit float. Default 16. */
  bitDepth?: BitDepth;
  /** Mix all channels down to one. Default false. */
  mono?: boolean;
}

export interface ConvertResult {
  blob: Blob;
  sampleRate: number;
  channels: number;
  /** Duration in seconds. */
  duration: number;
}

/** Convert an MP3 (or any browser-decodable audio) to a WAV Blob, client-side. */
export function mp3ToWav(input: Blob | ArrayBuffer, options?: ConvertOptions): Promise<ConvertResult>;

/** Encode PCM channel data (samples in [-1, 1]) as a complete WAV file. */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  options?: { bitDepth?: BitDepth; mono?: boolean },
): ArrayBuffer;

/** Read the sample rate from the first MPEG audio frame, or null if none is found. */
export function detectMp3SampleRate(buffer: ArrayBuffer): number | null;
