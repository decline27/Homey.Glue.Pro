import axios, { AxiosInstance, AxiosError } from 'axios';
import { CONFIG } from './config';
import { LockStatus, LockOperation, ApiError } from './types';

export class GlueApiClient {
  public readonly client: AxiosInstance;
  private retryCount: number = 0;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: `${CONFIG.API.BASE_URL}/${CONFIG.API.VERSION}`,
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      this.handleApiError.bind(this)
    );
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
    return response.data;
  }

  async sendOperation(lockId: string, operation: LockOperation): Promise<any> {
    const response = await this.client.post(
      `${CONFIG.API.ENDPOINTS.LOCKS}/${lockId}${CONFIG.API.ENDPOINTS.OPERATIONS}`,
      operation
    );
    return response.data;
  }
}
