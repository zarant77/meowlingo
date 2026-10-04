import type { GameSendResult } from '../zomboid/gameSender.js';
import type { SourceStatus } from '../types/index.js';
import { z } from 'zod';
export const replySchema = z.object({ type: z.literal('reply'), id: z.string().uuid(), text: z.string().min(1).max(4000).refine(text => text.trim().length > 0, "Reply text must not be blank"), recipient: z.string().trim().min(1).max(100).regex(/^[^"\r\n]+$/).optional(), channel: z.string().trim().min(1).max(100).optional() }).strict();
export const clientMessageSchema = z.preprocess(value => {
  // Older Android builds omitted the default discriminator during serialization.
  if (value && typeof value === 'object' && !Array.isArray(value) && !('type' in value) && 'text' in value) {
    return { ...value, type: 'reply' };
  }
  return value;
}, z.discriminatedUnion('type', [z.object({ type: z.literal('explain'), id: z.string().uuid() }).strict(), replySchema, z.object({ type: z.literal('ping') }).strict()]));
export const messageIdSchema = z.object({ id: z.string().uuid() });
export type ServerMessage =
  | { type: 'chat'; id: string; timestamp: string; author: string; channel: string; original: string; translated: string; replayed?: boolean }
  | (GameSendResult & { type: 'reply_ready'; id: string; original: string; translated: string; copiedToClipboard: boolean })
  | { type: 'status'; status: 'connected'; historyLimit?: number; message: string }
  | ({ type: 'status' } & SourceStatus)
  | { type: 'explanation'; id: string; explanation?: string; error?: string }
  | { type: 'pong' }
  | { type: 'error'; code: string; message: string; id?: string };
