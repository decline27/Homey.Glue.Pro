export const CONFIG = {
  API: {
    BASE_URL: 'https://user-api.gluehome.com',
    VERSION: 'v1',
    ENDPOINTS: {
      LOCKS: '/locks',
      OPERATIONS: '/operations'
    },
    RETRY: {
      MAX_ATTEMPTS: 3,
      INITIAL_DELAY: 1000,
      MAX_DELAY: 10000
    }
  },
  POLLING: {
    DEFAULT_INTERVAL: 20,
    MIN_INTERVAL: 1,
    MAX_INTERVAL: 60
  },
  FIRMWARE: {
    COMPATIBLE_VERSION: 2.5
  }
};

export const EVENT_TYPES = {
  LOCK: ['remotelock', 'manuallock', 'locallock'],
  UNLOCK: ['remoteunlock', 'manualunlock', 'localunlock']
} as const;
