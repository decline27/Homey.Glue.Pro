import Homey from 'homey';
import { GlueApiClient } from '../../lib/api-client';
import { CONFIG, EVENT_TYPES } from '../../lib/config';
import { LockStatus, LockOperation } from '../../lib/types';
import { Logger, LogLevel } from '../../lib/logger';

export class GlueDevice extends Homey.Device {
  private apiClient: GlueApiClient | null = null;
  private firmwareVersion: string | null = null;
  private isFirmwareCompatible: boolean = false;
  private lastKnownState: { locked: boolean; timestamp: string; batteryStatus: number } | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private logger: Logger = new Logger(this, { prefix: 'GlueDevice' });
  private lastOperationTime: number = 0;
  private consecutiveErrors: number = 0;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.logger.info('Device has been initialized');

    const deviceData = this.getData();
    const glueLockAuth = this.homey.settings.get("GlueLockAuth");

    if (!glueLockAuth) {
      this.logger.error('Authentication key not found in settings');
      return;
    }

    // Initialize API client
    this.apiClient = new GlueApiClient(glueLockAuth);

    // Register listeners
    this.registerCapabilityListener("locked", this.onLockOperation.bind(this));

    // Initial setup
    await this.checkFirmwareVersion();
    await this.loadCurrentLockState(); // Load initial state
    this.startPolling();
  }

  /**
   * Handle lock/unlock operations with optimized performance
   */
  private async onLockOperation(locked: boolean): Promise<void> {
    try {
      const operation: LockOperation = { type: locked ? 'lock' : 'unlock' };
      const lockId = this.getData().id;
      
      this.logger.info(`Sending ${operation.type} command to device`);
      
      // Update last operation time to optimize polling
      this.lastOperationTime = Date.now();
      
      // Optimistically update UI state for better responsiveness
      await this.setCapabilityValue("locked", locked);
      
      // Send the actual operation to the API
      await this.apiClient?.sendOperation(lockId, operation);
      
      // Reset consecutive errors counter on success
      this.consecutiveErrors = 0;
      
      // Update state after a short delay to allow the lock to complete its operation
      setTimeout(async () => {
        await this.loadCurrentLockState();
      }, 2000);
    } catch (error) {
      this.logger.error('Failed to perform lock operation:', error);
      this.consecutiveErrors++;
      
      // Revert optimistic update if operation failed
      if (this.lastKnownState) {
        await this.setCapabilityValue("locked", this.lastKnownState.locked);
      }
      
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
        this.logger.info(`Firmware version: ${this.firmwareVersion} (Compatible: ${this.isFirmwareCompatible})`);
      }
    } catch (error) {
      this.logger.error('Failed to check firmware version:', error);
    }
  }

  /**
   * Load and update current lock state with optimized caching
   */
  private async loadCurrentLockState(): Promise<void> {
    try {
      const lockStatus = await this.apiClient?.getLockStatus(this.getData().id);
      if (!lockStatus) return;

      const deviceIsLocked = this.determineLockState(lockStatus);
      const eventTimestamp = lockStatus.lastLockEvent.timestamp;

      // Update last known state
      this.lastKnownState = { 
        locked: deviceIsLocked, 
        timestamp: eventTimestamp,
        batteryStatus: lockStatus.batteryStatus
      };

      // Update capabilities
      await this.setCapabilityValue("measure_battery", lockStatus.batteryStatus);
      await this.setCapabilityValue("locked", deviceIsLocked);

      this.logger.debug(`Lock state updated: ${deviceIsLocked ? 'locked' : 'unlocked'}, Battery: ${lockStatus.batteryStatus}%`);
      
      // Reset consecutive errors counter on success
      this.consecutiveErrors = 0;
    } catch (error) {
      this.logger.error('Failed to load lock state:', error);
      this.consecutiveErrors++;
      
      // Use last known state if available and not too old
      if (this.lastKnownState && this.isStateValid(this.lastKnownState.timestamp)) {
        this.logger.warn('Using last known state due to API error');
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
   * Get polling interval in milliseconds with adaptive logic
   */
  private getPollingInterval(): number {
    const settingsInterval = this.getSetting('polling_interval') as number;
    const baseInterval = Math.min(
      Math.max(settingsInterval || CONFIG.POLLING.DEFAULT_INTERVAL, CONFIG.POLLING.MIN_INTERVAL),
      CONFIG.POLLING.MAX_INTERVAL
    ) * 60 * 1000;
    
    // Adaptive polling: poll more frequently right after operations
    const timeSinceLastOperation = Date.now() - this.lastOperationTime;
    if (timeSinceLastOperation < 60000) { // Within 1 minute of operation
      return Math.max(baseInterval / 4, 5000); // Poll at least every 5 seconds but no more than 1/4 of base interval
    }
    
    // Back off polling frequency when experiencing errors
    if (this.consecutiveErrors > 1) {
      return Math.min(baseInterval * (1 + this.consecutiveErrors * 0.5), baseInterval * 5);
    }
    
    return baseInterval;
  }

  /**
   * Start polling for status updates with dynamic intervals
   */
  private startPolling(): void {
    // Clear existing interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Use setTimeout instead of setInterval for dynamic intervals
    const scheduleNextPoll = async () => {
      try {
        await this.loadCurrentLockState();
      } catch (error) {
        // Error already logged in loadCurrentLockState
      }
      
      // Schedule next poll with potentially different interval
      this.pollingInterval = setTimeout(scheduleNextPoll, this.getPollingInterval());
    };
    
    // Start the polling cycle
    this.pollingInterval = setTimeout(scheduleNextPoll, this.getPollingInterval());
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
    this.logger.info("Settings were changed");

    // If polling interval was changed, restart polling
    if (changedKeys.includes('polling_interval')) {
      this.startPolling();
    }
  }

  /**
   * Clean up when device is deleted
   */
  async onDeleted() {
    this.logger.info('Device has been deleted');
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    // Clear cache when device is deleted
    this.apiClient?.clearCache();
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.logger.info('Device has been added');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.logger.info(`Device was renamed to: ${name}`);
  }
}

module.exports = GlueDevice;
