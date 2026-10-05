// Tests for the parts that don't need a browser: the WAV encoder and MP3 header parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeWav, detectMp3SampleRate } from '../src/index.js';

const header = (buf) => {
  const v = new DataView(buf);
  const tag = (o) => String.fromCharCode(...new Uint8Array(buf, o, 4));
  return {
    riff: tag(0), wave: tag(8), fmt: v.getUint16(20, true), channels: v.getUint16(22, true),
    rate: v.getUint32(24, true), byteRate: v.getUint32(28, true), bits: v.getUint16(34, true),
    dataBytes: v.getUint32(40, true), riffSize: v.getUint32(4, true),
  };
};

test('16-bit stereo header and size are correct', () => {
  const left = new Float32Array(44100).fill(0.5);
  const right = new Float32Array(44100).fill(-0.5);
  const buf = encodeWav([left, right], 44100);
  const h = header(buf);
  assert.equal(h.riff, 'RIFF');
  assert.equal(h.wave, 'WAVE');
  assert.equal(h.fmt, 1);
  assert.equal(h.channels, 2);
  assert.equal(h.rate, 44100);
  assert.equal(h.byteRate, 44100 * 4);
  assert.equal(h.bits, 16);
  assert.equal(h.dataBytes, 44100 * 4);
  assert.equal(h.riffSize, buf.byteLength - 8);
});

test('samples are written, interleaved and clamped', () => {
  const buf = encodeWav([new Float32Array([1, 2]), new Float32Array([-1, -0.5])], 8000);
  const v = new DataView(buf, 44);
  assert.equal(v.getInt16(0, true), 32767);   // L0 = 1
  assert.equal(v.getInt16(2, true), -32768);  // R0 = -1
  assert.equal(v.getInt16(4, true), 32767);   // L1 = 2, clamped to 1
  assert.equal(v.getInt16(6, true), -16384);  // R1 = -0.5
});

test('24-bit and 32-bit float formats', () => {
  const ch = [new Float32Array([0.25])];
  const h24 = header(encodeWav(ch, 48000, { bitDepth: 24 }));
  assert.deepEqual([h24.fmt, h24.bits, h24.dataBytes], [1, 24, 3]);
  const buf32 = encodeWav(ch, 48000, { bitDepth: 32 });
  const h32 = header(buf32);
  assert.deepEqual([h32.fmt, h32.bits, h32.dataBytes], [3, 32, 4]);
  assert.equal(new DataView(buf32, 44).getFloat32(0, true), 0.25);
});

test('mono downmix averages channels', () => {
  const buf = encodeWav([new Float32Array([1]), new Float32Array([0])], 16000, { mono: true, bitDepth: 32 });
  assert.equal(header(buf).channels, 1);
  assert.equal(new DataView(buf, 44).getFloat32(0, true), 0.5);
});

test('rejects invalid bit depth', () => {
  assert.throws(() => encodeWav([new Float32Array(1)], 44100, { bitDepth: 8 }), RangeError);
});

test('detects MP3 sample rates (MPEG-1, MPEG-2) and ignores non-MP3 data', () => {
  const read = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url)).buffer;
  assert.equal(detectMp3SampleRate(read('stereo-44k.mp3')), 44100);
  assert.equal(detectMp3SampleRate(read('mono-48k.mp3')), 48000);
  assert.equal(detectMp3SampleRate(read('low-22k.mp3')), 22050);
  assert.equal(detectMp3SampleRate(new TextEncoder().encode('not audio at all').buffer), null);
});
