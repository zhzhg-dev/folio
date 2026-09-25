import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { sourceFromText, exportWord, exportBackup, restoreBackup, exportHtml, readFile } from "../lib/folio/files.ts";
import { makeProject } from "../lib/folio/model.ts";
let captured;
const oldDocument=globalThis.document;
const oldCreate=URL.createObjectURL;
globalThis.document={createElement:()=>({click(){},href:"",download:""})};
URL.createObjectURL=blob=>{captured=blob;return "blob:folio-test";};
test.after(()=>{globalThis.document=oldDocument;URL.createObjectURL=oldCreate;});
async function fixture(){const p=makeProject("资料导出验证", "zh");const source=await sourceFromText("Evidence","Offline exports are supported.");p.sources=[source];p.content={type:"doc",content:[{type:"heading",attrs:{level:2},content:[{type:"text",text:"My own analysis"}]},{type:"paragraph",content:[{type:"text",text:"中文正文 remains editable."},{type:"citation",attrs:{sourceId:source.id,versionId:source.versions[0].id,page:1,label:"1",quote:source.versions[0].text}}]}]};return p;}
test("Word output retains document text and exact source evidence",async()=>{const p=await fixture();await exportWord(p);const zip=unzipSync(new Uint8Array(await captured.arrayBuffer()));const xml=strFromU8(zip["word/document.xml"]);assert.ok(xml.includes("My own analysis"));assert.ok(xml.includes("中文正文 remains editable."));assert.ok(xml.includes("Offline exports are supported."));});
test("backup round trip retains original files, citations and snapshots",async()=>{const p=await fixture();p.snapshots=[{id:"snapshot",title:"First draft",content:structuredClone(p.content),reportTitle:p.reportTitle,createdAt:p.createdAt}];await exportBackup(p);const backup=captured;const restored=await restoreBackup(new File([backup],"test.folio.json"));assert.notEqual(restored.id,p.id);assert.deepEqual(restored.content,p.content);assert.deepEqual(restored.snapshots,p.snapshots);assert.equal(await restored.sources[0].versions[0].original.text(),p.sources[0].versions[0].text);});
test("tampered original files in a backup are rejected",async()=>{const p=await fixture();await exportBackup(p);const json=JSON.parse(await captured.text());json.project.sources[0].versions[0].originalBase64=btoa("tampered");await assert.rejects(()=>restoreBackup(new File([JSON.stringify(json)],"bad.folio.json")),/checksum/);});
test("HTML export escapes document text rather than executing markup",async()=>{const p=await fixture();p.reportTitle='<script>alert("x")</script>';exportHtml(p);const text=await captured.text();assert.ok(!text.includes('<script>'));assert.ok(text.includes('&lt;script&gt;'));});
test("empty source files and unsupported types are rejected",async()=>{await assert.rejects(()=>readFile(new File([""],"empty.txt")),/No text/);await assert.rejects(()=>readFile(new File(["binary"],"file.exe")),/Supported/);});
