(() => {
  'use strict';
  const api = window.api;
  const el = id => document.getElementById(id);
  let workflows = [];
  let current = null;
  let dragged = null;
  let recorderBusy = false;
  let graphTicket = 0;
  let graphDebounce = null;
  let graphSelection = -1;
  const labels = {
    navigate: 'Mở URL', wait: 'Chờ', wait_for: 'Chờ phần tử', click: 'Nhấn CSS',
    fill: 'Điền trường', assert_text: 'Kiểm tra chữ', approval: 'Xác nhận thủ công',
    if_exists: 'Nếu phần tử tồn tại', else: 'Nếu không', end_if: 'Kết thúc nếu',
    repeat: 'Lặp (2–5 lần)', end_repeat: 'Kết thúc lặp'
  };
  const drafts = {
    navigate: () => ({ type: 'navigate', url: 'https://example.com/' }),
    wait: () => ({ type: 'wait', ms: 1000 }),
    wait_for: () => ({ type:'wait_for', selector:'h1', ms:5000 }),
    click: () => ({ type: 'click', selector: 'button' }),
    fill: () => ({ type: 'fill', selector: 'input[name="q"]', value: '' }),
    assert_text: () => ({ type: 'assert_text', selector: 'h1', text: 'Example Domain' }),
    approval: () => ({ type: 'approval', label: 'Tôi đã kiểm tra và đồng ý tiếp tục' }),
    if_exists: () => ({ type: 'if_exists', selector: 'h1' }),
    else: () => ({ type: 'else' }),
    end_if: () => ({ type: 'end_if' }),
    repeat: () => ({ type: 'repeat', count: 2 }),
    end_repeat: () => ({ type: 'end_repeat' })
  };
  function button(title, css, handler) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = css; b.textContent = title;
    b.addEventListener('click', handler); return b;
  }
  async function updateProfiles() {
    const profiles = await api.getProfiles();
    const select = el('studio-profile');
    const previous = current?.profileId || select.value;
    select.replaceChildren();
    for (const p of profiles) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + (p.engine === 'gecko' ? ' (Gecko: chưa hỗ trợ)' : '');
      opt.disabled = p.engine === 'gecko';
      select.append(opt);
    }
    if (profiles.some(p => p.id === previous && p.engine !== 'gecko')) select.value = previous;
    else if (profiles.some(p => p.engine !== 'gecko')) select.value = profiles.find(p => p.engine !== 'gecko').id;
    if (!select.options.length) {
      const option = document.createElement('option');
      option.value = ''; option.textContent = 'Hãy tạo hồ sơ Chromium trước';
      select.append(option);
    }
  }
  async function refreshList() {
    workflows = await api.studioList();
    const list = el('studio-workflows');
    list.replaceChildren();
    if (!workflows.length) {
      const empty = document.createElement('p');
      empty.className = 'studio-muted'; empty.textContent = 'Chưa có quy trình nào.';
      list.append(empty);
    }
    const query=el('studio-workflow-search').value.trim().toLowerCase();
    let shown=0;
    for (const flow of workflows) {
      if(query && !flow.name.toLowerCase().includes(query))continue;
      shown++;
      const row = document.createElement('div'); row.className = 'studio-saved-item';
      row.append(button(flow.name, 'btn btn-sm btn-secondary', () => load(flow)));
      row.append(button('Xóa', 'btn btn-sm btn-secondary studio-delete-workflow', async () => {
        if (!confirm('Xóa quy trình "' + flow.name + '"?')) return;
        try {
          await api.studioDelete(flow.id);
          if (current?.id === flow.id) createNew();
          await refreshList();
        } catch (error) { alert(error.message); }
      }));
      list.append(row);
    }
    if(workflows.length && shown===0) {
      const none=document.createElement('p');
      none.className='studio-muted';
      none.textContent='Không tìm thấy quy trình phù hợp.';
      list.append(none);
    }
  }
  function createNew() {
    current = {
      name: 'Quy trình mới', hosts: 'example.com',
      steps: [drafts.navigate(), drafts.assert_text(), drafts.approval()]
    };
    el('studio-name').value = current.name;
    el('studio-hosts').value = current.hosts;
    updateProfiles().then(renderSteps).catch(error => alert(error.message));
  }
  function load(flow) {
    current = JSON.parse(JSON.stringify(flow));
    el('studio-name').value = current.name;
    el('studio-hosts').value = current.hosts;
    updateProfiles().then(() => {
      el('studio-profile').value = current.profileId;
      renderSteps();
    }).catch(error => alert(error.message));
  }
  const SVG_NS='http://www.w3.org/2000/svg';
  function svgItem(name, attributes = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  }
  function selectGraphStep(index) {
    if (!current || index >= current.steps.length || index < 0) return;
    graphSelection = index;
    for (const node of el('studio-graph').querySelectorAll('[data-step-index]')) {
      node.classList.toggle('is-current', Number(node.dataset.stepIndex) === index);
    }
    for (const row of el('studio-steps').querySelectorAll('[data-step-index]')) {
      row.classList.toggle('graph-selected', Number(row.dataset.stepIndex) === index);
      if(Number(row.dataset.stepIndex) === index) {
        row.scrollIntoView({block:'nearest',behavior:'smooth'});
        row.querySelector('input,select')?.focus({preventScroll:true});
      }
    }
    const selected=el('studio-graph').querySelector('[data-step-index="'+index+'"]');
    const scrolling=el('studio-graph-scroll');
    if(selected && scrolling) {
      scrolling.scrollTo({
        top:Math.max(0,selected.offsetTop-scrolling.clientHeight/2+selected.clientHeight/2),
        left:Math.max(0,selected.offsetLeft-scrolling.clientWidth/2+selected.clientWidth/2),
        behavior:'smooth'
      });
    }
  }
  function highlightGraphRun(state) {
    for (const node of el('studio-graph').querySelectorAll('[data-step-index]')) {
      const running = state.status === 'running' && Number(node.dataset.stepIndex) === state.step;
      node.classList.toggle('is-executing', running);
      if (running) node.setAttribute('aria-label',
        (Number(node.dataset.stepIndex)+1)+' · Đang thực hiện');
      else node.removeAttribute('aria-label');
    }
  }
  function displayGraph(report) {
    const surface=el('studio-graph');
    surface.replaceChildren();
    surface.style.width=report.width+'px';
    surface.style.height=report.height+'px';
    const positions=new Map(report.nodes.map(node=>[node.index,node]));
    const svg=svgItem('svg',{
      class:'studio-graph-lines',width:report.width,height:report.height,
      viewBox:'0 0 '+report.width+' '+report.height,'aria-hidden':'true'
    });
    for (const edge of report.edges) {
      const from=positions.get(edge.from),to=positions.get(edge.to);
      if(!from || !to) continue;
      const fx=from.x+from.width/2,fy=from.y+from.height;
      const tx=to.x+to.width/2,ty=to.y;
      let d;
      if(ty <= fy) {
        const routeX=Math.max(from.x+from.width,to.x+to.width)+64;
        d='M'+fx+' '+fy+' C'+routeX+' '+(fy+16)+' '+routeX+' '+(ty-18)+' '+tx+' '+ty;
      }else {
        const bend=Math.min(48,Math.max(18,(ty-fy)/2));
        d='M'+fx+' '+fy+' C'+fx+' '+(fy+bend)+' '+tx+' '+(ty-bend)+' '+tx+' '+ty;
      }
      const curve=svgItem('path',{d,class:'studio-graph-line','data-kind':edge.kind});
      svg.append(curve);
      if(edge.label && edge.kind!=='loop-back'){
        const label=svgItem('text',{x:fx+(tx-fx)*.38+5,y:fy+Math.max(12,(ty-fy)/3),
          class:'studio-graph-edge-label'});
        label.textContent=edge.label;
        svg.append(label);
      }
    }
    surface.append(svg);
    for (const node of report.nodes) {
      const item=document.createElement(node.type === 'end' ? 'div':'button');
      if(item.tagName==='BUTTON')item.type='button';
      item.className='studio-graph-node';
      item.dataset.category=node.category;
      item.style.left=node.x+'px';
      item.style.top=node.y+'px';
      if(node.type !== 'end') item.dataset.stepIndex=String(node.index);
      item.title=node.label+(node.detail ? ' — '+node.detail:'');
      const title=document.createElement('span');
      title.className='studio-graph-node-title';
      title.textContent=node.type==='end' ? node.label : (node.index+1)+'. '+node.label;
      const detail=document.createElement('span');
      detail.className='studio-graph-node-detail';
      detail.textContent=node.detail || (node.type==='end' ? 'Kết thúc quy trình':'Bấm để sửa bước');
      item.append(title,detail);
      if(node.type!=='end')item.addEventListener('click',()=>selectGraphStep(node.index));
      surface.append(item);
    }
    el('studio-graph-status').classList.remove('is-error');
    el('studio-graph-status').textContent=
      report.nodes.length-1+' bước · tối đa '+report.worstCaseSteps+
      ' lượt xử lý · Bấm node để chọn bước chỉnh sửa.';
    if(graphSelection>=0 && graphSelection<current.steps.length){
      const old=graphSelection;
      graphSelection=-1;
      // Keep visual selection without stealing focus on every refresh.
      const item=surface.querySelector('[data-step-index="'+old+'"]');
      item?.classList.add('is-current');
      for(const row of el('studio-steps').querySelectorAll('[data-step-index]'))
        row.classList.toggle('graph-selected',Number(row.dataset.stepIndex)===old);
      graphSelection=old;
    }
  }
  async function renderGraph() {
    const version=++graphTicket;
    if(!current)return;
    try {
      const report=await api.studioGraphPreview(current.steps);
      if(version!==graphTicket)return;
      displayGraph(report);
    }catch(error) {
      if(version!==graphTicket)return;
      const surface=el('studio-graph');
      surface.replaceChildren();
      surface.style.width='800px';
      surface.style.height='96px';
      el('studio-graph-status').classList.add('is-error');
      el('studio-graph-status').textContent='Cần sửa cấu trúc: '+error.message;
    }
  }
  function queueGraph() {
    if(graphDebounce!==null)clearTimeout(graphDebounce);
    graphDebounce=setTimeout(()=>{
      graphDebounce=null;
      renderGraph().catch(console.error);
    },170);
  }
  function stepField(i, title, prop, kind = 'text') {
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement(kind === 'select' ? 'select' : 'input');
    if (kind === 'number') input.type = 'number';
    else if (kind !== 'select') input.type = 'text';
    input.value = String(current.steps[i][prop] ?? '');
    input.addEventListener('input', () => { current.steps[i][prop] = kind === 'number' ? Number(input.value) : input.value; queueGraph(); });
    label.append(input);
    return label;
  }
  function renderSteps() {
    const list = el('studio-steps');
    list.replaceChildren();
    if (!current) return;
    let blockDepth = 0;
    current.steps.forEach((step, i) => {
      if (['else','end_if','end_repeat'].includes(step.type)) blockDepth = Math.max(0, blockDepth-1);
      const row = document.createElement('div');
      row.className = 'studio-step' + (['if_exists','else','end_if','repeat','end_repeat'].includes(step.type) ? ' studio-step-block' : '');
      row.dataset.stepIndex=String(i);
      row.style.marginLeft = (blockDepth * 14) + 'px';
      row.draggable = true;
      row.addEventListener('dragstart', event => {
        dragged = i; row.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(i));
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', event => event.preventDefault());
      row.addEventListener('drop', event => {
        event.preventDefault();
        const from = dragged; dragged = null;
        if (!Number.isInteger(from) || from === i) return;
        const [moved] = current.steps.splice(from, 1);
        current.steps.splice(i, 0, moved);
        renderSteps();
      });
      const heading = document.createElement('div'); heading.className = 'studio-step-main';
      const grip = document.createElement('span'); grip.textContent = '⠿'; grip.title = 'Kéo để sắp xếp';
      const name = document.createElement('strong'); name.textContent = (i+1) + '. ' + (labels[step.type] || step.type);
      heading.append(grip, name);
      heading.append(button('↑', 'btn btn-sm btn-secondary', () => move(i, -1)));
      heading.append(button('↓', 'btn btn-sm btn-secondary', () => move(i, 1)));
      heading.append(button('Xóa', 'btn btn-sm btn-danger', () => {
        current.steps.splice(i, 1); renderSteps();
      }));
      const fields = document.createElement('div'); fields.className = 'studio-step-contents';
      if (step.type === 'navigate') fields.append(stepField(i, 'URL', 'url'));
      if (step.type === 'wait' || step.type === 'wait_for') fields.append(stepField(i, 'Thời gian tối đa (ms)', 'ms', 'number'));
      if (['click', 'fill', 'assert_text','wait_for','if_exists'].includes(step.type)) fields.append(stepField(i, 'CSS selector', 'selector'));
      if (step.type === 'repeat') fields.append(stepField(i, 'Số lần (2–5)', 'count', 'number'));
      if (step.type === 'fill') fields.append(stepField(i, 'Văn bản (không nhập mật khẩu)', 'value'));
      if (step.type === 'assert_text') fields.append(stepField(i, 'Phải chứa văn bản', 'text'));
      if (step.type === 'approval') fields.append(stepField(i, 'Câu hỏi xác nhận', 'label'));
      row.append(heading, fields); list.append(row);
      if (['if_exists','else','repeat'].includes(step.type)) blockDepth = Math.min(2,blockDepth+1);
    });
    graphSelection=-1;
    queueGraph();
  }
  function move(i, delta) {
    const destination = i + delta;
    if (destination < 0 || destination >= current.steps.length) return;
    const [step] = current.steps.splice(i, 1);
    current.steps.splice(destination, 0, step);
    renderSteps();
  }
  async function save() {
    if (!current) throw Error('Hãy tạo quy trình trước');
    current.name = el('studio-name').value.trim();
    current.hosts = el('studio-hosts').value.trim();
    current.profileId = el('studio-profile').value;
    const stored = await api.studioSave(current);
    current = stored;
    await refreshList();
    return stored;
  }
  async function updateStatus() {
    const state = await api.studioStatus();
    const names = {
      idle:'Chưa chạy',running:'Đang chạy',completed:'Hoàn thành',
      stopped:'Đã dừng',failed:'Thất bại'
    };
    el('studio-run-state').textContent =
      (names[state.status] || state.status) + (state.status === 'running' ? ' · bước ' + (state.step+1) + '/' + state.total + ' · lượt ' + (state.executed || 0) : '');
    el('studio-stop').disabled = state.status !== 'running';
    highlightGraphRun(state);
    el('studio-approve').hidden = !state.needsApproval;
    el('studio-approval-prompt').hidden = !state.needsApproval;
    el('studio-approval-prompt').textContent = state.approvalLabel || '';
    el('studio-log').textContent = state.logs?.length ?
      state.logs.map(x => new Date(x.time).toLocaleTimeString('vi-VN') + '  ' + x.message).join('\n') :
      'Nhật ký sẽ xuất hiện tại đây.';
  }

  async function recorderStatus() {
    const report = await api.recorderStatus();
    const stateLabels = { idle:'Chưa ghi', recording:'● Đang ghi', stopped:'Đã dừng ghi' };
    const indicator = el('studio-record-state');
    indicator.textContent = stateLabels[report.state] || 'Không xác định';
    indicator.classList.toggle('recording', report.state === 'recording');
    el('studio-record-start').disabled = recorderBusy || report.state === 'recording';
    el('studio-record-stop').disabled = recorderBusy || report.state !== 'recording';
    el('studio-record-import').disabled = recorderBusy || report.state !== 'stopped';
    const log = el('studio-record-events');
    log.replaceChildren();
    const note = document.createElement('div');
    note.className = 'studio-muted'; note.textContent = (report.notice || '') + ' · ' + report.stepCount + ' bước';
    log.append(note);
    for (const action of report.actions || []) {
      const row = document.createElement('div');
      row.className = 'studio-record-event';
      const title = { navigate:'Mở trang',click:'Nhấn nút',fill:'Trường nhập',approval:'Phê duyệt' }[action.type] || action.type;
      row.textContent = title + ' · ' + action.label;
      log.append(row);
    }
  }
  async function startRecording() {
    if (recorderBusy) return;
    const profileId = el('studio-profile').value;
    const hosts = el('studio-hosts').value.trim();
    const navigation = current?.steps.find(step => step.type === 'navigate');
    if (!navigation?.url) return alert('Cần có một bước Mở URL để làm trang bắt đầu ghi.');
    if (!profileId) return alert('Hãy chọn hồ sơ Chromium để ghi.');
    if (!confirm('Recorder chỉ ghi click, vị trí trường nhập và URL không có tham số. Không ghi giá trị biểu mẫu.\nChỉ sử dụng trên website bạn sở hữu hoặc được phép tự động hóa. Tiếp tục?')) return;
    recorderBusy = true;
    await recorderStatus();
    try {
      await api.recorderStart({ profileId, hosts, url: navigation.url });
      await recorderStatus();
    } catch (error) { alert('Không thể bắt đầu Recorder: ' + error.message); }
    finally { recorderBusy = false; await recorderStatus(); }
  }
  async function stopRecording() {
    if (recorderBusy) return;
    recorderBusy = true;
    try { await api.recorderStop(); }
    catch (error) { alert('Không thể dừng Recorder: ' + error.message); }
    finally { recorderBusy = false; await recorderStatus(); }
  }
  async function importRecording() {
    if (recorderBusy) return;
    try {
      const draft = await api.recorderTake();
      if (!draft.steps || draft.steps.length < 2) return alert('Không có bước nào để lấy.');
      if (!confirm('Thay các bước hiện tại bằng ' + draft.steps.length + ' bước đã ghi?\nBạn cần tự nhập nội dung cho các bước Điền trường trước khi chạy.')) return;
      if (!current) createNew();
      current.steps = JSON.parse(JSON.stringify(draft.steps));
      current.hosts = draft.hosts;
      current.profileId = draft.profileId;
      delete current.id;
      el('studio-hosts').value = draft.hosts;
      el('studio-profile').value = draft.profileId;
      el('studio-name').value = 'Bản ghi ' + new Date().toLocaleDateString('vi-VN');
      renderSteps();
      alert('Đã nhập ' + draft.steps.length + ' bước. Hãy kiểm tra selector, điền nội dung phù hợp và bấm Lưu.');
    } catch (error) { alert('Không thể lấy bản ghi: ' + error.message); }
  }


  function scheduleDateDefault() {
    const now=new Date(Date.now()+15*60*1000);
    const local=new Date(now.getTime()-now.getTimezoneOffset()*60000);
    el('studio-schedule-at').value=local.toISOString().slice(0,16);
  }
  async function refreshSchedules() {
    const list=el('studio-schedule-list');
    list.replaceChildren();
    const schedules=await api.studioScheduleList();
    if(!schedules.length){
      const empty=document.createElement('p');
      empty.className='studio-muted';empty.textContent='Chưa lập lịch nào.';
      list.append(empty);
      return;
    }
    for(const schedule of schedules){
      const row=document.createElement('div');row.className='studio-schedule-item';
      const description=document.createElement('div');
      const name=document.createElement('strong');name.textContent=schedule.workflowName;
      const detail=document.createElement('small');
      detail.textContent=new Date(schedule.nextRunAt).toLocaleString('vi-VN')+
        (schedule.intervalMinutes ? ' · '+schedule.intervalMinutes+' phút/lần' : ' · Một lần')+
        ' · '+schedule.lastStatus;
      description.append(name,detail);
      const actions=document.createElement('div');actions.className='studio-schedule-actions';
      const toggle=document.createElement('button');toggle.type='button';
      toggle.className='btn btn-sm btn-secondary';toggle.textContent=schedule.enabled?'Tạm dừng':'Bật lịch';
      toggle.addEventListener('click',async()=>{
        try{await api.studioScheduleEnable(schedule.id,!schedule.enabled);await refreshSchedules();}
        catch(error){alert('Không đổi được lịch: '+error.message);}
      });
      const remove=document.createElement('button');remove.type='button';
      remove.className='btn btn-sm btn-secondary';remove.textContent='Xóa';
      remove.addEventListener('click',async()=>{
        if(!confirm('Xóa lịch chạy cho '+schedule.workflowName+'?'))return;
        try{await api.studioScheduleDelete(schedule.id);await refreshSchedules();}
        catch(error){alert('Không thể xóa lịch: '+error.message);}
      });
      actions.append(toggle,remove);row.append(description,actions);list.append(row);
    }
  }
  async function createSchedule() {
    if(!current?.id)return alert('Hãy lưu và chọn một quy trình trước khi lập lịch.');
    try{
      await api.studioScheduleAdd({
        workflowId:current.id,
        nextRunAt:new Date(el('studio-schedule-at').value).toISOString(),
        intervalMinutes:Number(el('studio-schedule-interval').value)
      });
      await refreshSchedules();
    }catch(error){alert('Không thể lập lịch: '+error.message);}
  }

  function show() {
    el('modal-studio').classList.add('open');
    if(!el('studio-schedule-at').value)scheduleDateDefault();
    refreshSchedules().catch(console.error);
    updateProfiles().then(refreshList).then(() => {
      if (!current) createNew();
      return Promise.all([updateStatus(), recorderStatus()]);
    }).catch(error => alert(error.message));
  }
  function close() { el('modal-studio').classList.remove('open'); }
  function bind() {
    el('btn-open-studio').addEventListener('click', show);
    el('studio-close').addEventListener('click', close);
    el('studio-done').addEventListener('click', close);
    el('studio-new').addEventListener('click', createNew);
    el('studio-schedule-add').addEventListener('click',createSchedule);
    el('studio-workflow-search').addEventListener('input',()=>refreshList().catch(console.error));
    el('studio-graph-refresh').addEventListener('click', () => renderGraph().catch(console.error));
    el('studio-record-start').addEventListener('click', startRecording);
    el('studio-record-stop').addEventListener('click', stopRecording);
    el('studio-record-import').addEventListener('click', importRecording);
    el('studio-add-step').addEventListener('click', () => {
      if (!current) createNew();
      if (current.steps.length >= 40) return alert('Tối đa 40 bước');
      current.steps.push(drafts[el('studio-add-type').value]());
      renderSteps();
    });
    el('studio-save').addEventListener('click', async () => {
      try { await save(); alert('Đã lưu quy trình'); } catch (error) { alert('Không thể lưu: ' + error.message); }
    });
    el('studio-run').addEventListener('click', async () => {
      try { const item = await save(); await api.studioRun(item.id); await updateStatus(); }
      catch (error) { alert('Không thể chạy: ' + error.message); }
    });
    el('studio-stop').addEventListener('click', async () => {
      try { await api.studioStop(); await updateStatus(); } catch (error) { alert(error.message); }
    });
    el('studio-approve').addEventListener('click', async () => {
      try { await api.studioApprove(); await updateStatus(); } catch (error) { alert(error.message); }
    });
    setInterval(() => {
      if (el('modal-studio').classList.contains('open')) {
        updateStatus().catch(console.error);
        recorderStatus().catch(console.error);
      }
    }, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
