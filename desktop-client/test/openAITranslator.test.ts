import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAITranslator } from '../src/translation/openAITranslator.js';
import { createTranslator } from '../src/translation/createTranslator.js';

test('uses Responses API for both directions and preserves original on empty or unavailable responses', async () => {
  const requests: any[] = [];
  const fakeFetch: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ object: 'response', status: 'completed', output: [{ type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: requests.length === 1 ? 'Привіт Zarius, Muldraugh 42 https://example.com' : 'Ready Zarius' }] }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const translator = new OpenAITranslator('test-placeholder', 'gpt-6-luna', { fetch: fakeFetch });
  assert.equal(await translator.translateToUkrainian('Hi Zarius, Muldraugh 42 https://example.com'), 'Привіт Zarius, Muldraugh 42 https://example.com');
  assert.equal(await translator.translateToEnglish('Готово Zarius'), 'Ready Zarius');
  assert.match(requests[0].instructions, /Ukrainian/);
  assert.match(requests[1].instructions, /English/);
  assert.equal(requests[0].model, 'gpt-6-luna');
  assert.equal(requests[0].store, false);
  const unavailable = new OpenAITranslator('test-placeholder', 'gpt-6-luna', {
    fetch: async () => new Response(JSON.stringify({error:{message:'Unavailable',type:'invalid_request_error'}}), {status:401,headers:{'Content-Type':'application/json'}}),
  });
  assert.equal(await unavailable.translateToEnglish('оригінал'), 'оригінал');
  await assert.rejects(unavailable.translateToUkrainianForCache('original'), /cache entry skipped/);
  const empty = new OpenAITranslator('test-placeholder', 'gpt-6-luna', {
    fetch: async () => new Response(JSON.stringify({object:'response',status:'incomplete',output:[]}), {status:200,headers:{'Content-Type':'application/json'}}),
  });
  assert.equal(await empty.translateToUkrainian('original'), 'original');
  assert.equal(await createTranslator('openai', undefined, 'gpt-6-luna').translateToEnglish('original'), 'original');
});
