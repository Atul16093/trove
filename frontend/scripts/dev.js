const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

function lanIp() {
  const nets = os.networkInterfaces();
  for (const addrs of Object.values(nets)) {
    for (const net of addrs || []) {
      const family = typeof net.family === 'string' ? net.family : String(net.family);
      if ((family === 'IPv4' || family === '4') && !net.internal) return net.address;
    }
  }
  return null;
}

const ip = lanIp();

// Bind every interface rather than just the LAN IP. Binding a single address
// means that address is the ONLY one that answers, which is why localhost:3000
// used to refuse connections while the phone URL worked. 0.0.0.0 serves both.
const env = {
  ...process.env,
  // The phone can't reach the laptop's "localhost", so point the API at the LAN
  // IP when we have one — the laptop can reach that address too.
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL || `http://${ip || 'localhost'}:4000/api`,
};

const nextBin = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '0.0.0.0'], {
  stdio: 'inherit',
  env,
  cwd: path.join(__dirname, '..'),
});

setTimeout(() => {
  console.log(`\n  On this machine:                 http://localhost:3000`);
  // No Wi-Fi is no longer fatal — localhost still works, only phone testing is out.
  if (ip) console.log(`  On your phone (same Wi-Fi):      http://${ip}:3000\n`);
  else console.log(`  No LAN IPv4 found — phone testing unavailable until you're on Wi-Fi.\n`);
}, 2000);

child.on('exit', (code) => process.exit(code ?? 0));
