import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextExplainer } from '../src/translation/contextExplainer.js';

test('context explainer sends originals separately from instructions and handles missing keys', async () => {
  const explain = createContextExplainer('test-placeholder', 'gpt-6-luna', { fetch: async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, 'gpt-6-luna');
    assert.equal(request.store, false);
    assert.match(request.instructions, /Ukrainian/);
    assert.match(request.instructions, /probable/);
    assert.match(request.instructions, /Do not repeat the translation/);
    assert.equal(JSON.parse(request.input).message.original, 'brb');
    return new Response(JSON.stringify({object:'response', status:'completed', output:[{type:'message', role:'assistant',
      content:[{type:'output_text', text:'brb — скоро повернуся.'}]}]}),
      {headers:{'Content-Type':'application/json'}});
  }});
  assert.equal(await explain({author:'Player', channel:'Local', original:'brb'}, []), 'brb — скоро повернуся.');
  await assert.rejects(createContextExplainer(undefined, 'gpt-6-luna')({author:'Player', channel:'Local', original:'brb'}, []), /API key/);
});
