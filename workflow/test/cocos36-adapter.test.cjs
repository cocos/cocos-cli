'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {getEngineBackendAdapter}=require('../../adapters/engine/registry.cjs');
const compiler=require('../../adapters/engine/cocos36/compiler.cjs');
test('stable 3.6.0 through 3.6.3 select an independent experimental backend',()=>{
    for(let patch=0;patch<=3;patch++){
        const selection={path:path.resolve('fixture'),version:'3.6.'+patch};const adapter=getEngineBackendAdapter(selection);
        assert.equal(adapter.id,'cocos-3.6-runtime');assert.equal(adapter.runtimeSupport,'experimental');
        assert.equal(adapter.compile(selection).compilerModule,'adapters/engine/cocos36/compiler.cjs');
        assert.equal(adapter.runtime(selection).engineDev,path.join(selection.path,'bin/.cache/dev-cli-3.6'));
        assert.equal(adapter.inspect(selection).capabilities.poseGraph.status,'not-implemented');
        assert.equal(adapter.runtime(selection).requiredModules.includes('cc/editor/material'),true);
    }
    for(const version of ['3.6.4','3.6.3-beta.0'])assert.equal(getEngineBackendAdapter({path:path.resolve('fixture'),version}).runtimeSupport,'discovery-only');
});
test('3.6 source identity cannot be satisfied by 3.8 caches or metadata',t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'cocos36-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    fs.mkdirSync(path.join(root,'editor/engine-features'),{recursive:true});fs.writeFileSync(path.join(root,'cc.config.json'),'{}');fs.writeFileSync(path.join(root,'editor/engine-features/render-config.json'),'{}');
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'3.8.0'}));assert.throws(()=>compiler.identity(root),/Unsupported source version/);
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'3.6.3'}));assert.equal(compiler.identity(root).version,'3.6.3');
    const adapter=getEngineBackendAdapter({path:root,version:'3.6.3'});assert.equal(adapter.inspect({path:root,version:'3.6.3'}).capabilities.sceneEditing.status,'missing');
});

test('3.6 prefab instances use engine-owned metadata and do not modify source asset data', () => {
    class Info { constructor() { this.instance = null; } }
    class Instance {}
    class Prefab { constructor() { this.data = { _prefab: new Info() }; } _instantiate() { return { uuid: 'new-instance', _prefab: this.data._prefab }; } }
    Prefab._utils = { PrefabInfo: Info, PrefabInstance: Instance };
    const codec=Object.fromEntries(['CCON','encodeCCONBinary','decodeCCONBinary','BufferBuilder'].map(k=>[k,function(){}]));
    const animation={VariableType:{FLOAT:0,BOOLEAN:1,TRIGGER:2,INTEGER:3}};
    const adapter=getEngineBackendAdapter({path:path.resolve('fixture'),version:'3.6.3'});
    adapter.configureRuntime({VERSION:'3.6.3',cclegacy:{internal:{}},Prefab}, id=>id==='cc/editor/new-gen-anim'?animation:codec);
    const asset=new Prefab();const node=asset._instantiate();assert.notEqual(node._prefab,asset.data._prefab);assert.equal(asset.data._prefab.instance,null);assert.ok(node._prefab.instance instanceof Instance);assert.equal(node._prefab.instance.fileId,node.uuid);assert.equal(node._prefab.instance.expanded,true);
});
test('3.6 variable creation delegates to real legacy graph methods and rejects unsupported types',()=>{
    class Graph { addFloat(name,value=0){return {name,value};} addBoolean(name,value=false){return {name,value};} }
    const animation={AnimationGraph:Graph,VariableType:{FLOAT:0,BOOLEAN:1,TRIGGER:2,INTEGER:3}};
    const codec=Object.fromEntries(['CCON','encodeCCONBinary','decodeCCONBinary','BufferBuilder'].map(k=>[k,function(){}]));
    const adapter=getEngineBackendAdapter({path:path.resolve('fixture'),version:'3.6.3'});
    adapter.configureRuntime({VERSION:'3.6.3',cclegacy:{internal:{}}},id=>id==='cc/editor/new-gen-anim'?animation:codec);
    const graph=new Graph();assert.deepEqual(graph.addVariable('speed',0,1.5),{name:'speed',value:1.5});assert.deepEqual(graph.addVariable('flag',1),{name:'flag',value:false});assert.throws(()=>graph.addVariable('vector',99),{code:'ENGINE_CAPABILITY_UNAVAILABLE'});
});

test('3.6 blend base aliases the selected runtime superclass', () => {
    class Blend {}
    class Blend1D extends Blend {}
    const animation={AnimationBlend1D:Blend1D,VariableType:{FLOAT:0,INTEGER:3}};
    const codec=Object.fromEntries(['CCON','encodeCCONBinary','decodeCCONBinary','BufferBuilder'].map(k=>[k,function(){}]));
    const adapter=getEngineBackendAdapter({path:path.resolve('fixture'),version:'3.6.3'});
    adapter.configureRuntime({VERSION:'3.6.3',cclegacy:{internal:{}}},id=>id==='cc/editor/new-gen-anim'?animation:codec);
    assert.equal(animation.AnimationBlend,Blend);assert.ok(new Blend1D() instanceof animation.AnimationBlend);
});

test('early 3.6 probe notifications delegate to native lighting-cache invalidation', () => {
    class Probe { clearAllSHUBOs() { this.invalidations = (this.invalidations || 0) + 1; } clearSHCoefficients() { this.cleared = true; this.clearAllSHUBOs(); } }
    const codec=Object.fromEntries(['CCON','encodeCCONBinary','decodeCCONBinary','BufferBuilder'].map(k=>[k,function(){}]));
    const adapter=getEngineBackendAdapter({path:path.resolve('fixture'),version:'3.6.0'});
    adapter.configureRuntime({VERSION:'3.6.0',cclegacy:{internal:{}},js:{getClassByName:()=>Probe}},()=>codec);
    const probe = new Probe();probe.onProbeBakeFinished();assert.equal(probe.invalidations,1);
    probe.onProbeBakeCleared();assert.equal(probe.invalidations,2);assert.equal(probe.cleared,true);
});
