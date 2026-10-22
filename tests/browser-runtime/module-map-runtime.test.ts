import fs from 'fs';
import path from 'path';
import vm from 'vm';
import os from 'os';

const importer = 'http://localhost:9527/chunks/aa/source.js';
const newerMap = {scopes:{'./chunks/aa/source.js':{'__unresolved_1':'./chunks/bb/different.js'}}};
const diagnostic = {source:'/project/Probe.ts',import:'./Different',line:2,column:3};
const source = () => fs.readFileSync(path.resolve(__dirname,'../../src/core/scene/runtime/browser-assets/module-map-runtime.js'),'utf8').replace(/export function /g,'function ');
function setup(map: object = newerMap, fetchOverride?: any, options: object = {}) {
    const fetch = jest.fn(fetchOverride || (async (url: URL) => ({ok:true,json:async()=>url.pathname.endsWith('module-diagnostic')?diagnostic:map})));
    const context:any={URL,AbortController,setTimeout,clearTimeout,fetch,console:{warn:jest.fn()}};
    vm.runInNewContext(source()+';globalThis.install=installModuleMapDiagnostics;',context);
    const original=new Error('SystemJS failed');
    const system={resolve:jest.fn(async (_specifier:string,_importer:string)=>{throw original;})};
    context.install(system,'http://localhost:9527',{requestTimeoutMs:15,...options});
    return {system,fetch,original,context};
}
test('requires a reload instead of accepting an unverified latest mapping',async()=>{
    const {system,fetch}=setup();
    await expect(system.resolve('__unresolved_1',importer)).rejects.toThrow('ScriptModuleRuntimeReloadRequired');
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({cache:'no-store'}));
});
test('reports latest compilation details without claiming they describe the loaded revision',async()=>{
    const {system}=setup({scopes:{}});
    await expect(system.resolve('__unresolved_1',importer)).rejects.toThrow('Latest compiled import: ./Different');
});
test('leaves ordinary resolution errors unchanged',async()=>{
    const {system,fetch,original}=setup();
    await expect(system.resolve('some-package',importer)).rejects.toBe(original);
    expect(fetch).not.toHaveBeenCalled();
});
test('supports explicit backend endpoints and map base',async()=>{
    const {system,fetch}=setup(newerMap,undefined,{
        packMapURL:'http://localhost:9527/backend/scripting/x/pack-import-map-url',
        diagnosticURL:'http://localhost:9527/backend/scripting/module-diagnostic',
        mapBaseURL:'http://localhost:9527/backend/scripting/x/pack-import-map-url',
    });
    await expect(system.resolve('__unresolved_1','http://localhost:9527/backend/scripting/x/chunks/aa/source.js')).rejects.toThrow('ScriptModuleRuntimeReloadRequired');
    expect(fetch.mock.calls[0][0].pathname).toBe('/backend/scripting/x/pack-import-map-url');
    expect(fetch.mock.calls[1][0].pathname).toBe('/backend/scripting/module-diagnostic');
});
test.each(['request','body','map-request','map-body'])('bounds stalled %s without losing the original failure',async stall=>{
    const never=new Promise(()=>{});
    const {system,fetch}=setup(newerMap,async(url:URL)=>{
        const isMap=url.pathname.endsWith('pack-import-map-url');
        if((stall==='request'&&!isMap)||(stall==='map-request'&&isMap))return never;
        return {ok:true,json:()=>((stall==='body'&&!isMap)||(stall==='map-body'&&isMap))?never:Promise.resolve(isMap?newerMap:diagnostic)};
    });
    await expect(system.resolve('__unresolved_1',importer)).rejects.toThrow('SystemJS failed');
    expect(fetch.mock.calls.some(call=>(call[1] as any).signal.aborted)).toBe(true);
});
test('real Cocos SystemJS does not execute an old chunk with a different revision dependency',async()=>{
    const host=process.env.COCOS_CLI_ROOT || path.dirname(require.resolve('cocos-cli/package.json'));
    const {build}=require(require.resolve('@cocos/module-system',{paths:[host]}));
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'module-revision-loader-'));
    const output=path.join(directory,'system.js');
    const {context}=setup();
    Object.assign(context,{location:{href:'http://localhost:9527/',origin:'http://localhost:9527'},document:{querySelector:()=>null,querySelectorAll:()=>[]},addEventListener:()=>undefined});
    context.self=context.window=context.global=context;
    try {
        await build({out:output,minify:false,sourceMap:false,platform:'web-mobile',editor:true});
        vm.runInNewContext(fs.readFileSync(output,'utf8'),context);
        const system=context.System;
        system.setResolutionDetailMapCallback(async()=>({json:{},url:'http://localhost:9527/details'}));
        context.install(system,'http://localhost:9527',{requestTimeoutMs:100});
        let executed=false;
        const instantiate=jest.fn(async(url:string)=>{
            if(url!==importer)throw Error('Different dependency must not be loaded: '+url);
            // Saved old revision imported ./Existing. The new revision reused this URL
            // and placeholder for ./Different; accepting the map would produce old:DIFFERENT.
            system.register(['__unresolved_1'],(exporter:any)=>{
                let value:string;
                return {setters:[(module:any)=>{value=module.value;}],execute(){executed=true;exporter('value','old:'+value);}};
            });
            return system.getRegister();
        });
        system.instantiate=instantiate;
        await expect(system.import(importer)).rejects.toThrow('ScriptModuleRuntimeReloadRequired');
        expect(executed).toBe(false);
        expect(instantiate).toHaveBeenCalledTimes(1);
    } finally {
        expect(path.basename(directory).startsWith('module-revision-loader-')).toBe(true);
        expect(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)).toBe(true);
        fs.rmSync(directory,{recursive:true,force:true});
    }
});
