// UI smoke test: runs the real engine + UI scripts against a tiny DOM stub.
// Covers the live-input wiring that the DOM-free engine tests cannot reach.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const engineSrc=fs.readFileSync(path.join(__dirname,'engine.js'),'utf8');
const uiSrc=fs.readFileSync(path.join(__dirname,'ui.js'),'utf8');

const els={};
class El{
  constructor(tag){
    this.tagName=(tag||'div').toUpperCase();this.children=[];this.dataset={};
    this.style={setProperty(){},display:''};this._cls=new Set();this._html='';
    this.textContent='';this.value='';this.type='';this.checked=false;this.files=[];this._id='';
    const self=this;
    this.classList={add:c=>self._cls.add(c),remove:c=>self._cls.delete(c),
      toggle:(c,on)=>on?self._cls.add(c):self._cls.delete(c),contains:c=>self._cls.has(c)};
  }
  set id(v){this._id=v;els[v]=this}
  get id(){return this._id}
  set className(v){this._cls=new Set(String(v).split(/\s+/).filter(Boolean))}
  get className(){return [...this._cls].join(' ')}
  set innerHTML(v){this._html=v;if(v==='')this.children=[]}
  get innerHTML(){return this._html}
  appendChild(x){this.children.push(x);return x}
  add(x){this.children.push(x);return x}
  querySelector(){return getEl('__q')}
  querySelectorAll(){return []}
  addEventListener(){}
  click(){}
  focus(){}
}
const getEl=id=>els[id]||(els[id]=new El(
  /^grid|^tracks$/.test(id)?'div':/^(arm|play|refresh|panic|save|load|del|export|importBtn|loadPreset|copyIni)$/.test(id)?'button':
  /^(port|inPort|scale|root|patList|presetList|recTrack)$/.test(id)?'select':'input'));
const store={};
const localStorage={getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
  setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
const sent=[];
const out={id:'out1',name:'DROID X7 MIDI',state:'connected',send:(b,ts)=>sent.push({b:[...b],ts})};
const thru={id:'thru',name:'Midi Through Port-0',state:'connected',onmidimessage:null};
const inp={id:'in1',name:'nanoKEY2 KEYBOARD',state:'connected',onmidimessage:null};
const access={inputs:new Map([['thru',thru],['in1',inp]]),outputs:new Map([['out1',out]]),onstatechange:null};

global.document={getElementById:getEl,createElement:t=>new El(t),addEventListener(){},createRange(){return null}};
global.localStorage=localStorage;global.window=global;
global.Option=function(text,value){this.text=text;this.value=value};
global.requestAnimationFrame=()=>0;
global.alert=()=>{};global.confirm=()=>true;
global.URL={createObjectURL:()=>'',revokeObjectURL(){}};global.Blob=function(){};
global.getSelection=()=>({removeAllRanges(){},addRange(){}});
global.location={protocol:'http:'};
Object.defineProperty(globalThis,'navigator',{value:{requestMIDIAccess:async()=>access},configurable:true});

vm.runInThisContext(engineSrc,{filename:'engine.js'});
vm.runInThisContext(uiSrc,{filename:'ui.js'});

(async()=>{
  await new Promise(r=>setTimeout(r,20));
  assert.strictEqual(els.tracks.children.length,5,'five track panels');
  assert.strictEqual(els.recTrack.children.length,5,'five record targets');
  assert.strictEqual(els.grid4.children.length,16,'fifth track grid rendered');
  assert.strictEqual(inp.onmidimessage!==null,true,'nanoKEY preferred over Midi Through and attached');
  assert.strictEqual(thru.onmidimessage,null,'Midi Through not attached');
  assert.strictEqual(els.inPort.value,'in1','input select shows the keyboard');

  els.port.value='out1';els.port.onchange();
  assert.strictEqual(els.statusTxt.textContent,'→ DROID X7 MIDI','output selected');

  els.scale.value='major';els.scale.onchange({target:{value:'major'}});
  els.arm.onclick();
  assert(els.arm.classList.contains('on'),'record arm lights up');
  assert(/Step entry/.test(els.recHint.textContent),'hint describes step entry while stopped');

  inp.onmidimessage({data:[0x90,61,100]});
  const on=sent.find(m=>m.b[0]===0x90);
  assert.deepStrictEqual(on.b,[0x90,60,100],'monitor sends the scale-quantised note');
  const cell=els.grid0.children[0];
  assert(/C4/.test(cell.innerHTML),'recorded cell shows C4');
  assert(cell.classList.contains('on'),'recorded cell is on');
  assert(/step 2/.test(els.recHint.textContent),'step selection advanced');

  inp.onmidimessage({data:[0x80,61,0]});
  assert(sent.some(m=>m.b[0]===0x80&&m.b[1]===60),'monitor note-off sent for the quantised note');

  els.monitor.checked=false;els.monitor.onchange();
  inp.onmidimessage({data:[0x90,62,100]});
  assert(!sent.some(m=>m.b[0]===0x90&&m.b[1]===62),'monitor off sends nothing');
  assert(/D4/.test(els.grid0.children[1].innerHTML),'step entry still records when monitor is off');

  els.recTrack.value='2';els.recTrack.onchange();
  inp.onmidimessage({data:[0x90,64,100]});
  assert(els.grid2.children[0].classList.contains('on'),'drum step entry writes a hit');
  assert(/C2/.test(els.grid2.children[0].innerHTML),'drum cell shows the fixed trigger note');

  await new Promise(r=>setTimeout(r,260));
  const saved=JSON.parse(store['m18seq.state']);
  assert.strictEqual(saved.tracks[0].steps[0].note,60,'state persisted across the debounce');
  console.log('UI smoke OK: input, monitor, step entry, persistence');
})().catch(e=>{console.error('UI TEST FAILED:',e);process.exit(1)});
