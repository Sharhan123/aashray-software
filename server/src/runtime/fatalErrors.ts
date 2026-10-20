import type { Logger } from 'pino';
import { safeError } from '../config/safeError.js';
import { processContext } from '../config/diagnostics.js';

// Fatal errors must never resume request processing. Logging an allowlisted
// representation before exiting avoids Node dumping sensitive error messages.
export function installFatalHandlers(log: Logger, runtime: Pick<NodeJS.Process, 'once' | 'removeListener' | 'exit'> = process) {
  let terminating = false;
  const fatal = (error: unknown) => {
    if (terminating) return runtime.exit(1);
    terminating = true;
    // Bound flushing: a broken output stream must not leave this process alive.
    const deadline = setTimeout(() => runtime.exit(1), 500);
    try {
      log.fatal({ ...processContext(), event: 'fatal_process_termination', failure: safeError(error), category: 'fatal' }, 'Fatal process failure; exiting');
      log.flush(() => { clearTimeout(deadline); runtime.exit(1); });
    } catch {
      clearTimeout(deadline);
      runtime.exit(1);
    }
  };
  runtime.once('uncaughtException', fatal);
  runtime.once('unhandledRejection', fatal);
  return () => {
    runtime.removeListener('uncaughtException', fatal);
    runtime.removeListener('unhandledRejection', fatal);
  };
}
