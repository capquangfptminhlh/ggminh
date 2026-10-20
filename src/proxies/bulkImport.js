'use strict';

/** Small strict CSV parser for public proxy endpoints (no credentials). */
function parseProxyCsv(input) {
  if (typeof input!=='string' || Buffer.byteLength(input,'utf8')>65536)
    throw Error('CSV phải là văn bản tối đa 64 KiB');
  const raw=input.replace(/^\uFEFF/,'');
  const rows=[],fields=[];
  let field='',quoted=false,endedQuote=false;
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(quoted){
      if(ch==='"'&&raw[i+1]==='"'){field+='"';i++;}
      else if(ch==='"'){quoted=false;endedQuote=true;}
      else field+=ch;
    }else if(ch==='"' && !field && !endedQuote)quoted=true;
    else if(ch===','){
      fields.push(field);field='';endedQuote=false;
    }else if(ch==='\n'||ch==='\r'){
      fields.push(field);field='';endedQuote=false;
      if(fields.some(x=>x.trim()))rows.push(fields.splice(0));
      else fields.length=0;
      if(ch==='\r'&&raw[i+1]==='\n')i++;
    }else{
      if(endedQuote && ch!==' ' && ch!=='\t')throw Error('Dữ liệu CSV sau dấu ngoặc kép không hợp lệ');
      field+=ch;
    }
    if(field.length>300)throw Error('Một trường CSV quá dài');
    if(rows.length>101)throw Error('Chỉ nhập tối đa 100 proxy mỗi lần');
  }
  if(quoted)throw Error('Dấu ngoặc kép CSV chưa được đóng');
  if(field||fields.length){
    fields.push(field);
    if(fields.some(x=>x.trim()))rows.push(fields.slice());
  }
  if(!rows.length)throw Error('CSV chưa có dữ liệu');
  const cols=rows.shift().map(x=>x.trim().toLowerCase());
  if(cols.join(',')!=='name,type,host,port,tag')
    throw Error('CSV phải đúng 5 cột: name,type,host,port,tag. Không chấp nhận cột tài khoản hoặc mật khẩu.');
  if(!rows.length || rows.length>100)throw Error('Nhập từ 1 đến 100 dòng proxy');
  return rows.map((row,i)=>{
    if(row.length!==5)throw Error('Dòng '+(i+2)+' phải có 5 cột');
    const [name,type,host,port,tag]=row.map(x=>x.trim());
    if(!name||!type||!host||!port)throw Error('Dòng '+(i+2)+' thiếu tên, giao thức, host hoặc port');
    return {name,type,host,port,tag};
  });
}
module.exports={parseProxyCsv};
