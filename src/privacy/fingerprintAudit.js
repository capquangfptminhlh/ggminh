/**
 * Honest configuration diagnostics. This is NOT an anti-detection score.
 * It cannot observe Chrome's actual network headers or Google account signals.
 */
function inspectFingerprint({ engine = 'chromium', fingerprint = {} } = {}) {
  const fp = fingerprint && typeof fingerprint === 'object' ? fingerprint : {};
  const mode = fp.mode === 'native' ? 'native' : 'experimental';
  const issues = [];
  const push = (level, code, message) => issues.push({ level, code, message });
  if (engine === 'gecko') {
    push('notice','gecko_native','Firefox/Gecko sử dụng thông số của Firefox. Tùy chỉnh Chromium không áp dụng.');
    return { engine, mode: 'native', issues, warningCount: 0,
      explanation: 'Đây là kiểm tra cấu hình, không phải phép đo khả năng Google nhận diện.' };
  }
  if (mode === 'native') {
    push('notice','native_mode','User-Agent, Canvas, WebGL và WebAudio để trình duyệt tự cung cấp. LHM không tải extension can thiệp fingerprint.');
    push('notice','native_caveat','Chưa đo được HTTP headers hoặc giá trị thực tế trên website. Hãy kiểm tra trực tiếp trong trình duyệt nếu cần.');
    return { engine, mode, issues, warningCount: 0,
      explanation: 'Không có chế độ nào bảo đảm các tài khoản Google không bị liên kết.' };
  }
  const ua = typeof fp.userAgent === 'string' ? fp.userAgent : '';
  const claim = typeof fp.os === 'string' ? fp.os : '';
  if (!ua) push('warning','ua_missing','Chưa có User-Agent tùy chỉnh. Một số giá trị khác có thể không khớp trình duyệt thật.');
  if (ua && !/Chrome\/\d+/.test(ua)) push('warning','ua_unexpected','User-Agent tùy chỉnh không nhận diện được Chrome; có thể sai engine.');
  const chrome = ua.match(/Chrome\/(\d+)\./);
  if (chrome && Number(chrome[1]) <= 134) push('warning','ua_old','User-Agent khai báo Chrome phiên bản rất cũ. Phiên bản cài trên máy có thể khác.');
  if (claim === 'Windows' && ua && !/Windows NT/.test(ua)) push('warning','os_ua','OS và chuỗi User-Agent không cùng hệ điều hành.');
  if (claim === 'macOS' && ua && !/Macintosh/.test(ua)) push('warning','os_ua','OS và chuỗi User-Agent không cùng hệ điều hành.');
  if (claim === 'Linux' && ua && !/Linux/.test(ua)) push('warning','os_ua','OS và chuỗi User-Agent không cùng hệ điều hành.');
  const webgl = String(fp.webgl?.renderer || '');
  if ((claim === 'macOS' || claim === 'Linux') && /Direct3D|D3D11|D3D12/.test(webgl)) {
    push('warning','webgl_os','WebGL renderer có chuỗi Direct3D/Windows nhưng cấu hình OS không phải Windows.');
  }
  if (Number(fp.canvasNoiseSeed) > 0) push('warning','canvas_modified','Chế độ nhiễu Canvas thử nghiệm có thể thay đổi ảnh đọc qua getImageData, làm sai kết quả ứng dụng; không có xác minh nhất quán giữa các API.');
  else push('notice','canvas_native','Nhiễu Canvas đang tắt. Không nên coi đây là bằng chứng ẩn danh.');
  if (Number(fp.audioNoiseSeed) > 0) push('warning','audio_modified','WebAudio đang dùng bản vá thử nghiệm; chưa xác minh tương thích mọi phiên bản trình duyệt.');
  if (fp.webrtc === 'spoof') push('warning','webrtc_unverified','Bản vá WebRTC thử nghiệm không chứng minh đã chặn toàn bộ rò rỉ địa chỉ mạng.');
  push('notice','not_verified','LHM chưa đối chiếu trực tiếp User-Agent header, client hints, Canvas, GPU và mạng từ trình duyệt đang chạy.');
  return { engine, mode, issues, warningCount: issues.filter(i => i.level === 'warning').length,
    explanation: 'Không bảo đảm Google không nhận diện hoặc liên kết các tài khoản.' };
}
module.exports = { inspectFingerprint };
