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
    this.stopped = false;
    this.port.onmessage = (event) => {
      if (event.data?.type !== 'flush') return;
      this.stopped = true;
      if (this.filled) {
        const tail = this.buffer.slice(0, this.filled);
        this.filled = 0;
        this.port.postMessage(tail, [tail.buffer]);
      }
      this.port.postMessage({ type: 'flushed', id: event.data.id });
    };
  }

  process(inputs) {
    if (this.stopped) return true;
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
