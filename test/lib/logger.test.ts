import { Logger, LogLevel } from '../../lib/logger';

// Create a mock Homey Device/Driver context
const createMockContext = () => ({
  log: jest.fn(),
  error: jest.fn(),
  getData: jest.fn().mockReturnValue({ id: 'test-device-123' })
});

describe('Logger', () => {
  let mockContext: any;
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = createMockContext();
    logger = new Logger(mockContext, { prefix: 'TestLogger' });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultLogger = new Logger(mockContext);
      expect(defaultLogger).toBeDefined();
    });

    it('should initialize with custom options', () => {
      const customLogger = new Logger(mockContext, {
        prefix: 'CustomPrefix',
        minLevel: LogLevel.WARN
      });
      expect(customLogger).toBeDefined();
    });
  });

  describe('logging methods', () => {
    it('should log debug messages', () => {
      logger.debug('This is a debug message');
      expect(mockContext.log).toHaveBeenCalledWith(
        expect.stringContaining('[TestLogger][test-device-123] This is a debug message')
      );
    });

    it('should log info messages', () => {
      logger.info('This is an info message');
      expect(mockContext.log).toHaveBeenCalledWith(
        expect.stringContaining('[TestLogger][test-device-123] This is an info message')
      );
    });

    it('should log warning messages', () => {
      logger.warn('This is a warning message');
      expect(mockContext.log).toHaveBeenCalledWith(
        expect.stringContaining('[TestLogger][test-device-123] ⚠️ This is a warning message')
      );
    });

    it('should log error messages', () => {
      logger.error('This is an error message');
      expect(mockContext.error).toHaveBeenCalledWith(
        expect.stringContaining('[TestLogger][test-device-123] ❌ This is an error message')
      );
    });

    it('should respect minimum log level', () => {
      const warnLogger = new Logger(mockContext, {
        prefix: 'WarnLogger',
        minLevel: LogLevel.WARN
      });

      warnLogger.debug('Debug message');
      warnLogger.info('Info message');
      warnLogger.warn('Warning message');
      warnLogger.error('Error message');

      // Debug and info should not be logged
      expect(mockContext.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Debug message')
      );
      expect(mockContext.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Info message')
      );

      // Warning and error should be logged
      expect(mockContext.log).toHaveBeenCalledWith(
        expect.stringContaining('Warning message')
      );
      expect(mockContext.error).toHaveBeenCalledWith(
        expect.stringContaining('Error message')
      );
    });
  });

  describe('child logger', () => {
    it('should create child logger with extended prefix', () => {
      const childLogger = logger.child('ChildModule');
      childLogger.info('Child logger message');

      expect(mockContext.log).toHaveBeenCalledWith(
        expect.stringContaining('[TestLogger:ChildModule][test-device-123] Child logger message')
      );
    });

    it('should inherit min log level from parent', () => {
      const parentLogger = new Logger(mockContext, {
        prefix: 'Parent',
        minLevel: LogLevel.ERROR
      });

      const childLogger = parentLogger.child('Child');
      childLogger.warn('This warning should not be logged');
      childLogger.error('This error should be logged');

      expect(mockContext.log).not.toHaveBeenCalled();
      expect(mockContext.error).toHaveBeenCalledWith(
        expect.stringContaining('[Parent:Child][test-device-123] ❌ This error should be logged')
      );
    });
  });

  describe('setMinLevel', () => {
    it('should change the minimum log level', () => {
      logger.debug('Debug before change');
      expect(mockContext.log).toHaveBeenCalledWith(
        expect.stringContaining('Debug before change')
      );

      logger.setMinLevel(LogLevel.ERROR);
      
      logger.debug('Debug after change');
      logger.info('Info after change');
      logger.warn('Warning after change');
      logger.error('Error after change');

      expect(mockContext.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Debug after change')
      );
      expect(mockContext.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Info after change')
      );
      expect(mockContext.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Warning after change')
      );
      expect(mockContext.error).toHaveBeenCalledWith(
        expect.stringContaining('Error after change')
      );
    });
  });

  describe('context handling', () => {
    it('should handle context without getData method', () => {
      const contextWithoutGetData = {
        log: jest.fn(),
        error: jest.fn()
      };

      const simpleLogger = new Logger(contextWithoutGetData as any, { prefix: 'Simple' });
      simpleLogger.info('Message without context ID');

      expect(contextWithoutGetData.log).toHaveBeenCalledWith(
        expect.stringContaining('[Simple] Message without context ID')
      );
    });

    it('should handle getData throwing an error', () => {
      const contextWithErrorGetData = {
        log: jest.fn(),
        error: jest.fn(),
        getData: jest.fn().mockImplementation(() => {
          throw new Error('getData error');
        })
      };

      const errorLogger = new Logger(contextWithErrorGetData as any, { prefix: 'Error' });
      errorLogger.info('Message with getData error');

      expect(contextWithErrorGetData.log).toHaveBeenCalledWith(
        expect.stringContaining('[Error] Message with getData error')
      );
    });
  });
});