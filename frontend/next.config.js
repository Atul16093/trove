const os = require('os');

function lanIp() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const net of addrs || []) {
      const family = typeof net.family === 'string' ? net.family : String(net.family);
      if ((family === 'IPv4' || family === '4') && !net.internal) return net.address;
    }
  }
  return null;
}

const ip = lanIp();

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  ...(ip ? { allowedDevOrigins: [ip] } : {}),
};
