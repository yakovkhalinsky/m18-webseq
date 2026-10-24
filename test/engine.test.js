const assert=require('assert');
const E=require('./engine.js') /* extracted from ../index.html by run.sh */;
function run(mut,ms,opts={}){
  let t=0;const timers=[];const msgs=[];
  const S=E.defaultState();mut&&mut(S);
  const eng=E.createEngine({getState:()=>S,now:()=>t,setTimeout:(f,d)=>{const id={f,at:t+d};timers.push(id);return id},clearTimeout:id=>{const i=timers.indexOf(id);if(i>=0)timers.splice(i,1)}});
  eng.setOutput({send:(b,ts)=>msgs.push({b:[...b],ts})});
  if(!opts.noStart)eng.start();
  const adv=end=>{while(true){timers.sort((a,b)=>a.at-b.at);const n=timers[0];if(!n||n.at>end)break;timers.shift();t=n.at;n.f()}t=end};
  adv(ms);if(opts.stop){eng.stop();adv(ms+500)}
  return {msgs,S,eng,adv,get t(){return t}};
}
// 1. Start then clock, 24 ppq
let r=run(null,2000,{stop:true});
assert.deepStrictEqual(r.msgs[0].b,[0xFA],'first msg is Start');
const t0=r.msgs[0].ts;
const clocks=r.msgs.filter(m=>m.b[0]===0xF8);
assert.strictEqual(clocks[0].ts,t0,'first clock at start time');
const beat=500; // 120 bpm
const inFirstBeat=clocks.filter(m=>m.ts>=t0&&m.ts<t0+beat-1e-6).length;
assert.strictEqual(inFirstBeat,24,'24 clocks per beat');
const d=clocks[1].ts-clocks[0].ts;assert(Math.abs(d-beat/24)<1e-9,'tick spacing '+d);
for(let i=1;i<clocks.length;i++)assert(clocks[i].ts>=clocks[i-1].ts,'monotonic');
// 2. note on/off on ch 1-4
const ons=r.msgs.filter(m=>(m.b[0]&0xF0)===0x90);const chans=new Set(ons.map(m=>(m.b[0]&15)+1));
assert.deepStrictEqual([...chans].sort(),[1,2,3,4],'note-ons on ch1-4');
ons.forEach(m=>assert.strictEqual(m.b[2],100,'vel 100'));
const offs=r.msgs.filter(m=>(m.b[0]&0xF0)===0x80);
// every note-on has a later note-off same ch/note
ons.forEach(o=>assert(offs.some(f=>f.b[0]===(0x80|(o.b[0]&15))&&f.b[1]===o.b[1]&&f.ts>o.ts),'off for on'));
// track1 step0 at t0, gate 50% of 125ms
const t1on=ons.find(m=>m.b[0]===0x90);assert.strictEqual(t1on.ts,t0);
const t1off=offs.find(m=>m.b[0]===0x80&&m.b[1]===t1on.b[1]);assert(Math.abs(t1off.ts-(t0+62.5-1))<1e-9,'gate 50%');
// track4 trigger: note 36 ch4, 15ms
const tr4=ons.find(m=>m.b[0]===0x93);assert.strictEqual(tr4.b[1],36);
const tr4off=offs.find(m=>m.b[0]===0x83&&m.ts>tr4.ts);assert(Math.abs(tr4off.ts-tr4.ts-15)<1e-9,'trigger 15ms');
// stop -> 0xFC and CC123 per channel, no clock after stop
const stopI=r.msgs.findIndex(m=>m.b[0]===0xFC);assert(stopI>0,'stop sent');
const after=r.msgs.slice(stopI);assert(!after.some(m=>m.b[0]===0xF8),'no clock after stop by default');
const cc=after.filter(m=>(m.b[0]&0xF0)===0xB0&&m.b[1]===123);assert.deepStrictEqual([...new Set(cc.map(m=>(m.b[0]&15)+1))].sort(),[1,2,3,4],'CC123 ch1-4');
console.log('clock/start/notes/stop OK: clocks',clocks.length,'note-ons',ons.length);
// 3. tie/legato: track1 steps 0,1 tied different notes
r=run(S=>{const t=S.tracks[0];t.steps.forEach(s=>s.on=false);t.steps[0]={on:true,note:60,tie:true};t.steps[1]={on:true,note:62,tie:false};S.tracks[1].mute=S.tracks[2].mute=S.tracks[3].mute=true},300);
let ch1=r.msgs.filter(m=>(m.b[0]&0xEF)===0x80);
// order by ts
ch1.sort((a,b)=>a.ts-b.ts);
const on62=ch1.find(m=>m.b[0]===0x90&&m.b[1]===62),off60=ch1.find(m=>m.b[0]===0x80&&m.b[1]===60);
assert(on62&&off60&&on62.ts<off60.ts,'legato: on 62 before off 60');
console.log('legato OK',on62.ts.toFixed(2),off60.ts.toFixed(2));
// 4. swing 75: odd steps delayed by half a step
r=run(S=>{const t=S.tracks[0];t.steps.forEach(s=>{s.on=true;s.tie=false});S.swing=75;S.tracks[1].mute=S.tracks[2].mute=S.tracks[3].mute=true},400);
const o1=r.msgs.filter(m=>m.b[0]===0x90);assert(Math.abs((o1[1].ts-o1[0].ts)-187.5)<1e-9,'swing offset '+(o1[1].ts-o1[0].ts));
console.log('swing OK');
// 5. polymeter: track len 3
r=run(S=>{const t=S.tracks[0];t.len=3;t.steps.forEach((s,i)=>{s.on=true;s.note=60+i});S.tracks[1].mute=S.tracks[2].mute=S.tracks[3].mute=true},900);
assert.deepStrictEqual(r.msgs.filter(m=>m.b[0]===0x90).slice(0,7).map(m=>m.b[1]),[60,61,62,60,61,62,60]);console.log('polymeter OK');
// 6. scale quantise + channel change
r=run(S=>{S.scale='major';S.root=0;const t=S.tracks[0];t.ch=9;t.steps.forEach(s=>{s.on=false});t.steps[0]={on:true,note:61,tie:false};S.tracks[1].mute=S.tracks[2].mute=S.tracks[3].mute=true},100);
const q=r.msgs.find(m=>(m.b[0]&0xF0)===0x90);assert.deepStrictEqual(q.b,[0x98,60,100]);console.log('quantise+channel OK');
assert.strictEqual(E.quantise(66,'pentMinor',9),67);assert.strictEqual(E.noteName(60),'C4');
// 7. clock when stopped
r=run(S=>{S.clockWhenStopped=true},1000,{noStart:true});r.eng.refreshClock();r.adv(2000);
const c2=r.msgs.filter(m=>m.b[0]===0xF8).length;assert(c2>=40&&c2<=60,'clock when stopped ~48 in 1s, got '+c2);
assert(!r.msgs.some(m=>m.b[0]===0x90||m.b[0]===0xFA),'no notes/start while stopped');console.log('clock-when-stopped OK',c2);
// 8. droid.ini reflects channels
const S2=E.defaultState();S2.tracks[1].ch=7;const ini=E.droidIni(S2);assert(/channel = 7\n    pitch1 = O2\n    gate1 = G2/.test(ini));assert(!/trs = 1\n/.test(ini)&&(ini.match(/^    usb = 1$/gm)||[]).length===5,"usb=1 in all 5 midiin");assert(/output = O7/.test(ini)&&/output = O8/.test(ini));
console.log('droid.ini OK\nALL TESTS PASSED');
