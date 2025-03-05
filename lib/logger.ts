import Homey from 'homey';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LoggerOptions {
  prefix?: string;
  minLevel?: LogLevel;
}

export class Logger {
  private prefix: string;
  private minLevel: LogLevel;
  private context: Homey.Device | Homey.Driver;

  constructor(context: Homey.Device | Homey.Driver, options: LoggerOptions = {}) {
    this.context = context;
    this.prefix = options.prefix || '';
    this.minLevel = options.minLevel !== undefined ? options.minLevel : LogLevel.DEBUG;
  }

  /**
   * Format a log message with timestamp, prefix, and additional context
   */
  private formatMessage(message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const contextId = this.getContextId();
    const prefix = this.prefix ? `[${this.prefix}]` : '';
    const contextInfo = contextId ? `[${contextId}]` : '';
    
    return `${timestamp} ${prefix}${contextInfo} ${message}`;
  }

  /**
   * Get a unique identifier from the context (device or driver)
   */
  private getContextId(): string | undefined {
    if ('getData' in this.context) {
      // It's a device
      try {
        const data = this.context.getData();
        return data?.id;
      } catch (e) {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]): void {
    if (this.minLevel <= LogLevel.DEBUG) {
      this.context.log(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: any[]): void {
    if (this.minLevel <= LogLevel.INFO) {
      this.context.log(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    if (this.minLevel <= LogLevel.WARN) {
      this.context.log(this.formatMessage(`⚠️ ${message}`), ...args);
    }
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: any[]): void {
    if (this.minLevel <= LogLevel.ERROR) {
      this.context.error(this.formatMessage(`❌ ${message}`), ...args);
    }
  }

  /**
   * Create a child logger with additional prefix
   */
  child(prefix: string): Logger {
    return new Logger(this.context, {
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      minLevel: this.minLevel
    });
  }

  /**
   * Set the minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}