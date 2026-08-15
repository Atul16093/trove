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
if (!ip) {
  console.error('No LAN IPv4 address found. Connect to Wi-Fi and try again.');
  process.exit(1);
}

const env = {
  ...process.env,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || `http://${ip}:4000/api`,
};

const nextBin = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', ip], {
  stdio: 'inherit',
  env,
  cwd: path.join(__dirname, '..'),
});

setTimeout(() => {
  console.log(`\n  Open on your phone (same Wi-Fi): http://${ip}:3000\n`);
}, 2000);

child.on('exit', (code) => process.exit(code ?? 0));
