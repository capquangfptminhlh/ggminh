/**
 * Realistic Fingerprint Generator Engine
 * Generates coherent device and browser fingerprints to prevent detection.
 */

const GPU_PROFILES = [
  {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    unmaskedVendor: 'NVIDIA Corporation',
    unmaskedRenderer: 'NVIDIA GeForce RTX 3060/PCIe/SSE2'
  },
  {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    unmaskedVendor: 'NVIDIA Corporation',
    unmaskedRenderer: 'NVIDIA GeForce RTX 4070/PCIe/SSE2'
  },
  {
    vendor: 'Google Inc. (Intel)',
    renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    unmaskedVendor: 'Intel Inc.',
    unmaskedRenderer: 'Intel(R) UHD Graphics 630'
  },
  {
    vendor: 'Google Inc. (Intel)',
    renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    unmaskedVendor: 'Intel Inc.',
    unmaskedRenderer: 'Intel(R) Iris(R) Xe Graphics'
  },
  {
    vendor: 'Google Inc. (AMD)',
    renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    unmaskedVendor: 'Advanced Micro Devices, Inc.',
    unmaskedRenderer: 'AMD Radeon RX 6700 XT'
  }
];

const SCREEN_RESOLUTIONS = [
  { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 },
  { width: 1920, height: 1080, availWidth: 1920, availHeight: 1050, colorDepth: 24 },
  { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400, colorDepth: 24 },
  { width: 1536, height: 864, availWidth: 1536, availHeight: 824, colorDepth: 24 },
  { width: 1440, height: 900, availWidth: 1440, availHeight: 860, colorDepth: 24 }
];

const CHROME_VERSIONS = [
  { full: '131.0.6778.205', major: '131' },
  { full: '132.0.6834.111', major: '132' },
  { full: '133.0.6943.98', major: '133' },
  { full: '134.0.7000.32', major: '134' }
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateFingerprint(options = {}) {
  // Native mode does not invent a UA, device model, GPU or Canvas identifier.
  if (options.mode === 'native') return {
    mode: 'native', userAgent: '', canvasNoiseSeed: 0,
    audioNoiseSeed: 0, webrtc: 'real'
  };
  const os = options.os || 'Windows';
  const chromeVer = getRandomItem(CHROME_VERSIONS);
  const gpu = getRandomItem(GPU_PROFILES);
  const screen = getRandomItem(SCREEN_RESOLUTIONS);

  let platform = 'Win32';
  let ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer.full} Safari/537.36`;
  let brands = [
    { brand: 'Chromium', version: chromeVer.major },
    { brand: 'Google Chrome', version: chromeVer.major },
    { brand: 'Not(A:Brand', version: '24' }
  ];

  if (os === 'macOS') {
    platform = 'MacIntel';
    ua = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer.full} Safari/537.36`;
  } else if (os === 'Linux') {
    platform = 'Linux x86_64';
    ua = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer.full} Safari/537.36`;
  }

  // Realistic hardware
  const hardwareConcurrency = options.hardwareConcurrency || getRandomItem([4, 8, 12, 16]);
  const deviceMemory = options.deviceMemory || getRandomItem([8, 16, 32]);

  return {
    os,
    platform,
    userAgent: options.userAgent || ua,
    chromeVersion: chromeVer.full,
    brands,
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.colorDepth,
      devicePixelRatio: 1
    },
    webgl: {
      vendor: gpu.vendor,
      renderer: gpu.renderer,
      unmaskedVendor: gpu.unmaskedVendor,
      unmaskedRenderer: gpu.unmaskedRenderer
    },
    hardwareConcurrency,
    deviceMemory,
    languages: options.languages || ['vi-VN', 'vi', 'en-US', 'en'],
    canvasNoiseSeed: Math.random() * 10000 + 1,
    audioNoiseSeed: Math.random() * 10000 + 1,
    webrtc: options.webrtc || 'spoof', // spoof, disable, real
    timezone: options.timezone || 'Asia/Ho_Chi_Minh',
    fontsNoise: true
  };
}

module.exports = {
  generateFingerprint,
  GPU_PROFILES,
  SCREEN_RESOLUTIONS,
  CHROME_VERSIONS
};
