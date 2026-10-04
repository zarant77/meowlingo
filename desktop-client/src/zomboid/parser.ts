import type { IncomingChatMessage } from '../types/index.js';

// Based on actual client chat logs; greedy text capture preserves apostrophes in messages.
const received = /^\[(\d{2})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})\]\[info\] Got message from server: ChatMessage\{chat=(.*?), author='(.*?)', text='(.*)'\}\.?\s*$/;

export function parseLogLine(line: string): IncomingChatMessage | null {
  const match = received.exec(line);
  if (!match) return null;
  const [, day, month, year, hour, minute, second, millisecond, channel, author, raw] = match;
  const date = new Date(2000 + Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(millisecond));
  if (Number.isNaN(date.getTime())) return null;
  // Remove only known game formatting, leaving arbitrary player text intact.
  const text = raw!.replace(/<RGB:[^>]*>/gi, '').replace(/<SPACE>/gi, ' ').replace(/<LINE>/gi, '\n').trim();
  if (!text || !author?.trim() || !channel?.trim()) return null;
  return { author: author.trim(), channel: channel.trim(), text, timestamp: date.toISOString() };
}
