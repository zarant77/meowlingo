import assert from 'node:assert/strict';
import test from 'node:test';
import { advertiseDesktop, serviceDescription, SERVICE_TYPE } from '../src/discovery/advertiser.js';

test('advertises the protocol marker, configured port and stable desktop identity', () => {
  const service = serviceDescription(8765, 'My-Mac.local');
  assert.equal(SERVICE_TYPE, 'meowlingo');
  assert.equal(service.type, SERVICE_TYPE);
  assert.equal(service.protocol, 'tcp');
  assert.equal(service.port, 8765);
  assert.equal(service.txt.app, 'meowlingo');
  assert.equal(service.txt.version, '1');
  assert.match(service.txt.id, /^[a-f0-9]{24}$/);
  assert.deepEqual(service, serviceDescription(8765, 'My-Mac.local'));
  assert.notEqual(service.txt.id, serviceDescription(8766, 'My-Mac.local').txt.id);
  assert.notEqual(service.txt.id, serviceDescription(8765, 'Another-PC').txt.id);
  assert.equal(service.disableIPv6, true);
  assert(Buffer.byteLength(service.name) <= 63);
});

test('disabling discovery or binding loopback does not open a multicast service', async () => {
  const disabled = advertiseDesktop('0.0.0.0', 8765, false);
  const loopback = advertiseDesktop('127.0.0.1', 8765);
  await disabled.stop(); await disabled.stop(); await loopback.stop();
});

 test('broadcast discovery returns the same identity and configured WebSocket port', async t => {
  const { startBroadcastDiscovery, DISCOVERY_REQUEST } = await import('../src/discovery/broadcast.js');
  const { createSocket } = await import('node:dgram');
  const { once } = await import('node:events');
  const service = serviceDescription(9876, 'Test-PC');
  const discovery = startBroadcastDiscovery(service, 0);
  const client = createSocket('udp4');
  t.after(() => { client.close(); discovery.stop(); });
  await once(discovery.socket, 'listening');
  client.bind(0); await once(client, 'listening');
  const received = once(client, 'message', { signal: AbortSignal.timeout(2000) });
  client.send(DISCOVERY_REQUEST, discovery.socket.address().port, '127.0.0.1');
  const [data] = await received;
  assert.deepEqual(JSON.parse(data.toString()), { app: 'meowlingo', version: '1', id: service.txt.id, name: service.name, port: 9876 });
});
