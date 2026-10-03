import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const handlers={},calls=[],timers=new Map();let serial=0;
const api={};
for(const name of ['onAdd','onParamFromApp','onKeyDown','onRun','onClear','onConnected'])api[name]=fn=>handlers[name]=fn;
for(const name of ['setGifPathIcon','hotkey','openUrl','showAlert','logMessage','connect'])api[name]=(...args)=>calls.push([name,...args]);
vm.runInNewContext(await readFile(new URL('./ulanzi-motion/plugin.js',import.meta.url),'utf8'),{$UD:api,setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)});
const context='test-control',param={IdleIcon:'idle.gif',PressIcon:'press.gif',Kind:'hotkey',Command:'Ctrl+Alt+F6'};
handlers.onAdd({context,param});
handlers.onKeyDown({context});
assert.equal(calls.filter(c=>c[0]==='hotkey').length,0,'keydown changes image only');
assert.deepEqual(calls.at(-1),['setGifPathIcon',context,'press.gif','']);
handlers.onRun({context});
assert.deepEqual(calls.at(-1),['hotkey','Ctrl+Alt+F6']);
assert.equal(calls.filter(c=>c[0]==='hotkey').length,1,'one command per confirmed press');
assert.equal(timers.size,1,'repeated visual trigger replaces previous timer');
for(const callback of timers.values())callback();
assert.deepEqual(calls.at(-1),['setGifPathIcon',context,'idle.gif','']);
handlers.onRun({context:'unknown'});
assert.deepEqual(calls.at(-1),['showAlert','unknown']);
handlers.onClear({param:[{context}]});handlers.onRun({context});
assert.deepEqual(calls.at(-1),['showAlert',context],'removed actions cannot execute');
console.log('PASS motion press feedback, single dispatch, idle restore, missing/removed action guard');

// Exercise the real vendored SDK against a local fake Ulanzi host, never the device.
const { createServer } = await import('node:http');
const { WebSocketServer } = await import('ws');
const { default: puppeteer } = await import('puppeteer');
const server=createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://local').pathname;
    if(!/^\/(?:app\.html|plugin\.js|libs\/[A-Za-z]+\.js)$/.test(pathname)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',pathname.endsWith('.html')?'text/html':'text/javascript');
    res.end(await readFile(new URL('./ulanzi-motion'+pathname,import.meta.url)));
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const host=new WebSocketServer({server}),packets=[];
let client;
host.on('connection',socket=>{client=socket;socket.on('message',raw=>packets.push(JSON.parse(String(raw))));});
const browser=await puppeteer.launch({headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const port=server.address().port;
 await page.goto(`http://127.0.0.1:${port}/app.html?port=${port}`);
 const wait=async(predicate)=>{for(let n=0;n<50;n++){if(predicate())return;await new Promise(r=>setTimeout(r,40));}throw Error('SDK message timeout: '+JSON.stringify(packets));};
 await wait(()=>packets.some(p=>p.cmd==='connected'));
 const message={uuid:'com.ulanzi.ulanzistudio.carruleddhi.control',key:'0_0',actionid:'fixture'};
 client.send(JSON.stringify({...message,cmd:'add',param}));
 await wait(()=>packets.some(p=>p.param?.statelist?.[0]?.gifpath==='idle.gif'));
 client.send(JSON.stringify({...message,cmd:'keydown'}));
 client.send(JSON.stringify({...message,cmd:'run'}));
 await wait(()=>packets.some(p=>p.keylist==='Ctrl+Alt+F6'));
 assert.equal(packets.filter(p=>p.keylist==='Ctrl+Alt+F6').length,1);
 assert(packets.some(p=>p.param?.statelist?.[0]?.gifpath==='press.gif'));
 assert.deepEqual(errors,[]);
 console.log('PASS real Ulanzi SDK: registration, action parameters, press icon and exactly one hotkey dispatch');
}finally{await browser.close();for(const socket of host.clients)socket.terminate();await new Promise(r=>host.close(r));await new Promise(r=>server.close(r));}
