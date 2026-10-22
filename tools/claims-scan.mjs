#!/usr/bin/env node
'use strict';
// claims-scan.mjs — Quét tuyên bố hướng khách hàng theo Mục 11 (kỷ luật
// phát ngôn) và Mục 16 (cấm kết luận tổng hợp) của TIEU-CHI-SAN-PHAM.md.
//
// Cách dùng:  node tools/claims-scan.mjs [--root <dir>]
// Mã thoát:   0 = không có hit cấm nào ngoài allowlist;
//             1 = có hit cấm chưa được phân loại (xem danh sách in ra);
//             2 = lỗi dùng sai / không đọc được cây nguồn.
//
// Nguyên tắc: script này là MÁY DÒ, không phải trọng tài. Mọi hit thuộc
// nhóm BLOCK phải hoặc (a) bị xóa/sửa, hoặc (b) có một mục trong
// ALLOWLIST dưới đây ghi rõ file + chuỗi con + lý do con người đã kiểm
// (thường là câu giới hạn/phủ định trung thực, hoặc câu kỷ luật nội bộ).
// Thêm dòng marketing mới mà chạm pattern là scan fail cho tới khi có
// người phân loại — đó là chủ đích của Mục 11.
//
// Nhóm REVIEW (in ra, không fail): con số phần trăm (chỉ hợp lệ khi có
// phép đo đứng sau — người kiểm đối chiếu tại thời điểm freeze) và tên
// đối thủ (chỉ hợp lệ khi là phát biểu tương thích thực tế, không phải
// khẳng định về đối thủ). Nhóm FREEZE-VERIFY: mọi chữ "Preview" trong
// tên/metadata/tài liệu — tại thời điểm đóng băng phát hành phải xác
// nhận từng chỗ còn đúng sự thật hay phải đổi cùng lúc với quyết định
// phát hành.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
if (!ROOT) { console.error('claims-scan: thiếu --root'); process.exit(2); }

const BLOCK_RULES = [
  { id: 'ABS-100', re: /100\s*%/, why: 'Mục 11.4: cấm tuyệt đối hóa "100%"' },
  { id: 'ABS-NEVER', re: /không bao giờ/, why: 'Mục 11.4: cấm "không bao giờ" trong văn bản hướng ra ngoài' },
  { id: 'ABS-GUARANTEE', re: /đảm bảo|bảo đảm/, why: 'Mục 11.3/11.4: cấm bảo chứng; chỉ câu giới hạn phủ định đã kiểm mới được allowlist' },
  { id: 'ABS-FOREVER', re: /miễn phí vĩnh viễn|không giới hạn/, why: 'Mục 11.4: tuyệt đối hóa thời gian/giới hạn ("xóa vĩnh viễn" là tên thao tác xóa hẳn, cố ý không nằm trong pattern này)' },
  { id: 'ABS-ABSOLUTE', re: /tuyệt đối/, why: 'Mục 11.4: "tuyệt đối" chỉ chấp nhận trong câu chỉ dẫn an toàn cho người dùng đã kiểm' },
  { id: 'SAFETY-VERDICT', re: /AN TOÀN để chạy|an toàn để chạy (ads|quảng cáo)/i, why: 'Mục 11.3: cấm câu bảo chứng an toàn tài khoản' },
  { id: 'NEW-PERSON', re: /luôn là người mới|always a new (person|user)/i, why: 'Mục 11.4 + 15: cấm "luôn là người mới"' },
  { id: 'AGGREGATE-CLEAN', re: /sạch toàn bộ|toàn bộ hồ sơ (đều |đã )?(sạch|an toàn)|overall (clean|safe) verdict/i, why: 'Mục 16: cấm kết luận sạch/an toàn tổng hợp' },
  { id: 'UNMEASURED-AS-GOOD', re: /['">]Bình thường['"<]/, why: 'Mục 16: trạng thái chưa đo không được trình bày như trạng thái tốt/trung tính-tốt' },
  { id: 'UNDETECTABLE', re: /undetectable|không (thể|bị) phát hiện|không bao giờ bị (khóa|ban|phát hiện)/i, why: 'Mục 11.3/11.4: cấm khẳng định không thể bị phát hiện/khóa' },
];
const REVIEW_RULES = [
  { id: 'PCT', re: /\d+\s*%/, why: 'Mục 11.1: phần trăm phải có phép đo và phương pháp đo đứng sau' },
  { id: 'COMPETITOR', re: /AdsPower|Multilogin|GoLogin|Dolphin/i, why: 'Mục 11.2: nhắc đối thủ chỉ khi là phát biểu tương thích thực tế đã kiểm chứng' },
];

// Allowlist: mỗi mục = một hit cụ thể con người đã đọc và phân loại.
// file: hậu tố đường dẫn; includes: chuỗi con phải có trong dòng;
// rule: id của rule được miễn; reason: căn cứ phân loại.
const ALLOWLIST = [
  // --- Câu giới hạn trung thực trong UI (phủ định = giới hạn, không phải bảo chứng)
  { file: 'src/ui/index.html', rule: 'ABS-GUARANTEE', includes: 'Không có tùy chọn nào bảo đảm Google không liên kết', reason: 'Câu giới hạn ở mục fingerprint mode: phủ định bảo chứng liên kết tài khoản.' },
  { file: 'src/ui/index.html', rule: 'ABS-GUARANTEE', includes: 'không bảo đảm chặn rò rỉ', reason: 'Nhãn trung thực của tính năng WebRTC thử nghiệm.' },
  { file: 'src/ui/index.html', rule: 'ABS-ABSOLUTE', includes: 'tuyệt đối không chia sẻ file hoặc mật khẩu', reason: 'Chỉ dẫn an toàn cho người dùng về snapshot đã mã hóa, không phải tuyên bố về sản phẩm.' },
  // --- Bình luận code nêu kỷ luật (không phải câu chữ hiển thị)
  { file: 'src/ui/criteriaChecklist.js', rule: 'ABS-ABSOLUTE', includes: 'tuyệt đối không suy ra trạng thái từ dữ liệu thiếu', reason: 'Bình luận code ghi kỷ luật Mục 16, không hiển thị cho khách.' },
  // --- Sổ tay khách: các câu giới hạn/phủ định đã kiểm từng dòng (nhánh R14 chỉ đề xuất, R7 sở hữu file)
  { file: 'docs/customer-guide/README.md', rule: 'ABS-GUARANTEE', includes: 'không bảo đảm', reason: 'Câu giới hạn trong trang định hướng tài liệu (R14 đã đọc ngữ cảnh đầy đủ).' },
  { file: 'docs/customer-guide/02-tao-ho-so-va-proxy.md', rule: 'ABS-GUARANTEE', includes: 'không bảo đảm chặn rò rỉ', reason: 'Câu giới hạn về đường mạng thử nghiệm.' },
  { file: 'docs/customer-guide/02-tao-ho-so-va-proxy.md', rule: 'ABS-GUARANTEE', includes: 'bảo đảm Google không liên kết', reason: 'Nằm trong câu phủ định "Không có tùy chọn nào..." — giới hạn, không phải bảo chứng.' },
  { file: 'docs/customer-guide/05-sao-luu-khoi-phuc-va-xoa-du-lieu.md', rule: 'ABS-ABSOLUTE', includes: 'cảnh báo tuyệt đối không chia sẻ', reason: 'Chỉ dẫn an toàn cho người dùng về file/mật khẩu snapshot.' },
  { file: 'docs/customer-guide/07-nhung-gi-san-pham-khong-hua.md', rule: 'ABS-GUARANTEE', includes: 'không bảo đảm', reason: 'Trang "những gì sản phẩm không hứa" — toàn bộ là câu giới hạn.' },
  // --- Sổ tay người bán: câu kỷ luật nội bộ (không phải văn bản cho khách)
  { file: 'docs/seller-runbook/README.md', rule: 'ABS-NEVER', includes: 'Không bao giờ hướng dẫn tắt kiểm chứng', reason: 'Kỷ luật vận hành cho người bán, không phải tuyên bố sản phẩm.' },
  { file: 'docs/seller-runbook/README.md', rule: 'ABS-100', includes: 'không dùng từ tuyệt đối', reason: 'Dòng này TRÍCH DẪN chính quy tắc cấm để hướng dẫn người bán.' },
  { file: 'docs/seller-runbook/README.md', rule: 'ABS-NEVER', includes: 'không dùng từ tuyệt đối', reason: 'Cùng dòng trích dẫn quy tắc cấm ở trên.' },
  { file: 'docs/seller-runbook/README.md', rule: 'ABS-ABSOLUTE', includes: 'không dùng từ tuyệt đối', reason: 'Cùng dòng trích dẫn quy tắc cấm ở trên.' },
  { file: 'docs/seller-runbook/README.md', rule: 'ABS-GUARANTEE', includes: 'không trả lời thay bằng lời bảo đảm', reason: 'Kỷ luật trả lời khách cho người bán.' },
  { file: 'docs/seller-runbook/README.md', rule: 'SAFETY-VERDICT', includes: 'Không hứa tài khoản', reason: 'Dòng này TRÍCH DẪN câu bị cấm để cấm người bán dùng nó.' },
  // --- README: các câu giới hạn trong phần ghi chú phát hành (đã kiểm ngữ cảnh)
  { file: 'README.md', rule: 'ABS-GUARANTEE', includes: 'không bảo đảm vượt qua bất kỳ cơ chế phát hiện nào', reason: 'Câu giới hạn ở header README (bản sửa R14).' },
  { file: 'README.md', rule: 'ABS-GUARANTEE', includes: 'bảo đảm tránh liên kết tài khoản hay tránh đình chỉ', reason: 'Câu giới hạn ở header README (bản sửa R14); từ phủ định "không" nằm ở dòng bọc liền trước, đã kiểm ngữ cảnh.' },
  { file: 'README.md', rule: 'ABS-FOREVER', includes: 'Không có thao tác mở đồng loạt không giới hạn', reason: 'Câu phủ định: nói rõ KHÔNG có thao tác mở đồng loạt không giới hạn — giới hạn vận hành, không phải tuyên bố.' },
  { file: 'src/ui/criteriaChecklist.js', rule: 'AGGREGATE-CLEAN', includes: '"sạch toàn bộ"', reason: 'Bình luận code trích dẫn cụm bị cấm để ghi rõ là bị cấm (Mục 16), không hiển thị cho khách.' },
  { file: 'docs/customer-guide/07-nhung-gi-san-pham-khong-hua.md', rule: 'NEW-PERSON', includes: '"luôn là người mới" hay bất kỳ tỉ lệ phần', reason: 'Trang giới hạn trích dẫn cụm bị cấm trong câu "không hứa".' },
  { file: 'docs/seller-runbook/README.md', rule: 'ABS-ABSOLUTE', includes: 'đường dẫn tuyệt đối', reason: '"Đường dẫn tuyệt đối" là thuật ngữ kỹ thuật (absolute path) trong hướng dẫn công cụ ký, không phải tuyệt đối hóa tuyên bố.' },
  { file: 'README.md', rule: 'ABS-GUARANTEE', includes: 'đảm bảo tránh khóa tài khoản', reason: 'Nằm trong câu phủ định ở mục giới hạn ("không có cơ chế né hoặc...").' },
  { file: 'README.md', rule: 'ABS-GUARANTEE', includes: 'đảm bảo vô danh', reason: 'Nằm trong câu phủ định liệt kê điều sản phẩm KHÔNG làm.' },
  { file: 'README.md', rule: 'ABS-GUARANTEE', includes: 'không có bảo đảm tránh liên kết', reason: 'Câu giới hạn trong ghi chú phát hành.' },
];

const TARGETS = [
  { dir: 'src/ui', exts: ['.js', '.html'] },
  { dir: 'docs/customer-guide', exts: ['.md'] },
  { dir: 'docs/seller-runbook', exts: ['.md'] },
  { file: 'README.md' },
  { file: 'package.json' },
];

function collect() {
  const out = [];
  for (const t of TARGETS) {
    if (t.file) { out.push(join(ROOT, t.file)); continue; }
    const base = join(ROOT, t.dir);
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (t.exts.some(e => name.endsWith(e))) out.push(p);
      }
    };
    walk(base);
  }
  return out;
}

function isAllowed(rel, line, ruleId) {
  return ALLOWLIST.some(a => a.rule === ruleId && rel.endsWith(a.file) && line.includes(a.includes));
}

let blockHits = 0, reviewHits = 0;
const freezeLines = [];
for (const path of collect()) {
  const rel = relative(ROOT, path).split('\\').join('/');
  let lines;
  try { lines = readFileSync(path, 'utf8').split('\n'); }
  catch { console.error('claims-scan: không đọc được ' + rel); process.exit(2); }
  lines.forEach((line, i) => {
    for (const rule of BLOCK_RULES) {
      if (rule.re.test(line) && !isAllowed(rel, line, rule.id)) {
        blockHits++;
        console.log(`BLOCK  ${rel}:${i + 1}  [${rule.id}] ${rule.why}\n       ${line.trim().slice(0, 200)}`);
      }
    }
    for (const rule of REVIEW_RULES) {
      if (rule.re.test(line)) {
        reviewHits++;
        console.log(`REVIEW ${rel}:${i + 1}  [${rule.id}] ${rule.why}\n       ${line.trim().slice(0, 200)}`);
      }
    }
    if (/Preview/.test(line) && (rel === 'package.json' || rel.startsWith('docs/') || rel === 'README.md')) {
      freezeLines.push(`${rel}:${i + 1}  ${line.trim().slice(0, 160)}`);
    }
  });
}
console.log('--- FREEZE-VERIFY: các chỗ mang nhãn "Preview" (xác nhận lại khi đóng băng phát hành) ---');
for (const l of freezeLines) console.log('FREEZE ' + l);
console.log(`claims-scan: ${blockHits} BLOCK chưa phân loại, ${reviewHits} REVIEW cần người đối chiếu phép đo/ngữ cảnh.`);
process.exit(blockHits > 0 ? 1 : 0);
