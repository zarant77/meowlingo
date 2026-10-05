export interface IncomingChatMessage {
  replayed?: boolean;
  author: string;
  text: string;
  channel?: string;
  timestamp?: string;
}
export interface ChatSource {
  start(onMessage: (message: IncomingChatMessage) => void): Promise<void>;
  stop(): Promise<void>;
}
export interface SourceStatus {
  status: 'source_waiting' | 'source_watching' | 'source_error';
  message: string;
}
