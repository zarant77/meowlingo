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
