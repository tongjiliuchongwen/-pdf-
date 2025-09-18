
export enum ProcessingStatus {
  IDLE = 'idle',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface SummaryResult {
  id: string;
  fileName: string;
  content: string;
  status: ProcessingStatus;
  error?: string;
}
