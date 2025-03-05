import axios, { AxiosInstance, AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { CONFIG } from './config';
import { LockStatus, LockOperation, ApiError } from './types';

export class GlueApiClient {
  public readonly client: AxiosInstance;
  private retryCount: number = 0;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: `${CONFIG.API.BASE_URL}/${CONFIG.API.VERSION}`,
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      // Add timeout configuration
      timeout: CONFIG.API.TIMEOUT,
      // Enable HTTP keep-alive for connection pooling
      httpAgent: new (require('http').Agent)({ keepAlive: true }),
      httpsAgent: new (require('https').Agent)({ keepAlive: true })
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      this.handleApiError.bind(this)
    );

    // Add request interceptor for caching
    this.client.interceptors.request.use(
      this.handleCachedRequest.bind(this)
    );
  }

  private async handleCachedRequest(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
    // Only apply caching to GET requests
    if (config.method?.toLowerCase() !== 'get' || !CONFIG.API.CACHE.ENABLED) {
      return config;
    }

    const cacheKey = this.getCacheKey(config);
    const cachedResponse = this.cache.get(cacheKey);

    // If we have a cached response and it's not expired, return it
    if (cachedResponse && 
        (Date.now() - cachedResponse.timestamp) < CONFIG.API.CACHE.TTL) {
      // Create a custom adapter for cached response
      const customAdapter = async (): Promise<AxiosResponse> => ({
        data: cachedResponse.data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config as InternalAxiosRequestConfig,
        cached: true
      } as AxiosResponse);

      config.adapter = customAdapter;
      return config;
    }

    return config;
  }

  private getCacheKey(config: AxiosRequestConfig): string {
    return `${config.method}-${config.url}-${JSON.stringify(config.params)}`;
  }

  private async handleApiError(error: AxiosError): Promise<never> {
    const apiError: ApiError = new Error(error.message);
    apiError.code = error.code;
    apiError.response = error.response;

    if (this.shouldRetry(error) && this.retryCount < CONFIG.API.RETRY.MAX_ATTEMPTS) {
      this.retryCount++;
      const delay = Math.min(
        CONFIG.API.RETRY.INITIAL_DELAY * Math.pow(2, this.retryCount - 1),
        CONFIG.API.RETRY.MAX_DELAY
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.client.request(error.config!);
    }

    this.retryCount = 0;
    throw apiError;
  }

  private shouldRetry(error: AxiosError): boolean {
    // Retry on network errors or 5xx server errors
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  }

  async getLockStatus(lockId: string): Promise<LockStatus> {
    const response = await this.client.get(`${CONFIG.API.ENDPOINTS.LOCKS}/${lockId}`);
    
    // Cache the response
    if (CONFIG.API.CACHE.ENABLED && !(response as any).cached) {
      const cacheKey = this.getCacheKey({
        method: 'get',
        url: `${CONFIG.API.ENDPOINTS.LOCKS}/${lockId}`
      });
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      });
    }
    
    return response.data;
  }

  async sendOperation(lockId: string, operation: LockOperation): Promise<any> {
    // Prioritize lock/unlock operations with higher timeout
    const config: AxiosRequestConfig = {
      timeout: CONFIG.API.OPERATIONS_TIMEOUT
    };
    
    const response = await this.client.post(
      `${CONFIG.API.ENDPOINTS.LOCKS}/${lockId}${CONFIG.API.ENDPOINTS.OPERATIONS}`,
      operation,
      config
    );
    
    // Invalidate cache for this lock after operation
    if (CONFIG.API.CACHE.ENABLED) {
      const cacheKey = this.getCacheKey({
        method: 'get',
        url: `${CONFIG.API.ENDPOINTS.LOCKS}/${lockId}`
      });
      this.cache.delete(cacheKey);
    }
    
    return response.data;
  }

  // Clear all cached data
  clearCache(): void {
    this.cache.clear();
  }
}
