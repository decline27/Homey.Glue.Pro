import Homey from 'homey';
import axios from 'axios';
import _ from 'underscore';

class GlueDevice extends Homey.Device {

  private firmwareVersion: string | null = null;
  private isFirmwareCompatible: boolean = false;
  private readonly DEFAULT_POLLING_INTERVAL = 20; // Default polling interval in minutes

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('GlueDevice has been initialized');

    // Arrange
    var self = this;
    var deviceData = this.getData();
    var lockId = deviceData.id;
    var glueLockAuth = this.homey.settings.get("GlueLockAuth");

    if (!glueLockAuth) {
      this.error('GlueLock authentication key not found in settings');
      return;
    }

    // Register listeners:
    this.registerCapabilityListener("locked", async (actionLock) => {
      // Send action to device
      this.sendActionToDevice(lockId, glueLockAuth as string, actionLock);
    });

    // Initial firmware check and state load
    await this.checkFirmwareVersion(lockId, glueLockAuth as string);

    // Pull status more frequently for compatible firmware
    this.startPolling(lockId, glueLockAuth as string);

    // Get latest state:
    this.loadCurrentLockState(lockId, glueLockAuth as string);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('GlueDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
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
      const deviceData = this.getData();
      const glueLockAuth = this.homey.settings.get("GlueLockAuth");
      if (glueLockAuth) {
        this.startPolling(deviceData.id, glueLockAuth as string);
      }
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('GlueDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('GlueDevice has been deleted');
  }

  private async checkFirmwareVersion(lockId: string, glueLockAuth: string) {
    if (!glueLockAuth) {
      this.error('Cannot check firmware: GlueLock authentication key not found');
      return;
    }

    try {
      const options = {
        method: 'get',
        headers: {
          'Authorization': `Api-Key ${glueLockAuth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      const response = await axios.get(`https://user-api.gluehome.com/v1/locks/${lockId}`, options);
      this.firmwareVersion = response.data.firmwareVersion;
      this.isFirmwareCompatible = parseFloat(this.firmwareVersion || '0') >= 2.5;
      
      this.log(`Firmware version: ${this.firmwareVersion} (Compatible: ${this.isFirmwareCompatible})`);
    } catch (error) {
      this.error('Failed to check firmware version:', error);
    }
  }

  /**
   * Get polling interval in milliseconds from settings
   */
  private getPollingInterval(): number {
    const settingsInterval = this.getSetting('polling_interval') as number;
    const minutes = settingsInterval || this.DEFAULT_POLLING_INTERVAL;
    return minutes * 60 * 1000; // Convert minutes to milliseconds
  }

  private startPolling(lockId: string, glueLockAuth: string) {
    if (!glueLockAuth) {
      this.error('Cannot start polling: GlueLock authentication key not found');
      return;
    }

    // Clear any existing interval
    if (this.getStoreValue('pollingInterval')) {
      clearInterval(this.getStoreValue('pollingInterval'));
    }

    // Set new polling interval
    const interval = setInterval(() => {
      this.loadCurrentLockState(lockId, glueLockAuth);
    }, this.getPollingInterval());

    // Store the interval ID
    this.setStoreValue('pollingInterval', interval);
  }

  public loadCurrentLockState = (lockId: string, glueLockAuth: string) => {
    if (!glueLockAuth) {
      this.error('Cannot load state: GlueLock authentication key not found');
      return;
    }

    // Arrange
    var options = {
      method: 'get',
      headers: {
        'Authorization': `Api-Key ${glueLockAuth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    // Act
    axios.get(`https://user-api.gluehome.com/v1/locks/${lockId}`, options)
      .then((response) => {
        var lockJson = response.data;
        
        // Determine lock state based on firmware version
        let deviceIsLocked: boolean;
        
        if (this.isFirmwareCompatible) {
          // For firmware 2.5+, properly handle all event types
          const eventType = lockJson.lastLockEvent.eventType.toLowerCase();
          deviceIsLocked = ['remotelock', 'manuallock', 'locallock'].includes(eventType);
          
          this.log(`Lock event (Firmware ${this.firmwareVersion}):`, eventType, deviceIsLocked ? 'locked' : 'unlocked');
        } else {
          // Legacy behavior for older firmware
          deviceIsLocked = !(lockJson.lastLockEvent.eventType + "").toLowerCase().includes("unlock");
          this.log(`Lock event (Legacy Firmware ${this.firmwareVersion}):`, lockJson.lastLockEvent.eventType);
        }

        this.log("Lock state", lockJson.batteryStatus, lockJson.connectionStatus, lockJson.lastLockEvent, deviceIsLocked);

        this.setCapabilityValue("measure_battery", lockJson.batteryStatus);
        this.setCapabilityValue("locked", deviceIsLocked);
      })
      .catch((error) => {
        this.error("Failed to load lock state:", error);
      });
  }

  public sendActionToDevice = (lockId: string, glueLockAuth: string, lock: boolean) => {
    if (!glueLockAuth) {
      this.error('Cannot send action: GlueLock authentication key not found');
      return;
    }

    // Arrange
    var options = {
      method: 'post',
      headers: {
        'Authorization': `Api-Key ${glueLockAuth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    var body = {
      "type": lock ? "lock" : "unlock"
    };

    this.log("Action taken", "LOCK", lock);

    // Act
    axios.post(`https://user-api.gluehome.com/v1/locks/${lockId}/operations`, body, options)
      .then((response) => {
        this.log("Command sent", response.data);
      })
      .catch((error) => {
        this.error("Failed to send command:", error);
      });
  }
}

module.exports = GlueDevice;
