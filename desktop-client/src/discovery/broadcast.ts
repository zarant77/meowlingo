import { createSocket } from 'node:dgram';
export const DISCOVERY_PORT = 8766;
export const DISCOVERY_REQUEST = 'MEOWLINGO_DISCOVER_V1';

export function startBroadcastDiscovery(description: { name: string; port: number; txt: { id: string } }, discoveryPort = DISCOVERY_PORT) {
  const socket = createSocket('udp4');
  socket.on('error', error => console.error('Broadcast discovery unavailable:', error.message));
  socket.on('message', (data, sender) => {
    if (data.toString() !== DISCOVERY_REQUEST) return;
    const response = JSON.stringify({ app: 'meowlingo', version: '1', id: description.txt.id, name: description.name, port: description.port });
    socket.send(response, sender.port, sender.address, error => {
      if (error) console.error('Broadcast discovery response failed:', error.message);
    });
  });
  socket.bind(discoveryPort, '0.0.0.0');
  return { socket, stop() { try { socket.close(); } catch { /* Socket may not have bound successfully. */ } } };
}
