import pino from 'pino';

// Create a logger instance
const logger = pino({
    level: 'info', // Set log level
    transport: {
        target: 'pino-pretty', // Pretty-print logs during development
    },
});

export const log = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
