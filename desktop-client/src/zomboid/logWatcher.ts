import { readdir, open, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { ChatSource, IncomingChatMessage, SourceStatus } from '../types/index.js';
import { parseLogLine } from './parser.js';

const messages: IncomingChatMessage[] = [
  { author: 'Hans', channel: 'General', text: 'Kann jemand helfen?' },
  { author: 'Alex', channel: 'Local', text: 'Zombies near the gas station!' },
  { author: 'Sam', channel: 'Safehouse', text: 'We have food at the safe house.' },
];
export class MockChatSource implements ChatSource {
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly intervalMs = 4000) {}
  async start(onMessage: (message: IncomingChatMessage) => void): Promise<void> {
    await this.stop();
    let index = 0;
    this.timer = setInterval(() => onMessage(messages[index++ % messages.length]!), this.intervalMs);
  }
  async stop(): Promise<void> { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
}

export interface LogSourceOptions {
  directory: string;
  pollIntervalMs?: number;
  readHistory?: boolean;
  initialHistoryCount?: number;
  onStatus?: (status: SourceStatus) => void;
}
export class ProjectZomboidLogSource implements ChatSource {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private inFlight?: Promise<void>;
  private file?: FileHandle;
  private activeName?: string;
  private newestName?: string;
  private identity?: string;
  private offset = 0;
  private decoder = new StringDecoder('utf8');
  private partial = '';
  private skipPartial = false;
  private firstSelection = true;
  private lastStatus = '';
  private onMessage?: (message: IncomingChatMessage) => void;
  constructor(private readonly options: LogSourceOptions) {}

  async start(onMessage: (message: IncomingChatMessage) => void): Promise<void> {
    await this.stop();
    this.stopped = false;
    this.onMessage = onMessage;
    this.firstSelection = true;
    this.newestName = undefined;
    await this.tick();
  }
  private status(status: SourceStatus['status'], message: string) {
    if (this.lastStatus === `${status}:${message}`) return;
    this.lastStatus = `${status}:${message}`;
    this.options.onStatus?.({ status, message });
  }
  private async tick(): Promise<void> {
    this.inFlight = this.poll().catch(error => {
      this.status('source_error', `Log reader: ${error instanceof Error ? error.message : String(error)}`);
    });
    await this.inFlight;
    if (!this.stopped) this.timer = setTimeout(() => { void this.tick(); }, this.options.pollIntervalMs ?? 750);
  }
  private resetText() { this.decoder = new StringDecoder('utf8'); this.partial = ''; this.skipPartial = false; }
  private async select(name: string) {
    await this.file?.close();
    this.file = undefined;
    this.activeName = undefined;
    const file = await open(join(this.options.directory, name), 'r');
    this.file = file;
    const info = await file.stat();
    this.activeName = name;
    this.identity = `${info.dev}:${info.ino}:${info.birthtimeMs}`;
    this.newestName = name;
    this.resetText();
    this.offset = this.firstSelection && !this.options.readHistory ? info.size : 0;
    if (this.offset > 0) {
      const end = Buffer.alloc(1);
      await file.read(end, 0, 1, this.offset - 1);
      this.skipPartial = end[0] !== 10;
    }
    if (this.firstSelection && !this.options.readHistory && (this.options.initialHistoryCount ?? 0) > 0) {
      await this.readRecent(file, info.size, this.options.initialHistoryCount!);
    }
    this.firstSelection = false;
    this.status('source_watching', `Watching ${name}`);
  }
  private async readRecent(file: FileHandle, size: number, count: number) {
    let position = size;
    let carry = Buffer.alloc(0);
    const recent: IncomingChatMessage[] = [];
    let first = true;
    while (position > 0 && recent.length < count && !this.stopped) {
      const length = Math.min(position, 64 * 1024);
      position -= length;
      const chunk = Buffer.alloc(length);
      const { bytesRead } = await file.read(chunk, 0, length, position);
      let data = Buffer.concat([chunk.subarray(0, bytesRead), carry]);
      if (first) { data = data.subarray(0, data.lastIndexOf(10) + 1); first = false; }
      let end = data.length;
      for (let i = data.length - 1; i >= 0 && recent.length < count; i--) {
        if (data[i] !== 10) continue;
        const message = parseLogLine(data.subarray(i + 1, end).toString('utf8').replace(/\r$/, ''));
        if (message) recent.push(message);
        end = i;
      }
      carry = data.subarray(0, end);
    }
    if (position === 0 && recent.length < count) {
      const message = parseLogLine(carry.toString('utf8').replace(/\r$/, ''));
      if (message) recent.push(message);
    }
    for (const message of recent.reverse()) this.onMessage?.(message);
    console.log(`Loaded ${recent.length} recent chat messages from log.`);
  }
  private async poll() {
    if (this.stopped) return;
    let entries;
    try { entries = await readdir(this.options.directory, { withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.firstSelection = false;
      this.status('source_waiting', `Waiting for log directory: ${this.options.directory}`);
      return;
    }
    const names = entries.filter(entry => entry.isFile() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}_client chat .+\.txt$/i.test(entry.name))
      .map(entry => entry.name).sort();
    const newest = names.at(-1);
    if (this.file) await this.readAppended();
    if (newest && (!this.newestName || newest > this.newestName || newest === this.newestName && !this.file)) {
      await this.select(newest);
      await this.readAppended();
    } else if (!newest) {
      this.firstSelection = false;
      this.status('source_waiting', 'Waiting for a Project Zomboid client chat log. Join a multiplayer game.');
    } else if (this.activeName && names.includes(this.activeName)) {
      // Reopen files replaced in place; truncate handling happens in readAppended.
      const current = await open(join(this.options.directory, this.activeName), 'r');
      try {
        const info = await current.stat();
        if (`${info.dev}:${info.ino}:${info.birthtimeMs}` !== this.identity) {
          await this.select(this.activeName);
          await this.readAppended();
        }
      } finally { await current.close(); }
      this.status('source_watching', `Watching ${this.activeName}`);
    }
  }
  private async readAppended() {
    if (!this.file || this.stopped) return;
    const info = await this.file.stat();
    if (info.size < this.offset) { this.offset = 0; this.resetText(); }
    const end = Math.min(info.size, this.offset + 1024 * 1024);
    const buffer = Buffer.alloc(64 * 1024);
    while (this.offset < end && !this.stopped) {
      const { bytesRead } = await this.file.read(buffer, 0, Math.min(buffer.length, end - this.offset), this.offset);
      if (!bytesRead) break;
      this.offset += bytesRead;
      this.partial += this.decoder.write(buffer.subarray(0, bytesRead));
      let newline;
      while ((newline = this.partial.indexOf('\n')) !== -1) {
        const line = this.partial.slice(0, newline).replace(/\r$/, '');
        this.partial = this.partial.slice(newline + 1);
        if (this.skipPartial) { this.skipPartial = false; continue; }
        const message = parseLogLine(line);
        if (message) this.onMessage?.(message);
      }
      // Discard pathological unterminated lines rather than growing memory indefinitely.
      if (this.partial.length > 256 * 1024) { this.partial = ''; this.skipPartial = true; }
    }
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.inFlight;
    await this.file?.close();
    this.file = undefined;
    this.activeName = undefined;
    this.lastStatus = '';
    this.resetText();
  }
}
