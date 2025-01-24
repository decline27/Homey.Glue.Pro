import Homey from 'homey';
import { GlueApiClient } from '../../lib/api-client';
import { CONFIG, EVENT_TYPES } from '../../lib/config';
import { LockStatus, LockOperation } from '../../lib/types';

class GlueDevice extends Homey.Device {
  private apiClient: GlueApiClient | null = null;
  private firmwareVersion: string | null = null;
  private isFirmwareCompatible: boolean = false;
  private lastKnownState: { locked: boolean; timestamp: string } | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('GlueDevice has been initialized');

    const deviceData = this.getData();
    const glueLockAuth = this.homey.settings.get("GlueLockAuth");

    if (!glueLockAuth) {
      this.error('GlueLock authentication key not found in settings');
      return;
    }

    // Initialize API client
    this.apiClient = new GlueApiClient(glueLockAuth);

    // Register listeners
    this.registerCapabilityListener("locked", this.onLockOperation.bind(this));

    // Initial setup
    await this.checkFirmwareVersion();
    this.startPolling();
  }

  /**
   * Handle lock/unlock operations
   */
  private async onLockOperation(locked: boolean): Promise<void> {
    try {
      const operation: LockOperation = { type: locked ? 'lock' : 'unlock' };
      const lockId = this.getData().id;
      
      this.log(`Sending ${operation.type} command to device`);
      await this.apiClient?.sendOperation(lockId, operation);
      
      // Update immediately after operation
      await this.loadCurrentLockState();
    } catch (error) {
      this.error('Failed to perform lock operation:', error);
      throw error;
    }
  }

  /**
   * Check and store firmware version
   */
  private async checkFirmwareVersion(): Promise<void> {
    try {
      const lockStatus = await this.apiClient?.getLockStatus(this.getData().id);
      if (lockStatus) {
        this.firmwareVersion = lockStatus.firmwareVersion;
        this.isFirmwareCompatible = parseFloat(this.firmwareVersion) >= CONFIG.FIRMWARE.COMPATIBLE_VERSION;
        this.log(`Firmware version: ${this.firmwareVersion} (Compatible: ${this.isFirmwareCompatible})`);
      }
    } catch (error) {
      this.error('Failed to check firmware version:', error);
    }
  }

  /**
   * Load and update current lock state
   */
  private async loadCurrentLockState(): Promise<void> {
    try {
      const lockStatus = await this.apiClient?.getLockStatus(this.getData().id);
      if (!lockStatus) return;

      const deviceIsLocked = this.determineLockState(lockStatus);
      const eventTimestamp = lockStatus.lastLockEvent.timestamp;

      // Update last known state
      this.lastKnownState = { locked: deviceIsLocked, timestamp: eventTimestamp };

      // Update capabilities
      await this.setCapabilityValue("measure_battery", lockStatus.batteryStatus);
      await this.setCapabilityValue("locked", deviceIsLocked);

      this.log(`Lock state updated: ${deviceIsLocked ? 'locked' : 'unlocked'}, Battery: ${lockStatus.batteryStatus}%`);
    } catch (error) {
      this.error('Failed to load lock state:', error);
      
      // Use last known state if available and not too old
      if (this.lastKnownState && this.isStateValid(this.lastKnownState.timestamp)) {
        this.log('Using last known state due to API error');
        await this.setCapabilityValue("locked", this.lastKnownState.locked);
      }
    }
  }

  /**
   * Determine lock state based on firmware version and event type
   */
  private determineLockState(lockStatus: LockStatus): boolean {
    const eventType = lockStatus.lastLockEvent.eventType.toLowerCase();
    
    if (this.isFirmwareCompatible) {
      return EVENT_TYPES.LOCK.includes(eventType as any);
    }
    
    return !eventType.includes('unlock');
  }

  /**
   * Check if stored state is still valid (not older than polling interval)
   */
  private isStateValid(timestamp: string): boolean {
    const stateAge = Date.now() - new Date(timestamp).getTime();
    return stateAge <= this.getPollingInterval();
  }

  /**
   * Get polling interval in milliseconds
   */
  private getPollingInterval(): number {
    const settingsInterval = this.getSetting('polling_interval') as number;
    const minutes = Math.min(
      Math.max(settingsInterval || CONFIG.POLLING.DEFAULT_INTERVAL, CONFIG.POLLING.MIN_INTERVAL),
      CONFIG.POLLING.MAX_INTERVAL
    );
    return minutes * 60 * 1000;
  }

  /**
   * Start polling for status updates
   */
  private startPolling(): void {
    // Clear existing interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Set new polling interval
    this.pollingInterval = setInterval(async () => {
      await this.loadCurrentLockState();
    }, this.getPollingInterval());
  }

  /**
   * onSettings is called when the user updates the device's settings.
   */
  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log("GlueDevice settings where changed");

    // If polling interval was changed, restart polling
    if (changedKeys.includes('polling_interval')) {
      this.startPolling();
    }
  }

  /**
   * Clean up when device is deleted
   */
  async onDeleted() {
    this.log('GlueDevice has been deleted');
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('GlueDevice has been added');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('GlueDevice was renamed');
  }
}

module.exports = GlueDevice;
