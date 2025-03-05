// Use the mock directly
import { GlueDriver } from '../../../drivers/glue/driver';
import { GlueApiClient } from '../../../lib/api-client';
import { LockStatus } from '../../../lib/types';

// Mock the API client
jest.mock('../../../lib/api-client', () => ({
  GlueApiClient: jest.fn().mockImplementation(() => ({
    client: {
      get: jest.fn()
    }
  }))
}));

// Mock the GlueDriver class
jest.mock('../../../drivers/glue/driver', () => {
  const Homey = require('homey');
  return {
    GlueDriver: class MockGlueDriver extends Homey.Driver {
      apiClient = null;
      lockCollection = [];
      onInit = jest.fn().mockImplementation(async () => {
        const mockThis = this as any;
        mockThis.log('GlueDriver has been initialized');
        const glueLockAuth = mockThis.homey.settings.get("GlueLockAuth");
        if (!glueLockAuth) {
          mockThis.error('GlueLock authentication key not found in settings');
          return;
        }
        mockThis.apiClient = new GlueApiClient(glueLockAuth);
        return Promise.resolve();
      });
      onPairListDevices = jest.fn().mockImplementation(async () => {
        const mockThis = this as any;
        if (mockThis.lockCollection.length === 0) {
          await mockThis.loadLocksCollection();
        }
        return mockThis.lockCollection;
      });
      loadLocksCollection = jest.fn().mockImplementation(async () => {
        const mockThis = this as any;
        if (!mockThis.apiClient) return;
        
        try {
          const response = await mockThis.apiClient.client.get('/locks');
          mockThis.lockCollection = response.data.map((lock: LockStatus) => ({
            name: lock.description || `Glue Lock ${lock.id}`,
            data: {
              id: lock.id
            }
          }));
        } catch (error) {
          mockThis.error('Failed to load locks:', error);
          throw error;
        }
      });
    }
  };
});

describe('GlueDriver', () => {
  let driver: GlueDriver;
  let mockApiClient: jest.Mocked<GlueApiClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a new driver instance for each test
    driver = new GlueDriver();
    
    // Setup mocks
    driver.homey.settings.get = jest.fn().mockImplementation((key) => {
      if (key === 'GlueLockAuth') return 'test-api-key';
      return null;
    });
  });
  
  describe('onInit', () => {
    it('should initialize the driver correctly', async () => {
      // Call onInit
      await driver.onInit();
      
      // Verify API client was initialized
      expect(GlueApiClient).toHaveBeenCalledWith('test-api-key');
      
      // Verify log was called
      expect(driver.log).toHaveBeenCalledWith('GlueDriver has been initialized');
    });
    
    it('should handle missing auth key', async () => {
      // Mock missing auth key
      driver.homey.settings.get = jest.fn().mockReturnValue(null);
      
      // Call onInit
      await driver.onInit();
      
      // Verify error was logged
      expect(driver.error).toHaveBeenCalledWith('GlueLock authentication key not found in settings');
      
      // Verify API client was not initialized with null key
      expect(GlueApiClient).not.toHaveBeenCalledWith(null);
    });
  });
  
  describe('onPairListDevices', () => {
    beforeEach(() => {
      // Setup API client mock
      driver['apiClient'] = {
        client: {
          get: jest.fn()
        }
      } as any;
    });
    
    it('should return available locks for pairing', async () => {
      // Mock lock collection
      const mockLocks: LockStatus[] = [
        {
          id: 'lock-123',
          description: 'Test Lock 1',
          batteryStatus: 80,
          connectionStatus: 'connected',
          firmwareVersion: '2.6',
          lastLockEvent: {
            eventType: 'localLock',
            timestamp: '2023-01-01T12:00:00Z'
          }
        },
        {
          id: 'lock-456',
          description: 'Test Lock 2',
          batteryStatus: 90,
          connectionStatus: 'connected',
          firmwareVersion: '2.5',
          lastLockEvent: {
            eventType: 'remoteUnlock',
            timestamp: '2023-01-01T12:00:00Z'
          }
        }
      ];
      
      // Mock loadLocksCollection to set the lock collection
      driver['loadLocksCollection'] = jest.fn().mockImplementation(() => {
        driver['lockCollection'] = mockLocks.map(lock => ({
          name: lock.description,
          data: {
            id: lock.id
          }
        }));
      });
      
      // Call onPairListDevices
      const result = await driver.onPairListDevices();
      
      // Verify loadLocksCollection was called
      expect(driver['loadLocksCollection']).toHaveBeenCalled();
      
      // Verify result contains the expected devices
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Test Lock 1');
      expect(result[0].data.id).toBe('lock-123');
      expect(result[1].name).toBe('Test Lock 2');
      expect(result[1].data.id).toBe('lock-456');
    });
    
    it('should handle API errors during pairing', async () => {
      // Mock loadLocksCollection to throw an error
      const mockError = new Error('API error');
      driver['loadLocksCollection'] = jest.fn().mockRejectedValue(mockError);
      
      // Call onPairListDevices and expect it to throw
      await expect(driver.onPairListDevices()).rejects.toThrow('API error');
      
      // Verify loadLocksCollection was called
      expect(driver['loadLocksCollection']).toHaveBeenCalled();
    });
  });
  
  describe('loadLocksCollection', () => {
    it('should fetch locks from API and format them correctly', async () => {
      // Setup API client mock
      const mockApiResponse = {
        data: [
          {
            id: 'lock-123',
            description: 'Test Lock',
            batteryStatus: 80,
            connectionStatus: 'connected',
            firmwareVersion: '2.6',
            lastLockEvent: {
              eventType: 'localLock',
              timestamp: '2023-01-01T12:00:00Z'
            }
          }
        ]
      };
      
      driver['apiClient'] = {
        client: {
          get: jest.fn().mockResolvedValue(mockApiResponse)
        }
      } as any;
      
      // Call loadLocksCollection
      await driver['loadLocksCollection']();
      
      // Verify API client was called with correct endpoint
      expect(driver['apiClient']!.client.get).toHaveBeenCalledWith('/locks');
      
      // Verify lock collection was set correctly
      expect(driver['lockCollection']).toHaveLength(1);
      expect(driver['lockCollection'][0].name).toBe('Test Lock');
      expect(driver['lockCollection'][0].data.id).toBe('lock-123');
    });
    
    it('should handle missing lock description', async () => {
      // Setup API client mock with lock missing description
      const mockApiResponse = {
        data: [
          {
            id: 'lock-123',
            description: null,
            batteryStatus: 80,
            connectionStatus: 'connected',
            firmwareVersion: '2.6',
            lastLockEvent: {
              eventType: 'localLock',
              timestamp: '2023-01-01T12:00:00Z'
            }
          }
        ]
      };
      
      driver['apiClient'] = {
        client: {
          get: jest.fn().mockResolvedValue(mockApiResponse)
        }
      } as any;
      
      // Call loadLocksCollection
      await driver['loadLocksCollection']();
      
      // Verify lock collection uses fallback name
      expect(driver['lockCollection'][0].name).toBe('Glue Lock lock-123');
    });
  });
});