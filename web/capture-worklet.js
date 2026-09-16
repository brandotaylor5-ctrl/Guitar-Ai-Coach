/**
 * Runs on the audio thread. Does as little as possible.
 *
 * The audio thread must never miss a deadline, so this only copies samples into
 * a buffer and posts it out when full. Aggregating into larger chunks than the
 * 128-frame render quantum keeps the message rate down to roughly twenty a
 * second instead of four hundred.
 */

const CHUNK_SIZE = 2048;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CHUNK_SIZE);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i];
      if (this.filled === CHUNK_SIZE) {
        // Hand the buffer over and take a fresh one, so nothing is shared
        // across the thread boundary while it is still being written.
        const full = this.buffer;
        this.buffer = new Float32Array(CHUNK_SIZE);
        this.filled = 0;
        this.port.postMessage(full, [full.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('capture', CaptureProcessor);
