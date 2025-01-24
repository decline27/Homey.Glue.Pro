import Homey from 'homey';
import { GlueApiClient } from '../../lib/api-client';
import { LockStatus } from '../../lib/types';

interface PairDevice {
  name: string;
  data: {
    id: string;
  };
}

class GlueDriver extends Homey.Driver {
  private apiClient: GlueApiClient | null = null;
  private lockCollection: PairDevice[] = [];

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('GlueDriver has been initialized');
    await this.initializeApiClient();
    await this.loadLocksCollection();
  }

  /**
   * Initialize the API client with auth key
   */
  private async initializeApiClient(): Promise<void> {
    const glueLockAuth = this.homey.settings.get("GlueLockAuth");
    if (!glueLockAuth) {
      this.error('GlueLock authentication key not found in settings');
      return;
    }
    this.apiClient = new GlueApiClient(glueLockAuth);
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices(): Promise<PairDevice[]> {
    if (this.lockCollection.length === 0) {
      await this.loadLocksCollection();
    }
    return this.lockCollection;
  }

  /**
   * Load available locks from the Glue API
   */
  private async loadLocksCollection(): Promise<void> {
    try {
      if (!this.apiClient) {
        await this.initializeApiClient();
        if (!this.apiClient) return;
      }

      const response = await this.apiClient.client.get("/locks");
      const locks: LockStatus[] = response.data;

      this.lockCollection = locks.map(lock => ({
        name: lock.description || `Glue Lock ${lock.id}`,
        data: {
          id: lock.id
        }
      }));

      this.log(`Loaded ${this.lockCollection.length} locks`);
    } catch (error) {
      this.error('Failed to load locks:', error);
      throw error;
    }
  }
}

module.exports = GlueDriver;
