import { Worklet } from 'react-native-bare-kit';

// A bounded IPC round trip. This verifies the native runtime, not P2P connectivity.
export function checkBareRuntime(): Promise<void> {
  return new Promise((resolve, reject) => {
    let worklet: Worklet | undefined;
    let settled = false;
    let received = '';
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { worklet?.terminate(); } catch (cause) {
        error ??= cause instanceof Error ? cause : new Error(String(cause));
      }
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error('Bare IPC timed out')), 5000);
    try {
      worklet = new Worklet();
      worklet.IPC.on('error', (error: Error) => finish(error));
      worklet.IPC.on('data', (data: unknown) => {
        if (!(data instanceof Uint8Array)) return finish(new Error('Invalid Bare IPC data'));
        for (const byte of data) {
          received += String.fromCharCode(byte);
          if (received.length > 64) return finish(new Error('Invalid Bare IPC reply'));
        }
        if (received === 'albatross-bare-ready\n') finish();
      });
      worklet.start('/albatross-check.js', `
        let input = '';
        BareKit.IPC.on('data', (data) => {
          input += data.toString();
          if (input === 'ping\\n') {
            BareKit.IPC.write(Buffer.from('albatross-bare-ready\\n'));
            input = '';
          }
        });
      `);
      worklet.IPC.write(new Uint8Array([112, 105, 110, 103, 10]));
    } catch (cause) {
      finish(cause instanceof Error ? cause : new Error(String(cause)));
    }
  });
}
