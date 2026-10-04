import type { ContextExplainer } from '../translation/contextExplainer.js';
import { channelCommand, type GameSender, type GameSendResult } from '../zomboid/gameSender.js';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { Translator } from '../translation/translator.js';
import type { CopyText } from '../clipboard/clipboard.js';
import type { IncomingChatMessage, SourceStatus } from '../types/index.js';
import { clientMessageSchema, messageIdSchema, type ServerMessage } from './protocol.js';
export function createServer(host: string, port: number, translator: Translator, copy: CopyText, gameSender?: GameSender, historyLimit = 10, explain?: ContextExplainer) {
  const explanations = new Map<string, Promise<string>>();
  const history: Extract<ServerMessage, { type: 'chat' }>[] = [];
  let sourceStatus: SourceStatus | undefined;
  let chatQueue = Promise.resolve();
  const server = new WebSocketServer({ host, port, maxPayload: 16384 });
  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  // Serialize replies across clients so clipboard writes finish in arrival order.
  let replyQueue = Promise.resolve();
  server.on('connection', (socket, request) => {
    console.log(`Client connected: ${request.socket.remoteAddress}`);
    send(socket, { type: 'status', status: 'connected', historyLimit, message: 'MeowLingo desktop ready' });
    if (sourceStatus) send(socket, { type: 'status', ...sourceStatus });
    for (const chat of history.slice(-historyLimit)) send(socket, { ...chat, replayed: true });
    socket.on('close', () => console.log('Client disconnected'));
    socket.on('error', (error) => console.error('Client error:', error.message));
    socket.on('message', (raw, isBinary) => {
      let message: ReturnType<typeof clientMessageSchema.parse>;
      let parsed: unknown;
      try {
        if (isBinary) throw new Error('Text frames required');
        parsed = JSON.parse(raw.toString());
        message = clientMessageSchema.parse(parsed);
      } catch {
        const id = messageIdSchema.safeParse(parsed);
        send(socket, { type: 'error', code: 'invalid_message', message: 'Expected a valid reply, explain or ping JSON message.', ...(id.success ? { id: id.data.id } : {}) });
        return;
      }
      if (message.type === 'ping') { send(socket, { type: 'pong' }); return; }
      if (message.type === 'explain') {
        const index = history.findIndex(chat => chat.id === message.id);
        if (index < 0 || !explain) {
          send(socket, { type: 'explanation', id: message.id, error: index < 0 ? 'This message is no longer available on the desktop.' : 'Context explanation is unavailable.' });
          return;
        }
        let pending = explanations.get(message.id);
        if (!pending) {
          const previous = history.slice(Math.max(0, index - 5), index);
          const target = history[index];
          pending = Promise.resolve().then(() => explain(target, previous));
          explanations.set(message.id, pending);
          void pending.catch(() => { explanations.delete(message.id); });
        }
        void pending.then(explanation => send(socket, { type: 'explanation', id: message.id, explanation }),
          error => send(socket, { type: 'explanation', id: message.id, error: error instanceof Error ? error.message : 'Context explanation failed.' }));
        return;
      }
      const reply = message;
      console.log(`[${new Date().toISOString()}] Reply received from Android: ${JSON.stringify({ id: reply.id, channel: reply.channel ?? 'General', text: reply.text })}`);
      replyQueue = replyQueue.then(async () => {
        let copiedToClipboard = false;
        let translated = reply.text;
        const translationStarted = Date.now();
        console.log(`Reply ${reply.id}: translating to English; clipboard will update when translation finishes.`);
        try { translated = await translator.translateToEnglish(reply.text); }
        catch { console.error('Reply translation failed; returning original text.'); }
        console.log(`Reply ${reply.id}: translation finished in ${Date.now() - translationStarted}ms.`);
        const baseCommand = channelCommand(reply.channel ?? 'Local');
        const command = reply.channel === 'Whisper' ? (reply.recipient ? `/whisper "${reply.recipient}"` : undefined) : baseCommand;
        const clipboardText = gameSender && command ? `${command} ${translated}` : translated;
        let result: GameSendResult = { gameSendStatus: 'disabled' };
        try {
          await copy(clipboardText);
          copiedToClipboard = true;
          console.log(`Reply ${reply.id}: clipboard write completed: ${JSON.stringify(clipboardText)}`);
        }
        catch (error) { console.error('Clipboard write failed:', error); }
        if (copiedToClipboard && gameSender) {
          if (!command || /[\r\n]/.test(translated)) result = { gameSendStatus: 'unsupported_channel', gameSendMessage: !command ? `Unsupported channel: ${reply.channel}` : 'Multiline replies require manual pasting.' };
          else {
            try { result = await gameSender(clipboardText); }
            catch (error) { result = { gameSendStatus: 'failed', gameSendMessage: error instanceof Error ? error.message : String(error) }; }
          }
        }
        console.log(`[${new Date().toISOString()}] Reply delivery: ${JSON.stringify({ id: reply.id, copiedToClipboard, ...result })}`);
        send(socket, { type: 'reply_ready', ...result, id: reply.id, original: reply.text, translated, copiedToClipboard });
      });
    });
  });
  return {
    server,
    setSourceStatus(status: SourceStatus) {
      sourceStatus = status;
      for (const socket of server.clients) send(socket, { type: 'status', ...status });
    },
    broadcastChat(message: IncomingChatMessage): Promise<void> {
      const job = chatQueue.then(async () => {
        const chat: Extract<ServerMessage, { type: 'chat' }> = { type: 'chat', id: randomUUID(), timestamp: message.timestamp ?? new Date().toISOString(),
          author: message.author, channel: message.channel ?? 'General', original: message.text,
          translated: await translator.translateToUkrainian(message.text) };
        history.push(chat);
        if (history.length > Math.max(200, historyLimit)) { const removed = history.shift(); if (removed) explanations.delete(removed.id); }
        for (const socket of server.clients) send(socket, chat);
      });
      chatQueue = job.catch(() => {});
      return job;
    },
    async close() {
      await replyQueue;
      await chatQueue;
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
