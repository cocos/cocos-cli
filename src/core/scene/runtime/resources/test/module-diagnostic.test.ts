import { describeChunkImport } from '../module-diagnostic';
const id = '6d8fd2b0177941b032ddc0733af48a561fb60657';
const record = {modules:{'db://assets/ReproProbe.ts':{chunkId:id,imports:[{value:'./CurrentValue',resolved:'__unresolved_1',loc:{start:{line:2,column:22}}}]}}};
test('matches original imports by recorded placeholder rather than array index',()=>{
    expect(describeChunkImport(record,`http://localhost:9527/chunks/6d/${id}.js`,'__unresolved_1')).toEqual({source:'db://assets/ReproProbe.ts',import:'./CurrentValue',line:2,column:23});
});
test('invalid paths and unknown placeholders do not expose arbitrary files',()=>{
    expect(describeChunkImport(record,'../../secret','__unresolved_1')).toBeUndefined();
    expect(describeChunkImport(record,`/chunks/6d/${id}.js`,'__unresolved_2')).toBeUndefined();
});
