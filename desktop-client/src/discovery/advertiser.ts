import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { Bonjour, type Service } from 'bonjour-service';

export const SERVICE_TYPE = 'meowlingo';
export function serviceDescription(port: number, computerName = hostname()) {
  const id = createHash('sha256').update(`${computerName}:${port}`).digest('hex').slice(0, 24);
  const label = computerName.replace(/\.local$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 30) || 'Desktop';
  return {
    name: `MeowLingo-${label}-${port}`,
    type: SERVICE_TYPE,
    host: `meowlingo-${id}.local`,
    protocol: 'tcp' as const,
    port,
    txt: { app: 'meowlingo', version: '1', id },
    disableIPv6: true,
  };
}

export function advertiseDesktop(host: string, port: number, enabled = true) {
  let bonjour: Bonjour | undefined;
  let service: Service | undefined;
  if (!enabled || !['0.0.0.0', '::'].includes(host)) {
    console.log('LAN discovery disabled. Use a manual address (discovery requires a wildcard host).');
  } else {
    try {
      bonjour = new Bonjour({}, (error: Error) => console.error('LAN discovery error (manual connection remains available):', error.message));
      service = bonjour.publish(serviceDescription(port));
      service.on('up', () => console.log(`LAN discovery ready: ${service?.name} (_${SERVICE_TYPE}._tcp)`));
      service.on('error', error => console.error('LAN advertisement failed:', error));
    } catch (error) {
      console.error('Could not start LAN discovery; manual connection remains available:', error);
      bonjour?.destroy();
      bonjour = undefined;
    }
  }
  let stopped = false;
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      if (!bonjour) return;
      const instance = bonjour;
      // Give the goodbye announcement time to complete, but never block shutdown indefinitely.
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 1000);
        instance.unpublishAll(() => { clearTimeout(timeout); resolve(); });
      });
      instance.destroy();
    },
  };
}
