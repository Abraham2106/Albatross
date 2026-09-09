import childProcess from 'node:child_process';

const original = childProcess.spawn.bind(childProcess);

function hideBareConsole(command: unknown, args?: unknown, options?: unknown) {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    options = args;
    args = undefined;
  }
  const cmd = String(command ?? '');
  if (/bare(\.exe)?$/i.test(cmd) || /bare-runtime/i.test(cmd)) {
    options = { ...(options && typeof options === 'object' ? options : {}), windowsHide: true };
  }
  return args === undefined ? original(command as never, options as never) : original(command as never, args as never, options as never);
}

(childProcess as { spawn: typeof childProcess.spawn }).spawn = hideBareConsole as typeof childProcess.spawn;
