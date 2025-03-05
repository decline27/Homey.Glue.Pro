import axios from 'axios';
import { GlueApiClient } from '../../lib/api-client';
import { CONFIG } from '../../lib/config';
import { LockOperation, LockStatus } from '../../lib/types';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    interceptors: {
      response: {
        use: jest.fn()
      },
      request: {
        use: jest.fn()
      }
    },
    get: jest.fn(),
    post: jest.fn(),
    request: jest.fn()
  }))
}));

describe('GlueApiClient', () => {
  const mockApiKey = 'test-api-key';
  let apiClient: GlueApiClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    apiClient = new GlueApiClient(mockApiKey);
    mockAxiosInstance = apiClient.client;
  });

  describe('constructor', () => {
    it('should create axios instance with correct configuration', () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: `${CONFIG.API.BASE_URL}/${CONFIG.API.VERSION}`,
        headers: {
          'Authorization': `Api-Key ${mockApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: CONFIG.API.TIMEOUT,
        httpAgent: expect.any(Object),
        httpsAgent: expect.any(Object)
      });
    });

    it('should set up response interceptor', () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
    
    it('should set up request interceptor', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });
  });

  describe('getLockStatus', () => {
    it('should call get with correct endpoint and return data', async () => {
      const mockLockId = 'lock-123';
      const mockResponse = { data: { id: mockLockId } as LockStatus };
      
      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);
      
      const result = await apiClient.getLockStatus(mockLockId);
      
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `${CONFIG.API.ENDPOINTS.LOCKS}/${mockLockId}`
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should cache the response when caching is enabled', async () => {
      // Enable caching for this test
      const originalCacheEnabled = CONFIG.API.CACHE.ENABLED;
      CONFIG.API.CACHE.ENABLED = true;
      
      const mockLockId = 'lock-123';
      const mockResponse = { data: { id: mockLockId } as LockStatus };
      
      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);
      
      await apiClient.getLockStatus(mockLockId);
      
      // Check if cache has the entry
      const cacheKey = `get-${CONFIG.API.ENDPOINTS.LOCKS}/${mockLockId}-undefined`;
      expect((apiClient as any).cache.has(cacheKey)).toBeTruthy();
      
      // Restore original config
      CONFIG.API.CACHE.ENABLED = originalCacheEnabled;
    });

    it('should not cache the response when caching is disabled', async () => {
      // Disable caching for this test
      const originalCacheEnabled = CONFIG.API.CACHE.ENABLED;
      CONFIG.API.CACHE.ENABLED = false;
      
      const mockLockId = 'lock-123';
      const mockResponse = { data: { id: mockLockId } as LockStatus };
      
      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);
      
      await apiClient.getLockStatus(mockLockId);
      
      // Check that cache is empty
      expect((apiClient as any).cache.size).toBe(0);
      
      // Restore original config
      CONFIG.API.CACHE.ENABLED = originalCacheEnabled;
    });
  });

  describe('sendOperation', () => {
    it('should call post with correct endpoint and operation data', async () => {
      const mockLockId = 'lock-123';
      const mockOperation: LockOperation = { type: 'lock' };
      const mockResponse = { data: { success: true } };
      
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);
      
      const result = await apiClient.sendOperation(mockLockId, mockOperation);
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        `${CONFIG.API.ENDPOINTS.LOCKS}/${mockLockId}${CONFIG.API.ENDPOINTS.OPERATIONS}`,
        mockOperation,
        expect.objectContaining({
          timeout: CONFIG.API.OPERATIONS_TIMEOUT
        })
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should invalidate cache for the lock after operation when caching is enabled', async () => {
      // Enable caching for this test
      const originalCacheEnabled = CONFIG.API.CACHE.ENABLED;
      CONFIG.API.CACHE.ENABLED = true;
      
      const mockLockId = 'lock-123';
      const mockOperation: LockOperation = { type: 'lock' };
      const mockResponse = { data: { success: true } };
      
      // First cache a response
      const cacheKey = `get-${CONFIG.API.ENDPOINTS.LOCKS}/${mockLockId}-undefined`;
      (apiClient as any).cache.set(cacheKey, {
        data: { id: mockLockId },
        timestamp: Date.now()
      });
      
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);
      
      await apiClient.sendOperation(mockLockId, mockOperation);
      
      // Check that cache entry was deleted
      expect((apiClient as any).cache.has(cacheKey)).toBeFalsy();
      
      // Restore original config
      CONFIG.API.CACHE.ENABLED = originalCacheEnabled;
    });
  });

  describe('error handling', () => {
    it('should retry on network errors', async () => {
      const mockError = {
        message: 'Network Error',
        config: {},
        code: 'ECONNABORTED'
      };
      const mockSuccessResponse = { data: { success: true } };
      
      // First call fails, second succeeds
      mockAxiosInstance.get.mockRejectedValueOnce(mockError);
      mockAxiosInstance.request.mockResolvedValueOnce(mockSuccessResponse);
      
      // We need to manually trigger the error handler since we mocked the interceptor
      const errorHandler = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
      
      // Call the error handler with the mock error
      const result = await errorHandler(mockError);
      
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(mockError.config);
      expect(result).toEqual(mockSuccessResponse);
    });

    it('should retry with exponential backoff', async () => {
      // Use Jest's timer mocks instead of directly mocking setTimeout
      jest.useFakeTimers();
      
      const mockError = {
        message: 'Network Error',
        config: {},
        code: 'ECONNABORTED'
      };
      
      // Mock the request to keep failing
      mockAxiosInstance.request.mockResolvedValueOnce({ data: 'success' });
      
      // We need to manually trigger the error handler
      const errorHandler = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
      
      // Start the error handling process but don't await it
      const errorPromise = errorHandler(mockError).catch(() => {});
      
      // Advance timers to trigger the setTimeout callback
      jest.runAllTimers();
      
      // Wait for any pending promises to resolve
      await Promise.resolve();
      
      // Verify the request was made
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(mockError.config);
      
      // Clean up
      jest.useRealTimers();
      await errorPromise;
    });

    it('should not retry when max attempts reached', async () => {
      // Set retryCount to max attempts
      (apiClient as any).retryCount = CONFIG.API.RETRY.MAX_ATTEMPTS;
      
      const mockError = {
        message: 'Network Error',
        config: {},
        code: 'ECONNABORTED'
      };
      
      // We need to manually trigger the error handler
      const errorHandler = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
      
      // Call the error handler and expect it to throw
      await expect(errorHandler(mockError)).rejects.toThrow('Network Error');
      
      // Verify retryCount was reset
      expect((apiClient as any).retryCount).toBe(0);
      
      // Verify request was not called again (no retry)
      expect(mockAxiosInstance.request).not.toHaveBeenCalled();
    });

    it('should not retry on non-retryable errors', async () => {
      const mockError = {
        message: 'Bad Request',
        config: {},
        response: { status: 400 }
      };
      
      // We need to manually trigger the error handler
      const errorHandler = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
      
      // Call the error handler and expect it to throw
      await expect(errorHandler(mockError)).rejects.toThrow('Bad Request');
      
      // Verify request was not called again
      expect(mockAxiosInstance.request).not.toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    it('should return cached response when available and not expired', async () => {
      // Enable caching for this test
      const originalCacheEnabled = CONFIG.API.CACHE.ENABLED;
      CONFIG.API.CACHE.ENABLED = true;
      
      // Setup a mock request config
      const mockConfig = {
        method: 'get',
        url: '/test-url',
        params: { test: 'param' }
      };
      
      // Add a cached response
      const cacheKey = `get-/test-url-{"test":"param"}`;
      const cachedData = { test: 'data' };
      (apiClient as any).cache.set(cacheKey, {
        data: cachedData,
        timestamp: Date.now() // Fresh timestamp
      });
      
      // Call the request interceptor
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      const result = await requestInterceptor(mockConfig);
      
      // Verify adapter was set
      expect(result.adapter).toBeDefined();
      
      // Call the adapter to get the response
      const response = await result.adapter();
      
      // Verify the response contains cached data
      expect(response.data).toEqual(cachedData);
      expect(response.cached).toBe(true);
      
      // Restore original config
      CONFIG.API.CACHE.ENABLED = originalCacheEnabled;
    });

    it('should not use cache for non-GET requests', async () => {
      // Enable caching for this test
      const originalCacheEnabled = CONFIG.API.CACHE.ENABLED;
      CONFIG.API.CACHE.ENABLED = true;
      
      // Setup a mock POST request config
      const mockConfig = {
        method: 'post',
        url: '/test-url',
        data: { test: 'data' }
      };
      
      // Call the request interceptor
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      const result = await requestInterceptor(mockConfig);
      
      // Verify adapter was not set
      expect(result.adapter).toBeUndefined();
      
      // Restore original config
      CONFIG.API.CACHE.ENABLED = originalCacheEnabled;
    });

    it('should not use cache when caching is disabled', async () => {
      // Disable caching for this test
      const originalCacheEnabled = CONFIG.API.CACHE.ENABLED;
      CONFIG.API.CACHE.ENABLED = false;
      
      // Setup a mock request config
      const mockConfig = {
        method: 'get',
        url: '/test-url'
      };
      
      // Add a cached response
      const cacheKey = `get-/test-url-undefined`;
      (apiClient as any).cache.set(cacheKey, {
        data: { test: 'data' },
        timestamp: Date.now() // Fresh timestamp
      });
      
      // Call the request interceptor
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      const result = await requestInterceptor(mockConfig);
      
      // Verify adapter was not set
      expect(result.adapter).toBeUndefined();
      
      // Restore original config
      CONFIG.API.CACHE.ENABLED = originalCacheEnabled;
    });

    it('should not use expired cache entries', async () => {
      // Enable caching for this test
      const originalCacheEnabled = CONFIG.API.CACHE.ENABLED;
      const originalCacheTTL = CONFIG.API.CACHE.TTL;
      CONFIG.API.CACHE.ENABLED = true;
      CONFIG.API.CACHE.TTL = 1000; // 1 second TTL
      
      // Setup a mock request config
      const mockConfig = {
        method: 'get',
        url: '/test-url'
      };
      
      // Add an expired cached response (2 seconds old)
      const cacheKey = `get-/test-url-undefined`;
      (apiClient as any).cache.set(cacheKey, {
        data: { test: 'data' },
        timestamp: Date.now() - 2000
      });
      
      // Call the request interceptor
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      const result = await requestInterceptor(mockConfig);
      
      // Verify adapter was not set (because cache is expired)
      expect(result.adapter).toBeUndefined();
      
      // Restore original config
      CONFIG.API.CACHE.ENABLED = originalCacheEnabled;
      CONFIG.API.CACHE.TTL = originalCacheTTL;
    });
  });

  describe('clearCache', () => {
    it('should clear all cached data', () => {
      // Add some items to the cache
      (apiClient as any).cache.set('key1', { data: 'value1', timestamp: Date.now() });
      (apiClient as any).cache.set('key2', { data: 'value2', timestamp: Date.now() });
      
      // Verify cache has items
      expect((apiClient as any).cache.size).toBe(2);
      
      // Call clearCache
      apiClient.clearCache();
      
      // Verify cache is empty
      expect((apiClient as any).cache.size).toBe(0);
    });
  });
});