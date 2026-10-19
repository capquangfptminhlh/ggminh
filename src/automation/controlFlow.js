'use strict';

// Structural validation for a small, bounded visual automation language.
// Steps have no arbitrary GOTO, recursion, scripting expressions or external commands.
const START = new Set(['if_exists', 'repeat']);
function compileFlow(steps) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 40) {
    throw Error('Quy trình phải có 1–40 bước');
  }
  const stack = [], conditions = new Map(), elseEnds = new Map();
  const repeats = new Map(), repeatBack = new Map();
  const depths = [];
  let worst = 0, factor = 1;
  for (let i=0; i<steps.length; i++) {
    const step=steps[i];
    if (!step || typeof step.type !== 'string') throw Error('Bước ' + (i+1) + ' không hợp lệ');
    const type=step.type;
    const depth=stack.length;
    depths[i]=depth;
    if (type==='if_exists' || type==='repeat') {
      if (depth >= 2) throw Error('Chỉ cho phép tối đa 2 tầng điều kiện/vòng lặp');
      stack.push({type,index:i,elseIndex:-1});
      if(type==='repeat') {
        if(!Number.isInteger(step.count) || step.count < 2 || step.count > 5) throw Error('Số vòng lặp phải từ 2–5');
        factor*=step.count;
      }
    } else if (type==='else') {
      const top=stack[stack.length-1];
      if (!top || top.type!=='if_exists' || top.elseIndex!==-1) throw Error('Bước Nếu không phải nằm đúng trong một điều kiện');
      top.elseIndex=i;
    } else if (type==='end_if' || type==='end_repeat') {
      const top=stack.pop();
      if(!top || (type==='end_if' && top.type!=='if_exists') ||
          (type==='end_repeat' && top.type!=='repeat'))
        throw Error('Khối điều kiện hoặc vòng lặp đóng sai ở bước ' + (i+1));
      if(type==='end_if'){
        conditions.set(top.index,{elseIndex:top.elseIndex,endIndex:i});
        if(top.elseIndex>=0) elseEnds.set(top.elseIndex,i);
      }else{
        repeats.set(top.index,i);
        repeatBack.set(i,top.index);
        factor/=steps[top.index].count;
      }
    }
    worst += factor;
    if(worst>160) throw Error('Quy trình vượt giới hạn 160 lượt xử lý (bao gồm vòng lặp)');
  }
  if(stack.length) throw Error('Chưa đóng khối ' + (stack[stack.length-1].type==='repeat'?'Lặp':'Nếu') + ' bắt đầu tại bước ' + (stack[stack.length-1].index+1));
  return {conditions,elseEnds,repeats,repeatBack,depths,worstCaseSteps:worst};
}
module.exports={compileFlow,START};
