'use strict';

const { compileFlow } = require('./controlFlow');

const STEP_LABELS = Object.freeze({
  navigate: 'Mở URL', wait: 'Chờ', wait_for: 'Chờ phần tử',
  click: 'Nhấn phần tử', fill: 'Điền trường', assert_text: 'Kiểm tra văn bản',
  approval: 'Phê duyệt', if_exists: 'Nếu phần tử tồn tại',
  else: 'Nhánh không', end_if: 'Kết thúc nếu',
  repeat: 'Lặp', end_repeat: 'Kết thúc lặp'
});
const STRUCTURE = new Set(['if_exists','else','end_if','repeat','end_repeat']);
const NODE_W=218, NODE_H=58, Y_GAP=90;

function graphForSteps(steps) {
  const plan=compileFlow(steps);
  const scope=[];
  const nodes=[];
  const edges=[];
  const addEdge=(from,to,kind='flow',label='')=>{
    if(to>steps.length || to<0 || from<0 || from>=steps.length) return;
    edges.push({from,to,kind,label});
  };
  const nodeX=()=>112+scope.reduce((offset,s)=>{
    if(s.type==='repeat') return offset+88;
    return offset+(s.branch==='false' ? 312 : 0);
  },0);
  for(let i=0;i<steps.length;i++){
    const s=steps[i];
    if(s.type==='else') {
      const top=scope[scope.length-1];
      if(top && top.type==='if_exists') top.branch='false';
    }
    if(s.type==='end_if'||s.type==='end_repeat') scope.pop();
    const x=nodeX(),y=28+i*Y_GAP;
    const detail=s.type==='navigate' ? 'Trang được cho phép'
      : s.type==='if_exists'||s.type==='wait_for' ? (s.selector||'Phần tử CSS')
      : s.type==='repeat' ? (s.count+' lượt (tối đa 5)')
      : s.type==='fill' ? 'Giá trị nhập được ẩn trên sơ đồ'
      : s.type==='approval' ? 'Yêu cầu xác nhận thủ công'
      : s.type==='wait' ? (s.ms+' ms')
      : s.type==='click'||s.type==='assert_text' ? (s.selector||'Phần tử CSS')
      : '';
    nodes.push({index:i,type:s.type,label:STEP_LABELS[s.type]||s.type,
      detail:String(detail).slice(0,90),x,y,width:NODE_W,height:NODE_H,
      category:STRUCTURE.has(s.type)?'control':s.type==='approval'?'approval':'step'});
    if(s.type==='if_exists') scope.push({type:'if_exists',branch:'true'});
    if(s.type==='repeat') scope.push({type:'repeat'});
  }
  const terminal={index:steps.length,type:'end',label:'Kết thúc',
    detail:'',x:112,y:28+steps.length*Y_GAP,width:NODE_W,height:NODE_H,
    category:'end'};
  nodes.push(terminal);
  for(let i=0;i<steps.length;i++){
    const s=steps[i],next=i+1;
    if(s.type==='if_exists'){
      const pair=plan.conditions.get(i);
      addEdge(i, next===pair.elseIndex ? pair.endIndex : next,'true','Đúng');
      addEdge(i,pair.elseIndex>=0?pair.elseIndex:pair.endIndex,'false','Sai');
    }else if(s.type==='repeat'){
      addEdge(i,next,'loop-enter',s.count+' lần');
    }else if(s.type==='end_repeat'){
      const start=plan.repeatBack.get(i);
      addEdge(i,start+1,'loop-back','Lặp lại');
      addEdge(i,next,'loop-exit','Hết lượt');
    }else if(s.type==='else'){
      addEdge(i,next);
    }else if(s.type==='end_if'){
      addEdge(i,next);
    }else if(s.type==='wait'||s.type==='navigate'||s.type==='click'||
      s.type==='fill'||s.type==='assert_text'||s.type==='wait_for'||s.type==='approval'){
      // A successful "true" branch bypasses its else body.
      if(steps[next]?.type==='else'){
        const finish=plan.elseEnds.get(next);
        addEdge(i,finish,'join');
      }else addEdge(i,next);
    }else {
      addEdge(i,next);
    }
  }
  const width=Math.max(800,...nodes.map(n=>n.x+NODE_W+70));
  return {
    nodes,edges,width,height:terminal.y+NODE_H+30,
    worstCaseSteps:plan.worstCaseSteps,
    note:'Sơ đồ chỉ minh họa các nhánh trong quy trình đã xác thực. Không có lệnh tùy ý hoặc điều hướng ngoài tên miền được phép.'
  };
}
module.exports={graphForSteps};
