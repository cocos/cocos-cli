import winston from 'winston';
import { Logger } from '@cocos/creator-programming-common/lib/logger';

const packerDriverLogTag = '::PackerDriver::';
const packerDriverLogTagRegex = new RegExp(packerDriverLogTag);
const packerDriverLogTagHidden = `{hidden(${packerDriverLogTag})}`;

export class PackerDriverLogger implements Logger {
    constructor(debugLogFile: string) {
        const fileLogger = winston.createLogger({
            transports: [
                new winston.transports.File({
                    level: 'debug',
                    filename: debugLogFile,
                    format: winston.format.combine(
                        winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
                        winston.format.printf(({ level, message, timestamp }) => {
                            return `${timestamp} ${level}: ${message}`;
                        })
                    ),
                }),
            ],
        });
        this._fileLogger = fileLogger;
    }

    debug(message: string) {
        this._fileLogger.debug(message);
    }

    info(message: string) {
        this._fileLogger.info(message);
        console.info(packerDriverLogTagHidden, message);
        return this;
    }

    warn(message: string) {
        this._fileLogger.warn(message);
        console.warn(packerDriverLogTagHidden, message);
        return this;
    }

    error(message: string) {
        this._fileLogger.error(message);
        console.error(packerDriverLogTagHidden, message);
        return this;
    }

    clear() {
        console.debug('Clear logs...');
    }

    private _fileLogger: winston.Logger;
}
