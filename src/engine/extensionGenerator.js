const fs = require('fs');
const path = require('path');

function generateExtension(profile, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fp = profile.fingerprint || {};
  const webgl = fp.webgl || {};
  const screen = fp.screen || {};

  const manifest = {
    manifest_version: 3,
    name: `PB_Stealth_${profile.id}`,
    version: '1.0.0',
    description: 'Hardware and Fingerprint Shield for PowerBrowser',
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['stealth.js'],
        run_at: 'document_start',
        world: 'MAIN',
        all_frames: true
      }
    ]
  };

  const stealthScript = `
(function() {
  'use strict';

  // --- Utility to make native functions look authentic ---
  const nativeToString = Function.prototype.toString;
  const overriddenFunctions = new Map();

  function makeNative(fn, name) {
    overriddenFunctions.set(fn, \`function \${name || fn.name}() { [native code] }\`);
    return fn;
  }

  Function.prototype.toString = function() {
    if (overriddenFunctions.has(this)) {
      return overriddenFunctions.get(this);
    }
    return nativeToString.call(this);
  };
  makeNative(Function.prototype.toString, 'toString');

  // --- 1. Remove Automation & Webdriver Flags ---
  try {
    delete Object.getPrototypeOf(navigator).webdriver;
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
      enumerable: false
    });
  } catch (e) {}

  // --- 2. Hardware & Platform Spoofing ---
  try {
    Object.defineProperty(navigator, 'platform', {
      get: () => '${fp.platform || 'Win32'}',
      configurable: true
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => ${fp.hardwareConcurrency || 8},
      configurable: true
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => ${fp.deviceMemory || 8},
      configurable: true
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ${JSON.stringify(fp.languages || ['vi-VN', 'vi', 'en-US', 'en'])},
      configurable: true
    });
    Object.defineProperty(navigator, 'language', {
      get: () => '${(fp.languages && fp.languages[0]) || 'vi-VN'}',
      configurable: true
    });
  } catch (e) {}

  // --- 3. Screen Dimension Spoofing ---
  try {
    const screenOverrides = {
      width: ${screen.width || 1920},
      height: ${screen.height || 1080},
      availWidth: ${screen.availWidth || 1920},
      availHeight: ${screen.availHeight || 1040},
      colorDepth: ${screen.colorDepth || 24},
      pixelDepth: ${screen.pixelDepth || 24}
    };
    for (const [prop, val] of Object.entries(screenOverrides)) {
      Object.defineProperty(window.screen, prop, {
        get: () => val,
        configurable: true
      });
    }
  } catch (e) {}

  // --- 4. WebGL Vendor & Renderer Spoofing ---
  try {
    const unmaskedVendor = '${webgl.unmaskedVendor || 'NVIDIA Corporation'}';
    const unmaskedRenderer = '${webgl.unmaskedRenderer || 'NVIDIA GeForce RTX 3060/PCIe/SSE2'}';
    const vendor = '${webgl.vendor || 'Google Inc. (NVIDIA)'}';
    const renderer = '${webgl.renderer || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'}';

    function patchWebGL(proto) {
      if (!proto) return;
      const originalGetParameter = proto.getParameter;
      proto.getParameter = function(param) {
        if (param === 0x9245) return unmaskedVendor;      // UNMASKED_VENDOR_WEBGL
        if (param === 0x9246) return unmaskedRenderer;    // UNMASKED_RENDERER_WEBGL
        if (param === 0x1F00) return vendor;              // VENDOR
        if (param === 0x1F01) return renderer;            // RENDERER
        return originalGetParameter.call(this, param);
      };
      makeNative(proto.getParameter, 'getParameter');
    }

    if (window.WebGLRenderingContext) patchWebGL(WebGLRenderingContext.prototype);
    if (window.WebGL2RenderingContext) patchWebGL(WebGL2RenderingContext.prototype);
  } catch (e) {}

  // --- 5. Canvas Noise (Per-profile consistent micro-noise) ---
  try {
    const seed = ${fp.canvasNoiseSeed || 42};
    function pseudoRandom(x, y) {
      const val = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
      return (val - Math.floor(val));
    }

    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
      const imageData = origGetImageData.call(this, sx, sy, sw, sh);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const px = (i / 4) % sw;
        const py = Math.floor((i / 4) / sw);
        // Perturb R and B channels by at most +/- 1
        const noise = (pseudoRandom(px, py) > 0.5 ? 1 : -1);
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] - noise));
      }
      return imageData;
    };
    makeNative(CanvasRenderingContext2D.prototype.getImageData, 'getImageData');

    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, ...args) {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        try {
          ctx.getImageData(0, 0, Math.min(10, this.width), Math.min(10, this.height));
        } catch (e) {}
      }
      return origToDataURL.call(this, type, ...args);
    };
    makeNative(HTMLCanvasElement.prototype.toDataURL, 'toDataURL');
  } catch (e) {}

  // --- 6. WebAudio Noise (Subtle frequency perturbation) ---
  try {
    const audioSeed = ${fp.audioNoiseSeed || 99};
    if (window.AnalyserNode) {
      const origGetFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
      AnalyserNode.prototype.getFloatFrequencyData = function(array) {
        origGetFloatFreq.call(this, array);
        for (let i = 0; i < array.length; i += 8) {
          const shift = (Math.sin(i + audioSeed) * 0.05);
          array[i] += shift;
        }
      };
      makeNative(AnalyserNode.prototype.getFloatFrequencyData, 'getFloatFrequencyData');
    }
  } catch (e) {}

  // --- 7. WebRTC Leak Protection ---
  try {
    const webrtcMode = '${fp.webrtc || 'spoof'}';
    if (webrtcMode === 'disable') {
      delete window.RTCPeerConnection;
      delete window.webkitRTCPeerConnection;
    } else if (webrtcMode === 'spoof' && window.RTCPeerConnection) {
      const origCreateOffer = RTCPeerConnection.prototype.createOffer;
      RTCPeerConnection.prototype.createOffer = function(...args) {
        return origCreateOffer.apply(this, args).then(offer => {
          // Filter candidate lines with local IP
          offer.sdp = offer.sdp.replace(/a=candidate.*\\r\\n/g, '');
          return offer;
        });
      };
      makeNative(RTCPeerConnection.prototype.createOffer, 'createOffer');
    }
  } catch (e) {}

  // --- 8. Chrome Runtime Dummy ---
  if (!window.chrome) {
    window.chrome = {};
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      id: undefined,
      sendMessage: () => {},
      connect: () => ({ onMessage: { addListener: () => {} }, postMessage: () => {} })
    };
  }

})();
  `;

  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  fs.writeFileSync(path.join(outputDir, 'stealth.js'), stealthScript, 'utf-8');

  return outputDir;
}

module.exports = { generateExtension };
