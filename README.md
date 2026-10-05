# mp3-to-wav-browser

Convert MP3 to WAV **entirely in the browser** using the Web Audio API.
No server, no upload, no dependencies, about 2 KB gzipped.

**[Live demo →](https://mp3-to-wav-browser.vercel.app/)**

- Keeps the MP3's **original sample rate** (browsers silently resample to 48 kHz unless you handle it)
- **16-bit or 24-bit** integer PCM, or **32-bit float** WAV output
- Optional **mono** downmix and **resampling** (e.g. 44.1 kHz for CDs, 16 kHz for speech-to-text)
- Works with any format the browser can decode: MP3, AAC/M4A, OGG, FLAC, WAV
- Files never leave the user's device, so it's safe for private recordings

## Install

```sh
npm install mp3-to-wav-browser
```

```js
import { mp3ToWav } from 'mp3-to-wav-browser';
```

Or load it straight from a CDN, no build step needed:

```html
<script type="module">
  import { mp3ToWav } from 'https://cdn.jsdelivr.net/npm/mp3-to-wav-browser/src/index.js';
</script>
```

You can also copy `src/index.js` (and `src/index.d.ts` for TypeScript types) into your project. It's a single ES module with no dependencies.

## Usage

```js
import { mp3ToWav } from './index.js';

const input = document.querySelector('input[type=file]');
input.addEventListener('change', async () => {
  const { blob, sampleRate, channels, duration } = await mp3ToWav(input.files[0], {
    sampleRate: 'original', // or a number: 44100, 48000, 16000…
    bitDepth: 16,           // 16 | 24 | 32 (float)
    mono: false,            // true = mix down to one channel
  });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'converted.wav';
  link.click();
});
```

## API

### `mp3ToWav(input, options?) → Promise<{ blob, sampleRate, channels, duration }>`
Decodes `input` (a `File`, `Blob` or `ArrayBuffer`) and returns a WAV `Blob`.

| Option | Type | Default | Description |
|---|---|---|---|
| `sampleRate` | `number \| 'original'` | `'original'` | Output sample rate in Hz. `'original'` reads it from the MP3 header (falls back to 44100). |
| `bitDepth` | `16 \| 24 \| 32` | `16` | 16/24-bit integer PCM or 32-bit IEEE float. |
| `mono` | `boolean` | `false` | Average all channels into one. |

### `encodeWav(channels, sampleRate, options?) → ArrayBuffer`
Low-level encoder: turns an array of `Float32Array` channels (samples in −1…1) into a complete RIFF/WAVE file. Useful if you already have PCM data, for example from an `AudioBuffer` or a recording.

### `detectMp3SampleRate(buffer) → number | null`
Reads the sample rate from the first valid MPEG audio frame (MPEG-1, 2 and 2.5), skipping any ID3v2 tag.

## How it works

1. **Detect the rate.** `decodeAudioData` resamples audio to its context's sample rate, so the library first reads the MP3 frame header to learn the source rate.
2. **Decode locally.** It creates an `OfflineAudioContext` at the target rate and decodes the file with the browser's built-in decoder.
3. **Write the WAV.** A small encoder writes a 44-byte RIFF header and the interleaved samples: integer PCM (format 1) for 16/24-bit, IEEE float (format 3) for 32-bit.

## Good to know

- **Converting MP3 to WAV doesn't improve quality.** The WAV contains exactly what the MP3 decodes to. It stops further loss during editing and improves compatibility with DAWs, samplers and CD software.
- **WAV files are large:** about 10.6 MB per minute at 44.1 kHz, 16-bit stereo. A standard WAV can't exceed 4 GB; `encodeWav` throws a `RangeError` if it would.
- For very large files or many files at once, run `encodeWav` in a Web Worker to keep the page responsive.

## Browser support

All modern browsers with `OfflineAudioContext`: Chrome, Edge, Firefox and Safari (desktop and mobile).

## Credits

This library powers **[MP3 to WAV Convert](https://mp3towavconvert.com/)**, a free, private online MP3 to WAV converter with batch ZIP downloads, presets for CDs and transcription, and guides in English, Spanish, Portuguese and German.

## License

[MIT](LICENSE)
