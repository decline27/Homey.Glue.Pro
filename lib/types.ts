export interface LockEvent {
  eventType: string;
  timestamp: string;
  source?: string;
}

export interface LockStatus {
  id: string;
  description: string;
  batteryStatus: number;
  connectionStatus: string;
  firmwareVersion: string;
  lastLockEvent: LockEvent;
}

export interface LockOperation {
  type: 'lock' | 'unlock';
  timestamp?: string;
}

export interface ApiError extends Error {
  code?: string;
  response?: {
    status: number;
    data: any;
  };
}
