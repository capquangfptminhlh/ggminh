'use strict';

/**
 * Curated local-only starting points for explicitly authorized website QA.
 * No downloaded code, remote marketplace, browser/session sharing, or auto-run.
 * Templates are drafts; Studio's existing validation and approval rules apply.
 */
const TEMPLATES = Object.freeze([
  {
    id: 'heading-check',
    name: 'Kiểm tra tiêu đề trang',
    description: 'Mở trang, chờ H1 xuất hiện và kiểm tra văn bản dự kiến.',
    hosts: 'example.com',
    steps: [
      { type: 'navigate', url: 'https://example.com/' },
      { type: 'wait_for', selector: 'h1', ms: 5000 },
      { type: 'assert_text', selector: 'h1', text: 'Example Domain' }
    ]
  },
  {
    id: 'conditional-page-check',
    name: 'Kiểm tra nội dung có điều kiện',
    description: 'Kiểm tra một phần tử nếu có; bỏ qua nhánh nếu phần tử vắng mặt.',
    hosts: 'example.com',
    steps: [
      { type: 'navigate', url: 'https://example.com/' },
      { type: 'if_exists', selector: 'h1' },
      { type: 'assert_text', selector: 'h1', text: 'Example Domain' },
      { type: 'else' },
      { type: 'wait', ms: 500 },
      { type: 'end_if' }
    ]
  },
  {
    id: 'approved-button-check',
    name: 'Nhấn nút sau phê duyệt',
    description: 'Mẫu QA website riêng: chỉ nhấn khi được người dùng phê duyệt tại chỗ.',
    hosts: 'example.com',
    steps: [
      { type: 'navigate', url: 'https://example.com/' },
      { type: 'approval', label: 'Tôi đã kiểm tra website, quyền truy cập và đồng ý nhấn nút' },
      { type: 'click', selector: 'button[data-test="start"]' }
    ]
  }
]);

function listWorkflowTemplates() {
  return TEMPLATES.map(({ id, name, description, hosts, steps }) => ({
    id, name, description, hosts,
    steps: structuredClone(steps)
  }));
}
function draftFromTemplate(id) {
  if (typeof id !== 'string') throw Error('Mã mẫu không hợp lệ');
  const template = TEMPLATES.find(item => item.id === id);
  if (!template) throw Error('Mẫu quy trình không tồn tại');
  return { name: template.name, hosts: template.hosts, steps: structuredClone(template.steps) };
}

module.exports = { listWorkflowTemplates, draftFromTemplate };
