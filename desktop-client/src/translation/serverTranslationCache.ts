import type { ContextExplainer, ContextMessage } from './contextExplainer.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IncomingChatMessage } from '../types/index.js';

export function isServerMessage(message: Pick<IncomingChatMessage, 'author' | 'channel'>): boolean {
  return message.author === 'Server' && (message.channel === 'Server' || message.channel === 'Сервер');
}

export class ServerTranslationCache {
  private readonly database: DatabaseSync;
  private readonly pending = new Map<string, Promise<string>>();
  private generation = 0;

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.database = new DatabaseSync(file);
    this.database.exec(`CREATE TABLE IF NOT EXISTS server_messages (
      original TEXT PRIMARY KEY NOT NULL,
      translation TEXT,
      explanation TEXT
    )`);
    // Preserve translations from the previous schema. Hashed explanations cannot be mapped back.
    const legacy = this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'translations'").get();
    this.database.exec('BEGIN');
    try {
      if (legacy) this.database.exec(`INSERT OR IGNORE INTO server_messages (original, translation)
        SELECT original, translated FROM translations ORDER BY rowid DESC`);
      this.database.exec('DROP TABLE IF EXISTS translations; DROP TABLE IF EXISTS explanations; COMMIT;');
    } catch (error) { this.database.exec('ROLLBACK'); this.database.close(); throw error; }

  }

  async translate(message: Pick<IncomingChatMessage, 'author' | 'channel' | 'text'>, translate: (text: string) => Promise<string>): Promise<string> {
    if (!isServerMessage(message)) return translate(message.text);
    return this.cached('translation', message.text, () => translate(message.text));
  }

  explain(message: ContextMessage, previous: ContextMessage[], explain: ContextExplainer): Promise<string> {
    if (!isServerMessage(message)) return explain(message, previous);
    return this.cached('explanation', message.original, () => explain(message, previous));
  }

  private async cached(column: 'translation' | 'explanation', original: string, request: () => Promise<string>): Promise<string> {
    try {
      const row = this.database.prepare(`SELECT ${column} AS result FROM server_messages WHERE original = ?`).get(original);
      if (typeof row?.result === 'string' && row.result.trim()) return row.result;
    } catch { console.error('Server message cache read failed; requesting OpenAI.'); }
    const pendingKey = JSON.stringify([column, original]);
    const existing = this.pending.get(pendingKey);
    if (existing) return existing;
    const generation = this.generation;
    const job = Promise.resolve().then(request).then(result => {
      if (generation === this.generation && result.trim()) {
        try {
          this.database.prepare(`INSERT INTO server_messages (original, ${column}) VALUES (?, ?)
              ON CONFLICT(original) DO UPDATE SET ${column} = excluded.${column}`)
            .run(original, result);
        } catch { console.error('Server message cache write failed; keeping response.'); }
      }
      return result;
    });
    this.pending.set(pendingKey, job);
    try { return await job; }
    finally { if (this.pending.get(pendingKey) === job) this.pending.delete(pendingKey); }
  }

  clear(): void {
    this.database.exec('DELETE FROM server_messages;');
    this.generation++;
    this.pending.clear();
    this.database.exec('VACUUM');
  }
  close(): void { this.database.close(); }
}
