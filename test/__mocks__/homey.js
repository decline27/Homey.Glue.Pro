// Mock implementation of the Homey module
const Homey = {
  Device: class MockDevice {
    log = jest.fn();
    error = jest.fn();
    getData = jest.fn();
    getSettings = jest.fn();
    getSetting = jest.fn();
    setCapabilityValue = jest.fn().mockResolvedValue(undefined);
    registerCapabilityListener = jest.fn();
    homey = {
      settings: {
        get: jest.fn()
      }
    };
  },
  Driver: class MockDriver {
    log = jest.fn();
    error = jest.fn();
    homey = {
      settings: {
        get: jest.fn()
      }
    };
  }
};

module.exports = Homey;
module.exports.default = Homey;