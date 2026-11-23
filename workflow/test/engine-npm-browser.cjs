'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { parseArgs } = require('node:util');
const assert = require('node:assert/strict');

async function verifyBrowser({ root, browser, output, engine }) {
 root = fs.realpathSync(root); output = path.resolve(output); fs.mkdirSync(output, { recursive: true });
 const server = http.createServer((req, res) => {
  if (engine && req.url === '/npm-import-smoke.html') { res.setHeader('Content-Type','text/html'); return res.end('<div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas" width="320" height="240"></canvas></div></div><script type="module">try { const cc=await import("/npm-engine/index.mjs"); const n=new cc.Node("npm-direct-import"); n.addComponent(cc.Sprite); globalThis.__npmImport={node:n.name,sprite:!!n.getComponent(cc.Sprite),game:typeof cc.game.init}; } catch(error) {globalThis.__npmImport={error:String(error)};}</script>'); }
  if (engine && req.url.startsWith('/npm-engine/')) { const relative=decodeURIComponent(req.url.slice('/npm-engine/'.length).split('?')[0]); const base=path.resolve(engine,'runtime/web'); const file=path.resolve(base,relative);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type','text/javascript');return fs.createReadStream(file).pipe(res); }

  if (req.url === '/npm-smoke.png') { res.setHeader('Content-Type','image/png'); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=','base64')); }
  let file; try { file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname)); } catch { res.statusCode=400; return res.end(); }
  if(file!==root&&!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  if(file===root||fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.statusCode=404;return res.end();}
  const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json','.wasm':'application/wasm','.png':'image/png'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let child, socket;
 try {
  child=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0','--user-data-dir='+path.join(output,'browser-profile'),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(new Error('Browser startup timeout')),30000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.stderr.on('data',data=>{stderr+=data;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let id=0;const pending=new Map(),errors=[];
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const task=pending.get(m.id);if(task){pending.delete(m.id);m.error?task.reject(new Error(JSON.stringify(m.error))):task.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
  function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const n=++id;const timeout=setTimeout(()=>{pending.delete(n);reject(new Error(method+' timed out'));},30000);pending.set(n,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});}
  const target=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'},sessionId);
  let result;
  for(let attempt=0;attempt<60;attempt++){
   const r=await send('Runtime.evaluate',{expression:'(async()=>{if(!globalThis.System)return null;const cc=await System.import("cc");const scene=cc.director.getScene();if(!scene||cc.director.getTotalFrames()<5)return null;return {scene:scene.name,frames:cc.director.getTotalFrames(),canvas:[cc.game.canvas.width,cc.game.canvas.height]};})()',awaitPromise:true,returnByValue:true},sessionId);
   result=r.result?.value;if(result)break;await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(result,'No running scene within 30 seconds');
  const asset=await send('Runtime.evaluate',{expression:'(async()=>{const cc=await System.import("cc");const image=await new Promise((resolve,reject)=>cc.assetManager.loadRemote(location.origin+"/npm-smoke.png",{ext:".png"},(error,asset)=>error?reject(error):resolve(asset)));const texture=new cc.Texture2D();texture.image=image;const frame=new cc.SpriteFrame();frame.texture=texture;const scene=cc.director.getScene();let canvas=scene.getChildByName("Canvas");if(!canvas){canvas=new cc.Node("Canvas");scene.addChild(canvas);canvas.addComponent(cc.Canvas);}const node=new cc.Node("NpmImageSmoke");node.layer=cc.Layers.Enum.UI_2D;canvas.addChild(node);node.addComponent(cc.UITransform).setContentSize(64,64);node.addComponent(cc.Sprite).spriteFrame=frame;return {width:image.width,height:image.height,sprite:!!node.getComponent(cc.Sprite).spriteFrame};})()',awaitPromise:true,returnByValue:true},sessionId);
  assert.ok(!asset.exceptionDetails,JSON.stringify(asset.exceptionDetails));assert.ok(asset.result?.value?.sprite,'Image/Sprite creation failed');
  await new Promise(resolve=>setTimeout(resolve,1000));const frameCheck=await send('Runtime.evaluate',{expression:'System.import("cc").then(cc=>cc.director.getTotalFrames())',awaitPromise:true,returnByValue:true},sessionId);assert.ok(frameCheck.result?.value>result.frames,'Scene frames stopped advancing');result.framesAfter=frameCheck.result.value;const capture=await send('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(path.join(output,'web.png'),Buffer.from(capture.data,'base64'));
  let npmImport;
  if(engine) {
   const next=await send('Target.createTarget',{url:'about:blank'});const attached=await send('Target.attachToTarget',{targetId:next.targetId,flatten:true});
   await send('Page.enable',{},attached.sessionId);await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/npm-import-smoke.html'},attached.sessionId);
   for(let attempt=0;attempt<30;attempt++){const value=await send('Runtime.evaluate',{expression:'globalThis.__npmImport',returnByValue:true},attached.sessionId);npmImport=value.result?.value;if(npmImport)break;await new Promise(resolve=>setTimeout(resolve,300));}
   assert.ok(npmImport?.sprite,JSON.stringify(npmImport));assert.equal(npmImport.game,'function');
  }
  const report={status:'passed',...result,image:asset.result.value,npmImport,uncaughtErrors:errors};assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));return report;
 } finally {socket?.close();child?.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={verifyBrowser};
if(require.main===module){const {values}=parseArgs({options:{root:{type:'string'},engine:{type:'string'},browser:{type:'string'},output:{type:'string'}}});if(!values.root||!values.browser||!values.output)throw Error('Required: --root BUILT_WEB --browser CHROME_EXE --output REPORT_DIR');verifyBrowser(values).then(console.log).catch(error=>{console.error(error);process.exitCode=1;});}
