const assert=require('assert');
const {graphForSteps}=require('../src/automation/flowGraph');
function getEdge(graph,from,kind){return graph.edges.find(e=>e.from===from&&e.kind===kind);}
const program=[
 {type:'navigate',url:'https://example.com/'},
 {type:'approval',label:'Xác nhận'},
 {type:'repeat',count:3},
 {type:'if_exists',selector:'#found'},
 {type:'click',selector:'#next'},
 {type:'else'},
 {type:'assert_text',selector:'h1',text:'Demo'},
 {type:'end_if'},
 {type:'end_repeat'},
 {type:'wait',ms:300}
];
const g=graphForSteps(program);
assert.strictEqual(g.nodes.length,program.length+1);
assert.strictEqual(g.nodes[g.nodes.length-1].type,'end');
assert.strictEqual(getEdge(g,3,'true').to,4);
assert.strictEqual(getEdge(g,3,'false').to,5);
assert.strictEqual(getEdge(g,8,'loop-back').to,3);
assert.strictEqual(getEdge(g,8,'loop-exit').to,9);
assert.strictEqual(getEdge(g,4,'join').to,7);
assert.strictEqual(g.nodes[3].category,'control');
assert(g.width>=800);
assert(g.height>g.nodes[0].y);
assert(!JSON.stringify(g).includes('Điền nội dung bí mật'));
const hide=graphForSteps([
 {type:'navigate',url:'https://example.com/'},
 {type:'approval'},
 {type:'fill',selector:'#name',value:'DO_NOT_EXPOSE_ON_GRAPH'}
]);
assert(!JSON.stringify(hide).includes('DO_NOT_EXPOSE_ON_GRAPH'));
assert.strictEqual(hide.edges[hide.edges.length-1].to,3);
assert.throws(()=>graphForSteps([{type:'else'}]),/Nếu không/);
assert.throws(()=>graphForSteps([{type:'repeat',count:11},{type:'end_repeat'}]),/2–5/);

// Layout: false branch stays visually distinct, but data is never exposed.
assert(g.nodes[6].x > g.nodes[4].x);
assert(g.nodes.some(n=>n.category==='approval'));
assert(g.edges.some(e=>e.kind==='false' && e.label==='Sai'));
assert(!g.edges.some(e=>e.from===4 && e.to===6));

console.log('Graph projection: branches, loops, secret masking and malformed blocks passed');
