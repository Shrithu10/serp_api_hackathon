// Keeps the single shared crypto module identical in the phone app and the agent.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'shared/pmcrypto.js'));
for (const dst of ['relay/public/pmcrypto.js', 'agent/src/core/pmcrypto.js']) fs.writeFileSync(path.join(root, dst), src);
console.log('synced shared/pmcrypto.js');
