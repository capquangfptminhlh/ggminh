'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('src/ui/index.html'),client=read('src/ui/workflowStudio.js');
const preload=read('preload.js'),main=read('main.js');
for(const id of ['studio-schedule-at','studio-schedule-interval','studio-schedule-add','studio-schedule-list']){
 assert(html.includes('id="'+id+'"'),'Missing schedule control '+id);
 assert(client.includes("'"+id+"'"),'Schedule control not wired '+id);
}
for(const op of ['studioScheduleList','studioScheduleAdd','studioScheduleEnable','studioScheduleDelete'])
 assert(preload.includes(op)&&client.includes(op),'IPC/client wiring missing '+op);
assert(main.includes('new LocalScheduler(storageDir, workflowStore, automationRunner)'));
assert(main.includes('schedulerTimer = setInterval('));
assert(main.includes('if (schedulerTimer) clearInterval(schedulerTimer)'));
assert(html.includes('Chỉ chạy quy trình chỉ đọc'));
console.log('Scheduler UI wiring and in-app lifecycle tests passed');
