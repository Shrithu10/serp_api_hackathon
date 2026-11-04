'use strict';
// Runs the agent without Electron (no screen capture / tray). Handy for servers, Linux dev boxes and tests.
//   node src/headless.js --relay http://localhost:8787 [--data ./pm-data]
const path = require('path');
const os = require('os');
const { Agent } = require('./core/agent');
const { WindowsProvider } = require('./core/providers/windows');
const { GenericProvider } = require('./core/providers/generic');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };

(async () => {
  const agent = new Agent({
    dataDir: path.resolve(arg('data', path.join(os.homedir(), '.pocketmonitor'))),
    provider: process.platform === 'win32' ? new WindowsProvider() : new GenericProvider(),
  });
  await agent.init();
  if (arg('relay')) agent.settings.set('relayUrl', arg('relay'));
  await agent.start();
  const show = () => {
    const s = agent.getUIState();
    console.log(`[pocketmonitor] relay: ${s.relay.connected ? 'connected' : 'connecting…'}  paired: ${s.paired}`);
    if (s.pairing) console.log('Open this on your phone to pair:\n  ' + s.pairing.url);
  };
  agent.on('paired', () => console.log('[pocketmonitor] phone paired'));
  setTimeout(show, 1500);
  process.on('SIGINT', async () => { await agent.stop(); process.exit(0); });
})();
