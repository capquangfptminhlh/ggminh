'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const menu=document.getElementById('lhm-tools-menu');
 if(!menu)return;
 // Native <details> keeps keyboard and screen-reader semantics.
 menu.querySelector('.lhm-tools-panel').addEventListener('click',event=>{
  if(event.target.closest('button'))menu.open=false;
 });
 document.addEventListener('click',event=>{
  if(menu.open&&!menu.contains(event.target))menu.open=false;
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}
 });
});