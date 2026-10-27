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
const solo1=S=>{for(let i=1;i<S.tracks.length;i++)S.tracks[i].mute=true};
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
// 2. note on/off on ch 1-5
const ons=r.msgs.filter(m=>(m.b[0]&0xF0)===0x90);const chans=new Set(ons.map(m=>(m.b[0]&15)+1));
assert.deepStrictEqual([...chans].sort(),[1,2,3,4,5],'note-ons on ch1-5');
ons.forEach(m=>assert.strictEqual(m.b[2],100,'vel 100'));
const offs=r.msgs.filter(m=>(m.b[0]&0xF0)===0x80);
// every note-on has a later note-off same ch/note
ons.forEach(o=>assert(offs.some(f=>f.b[0]===(0x80|(o.b[0]&15))&&f.b[1]===o.b[1]&&f.ts>o.ts),'off for on'));
// track1 step0 at t0, gate 50% of 125ms
const t1on=ons.find(m=>m.b[0]===0x90);assert.strictEqual(t1on.ts,t0);
const t1off=offs.find(m=>m.b[0]===0x80&&m.b[1]===t1on.b[1]);assert(Math.abs(t1off.ts-(t0+62.5-1))<1e-9,'gate 50%');
// track4 snare trigger: ch4, note 38, 15ms
const tr4=ons.find(m=>m.b[0]===0x93);assert.strictEqual(tr4.b[1],38);
const tr4off=offs.find(m=>m.b[0]===0x83&&m.ts>tr4.ts);assert(Math.abs(tr4off.ts-tr4.ts-15)<1e-9,'trigger 15ms');
// track5 hat trigger: ch5, note 42
const tr5=ons.find(m=>m.b[0]===0x94);assert.strictEqual(tr5.b[1],42);
// stop -> 0xFC and CC123 per channel, no clock after stop
const stopI=r.msgs.findIndex(m=>m.b[0]===0xFC);assert(stopI>0,'stop sent');
const after=r.msgs.slice(stopI);assert(!after.some(m=>m.b[0]===0xF8),'no clock after stop by default');
const cc=after.filter(m=>(m.b[0]&0xF0)===0xB0&&m.b[1]===123);assert.deepStrictEqual([...new Set(cc.map(m=>(m.b[0]&15)+1))].sort(),[1,2,3,4,5],'CC123 ch1-5');
console.log('clock/start/notes/stop OK: clocks',clocks.length,'note-ons',ons.length);
// 3. tie/legato: track1 steps 0,1 tied different notes
r=run(S=>{const t=S.tracks[0];t.steps.forEach(s=>s.on=false);t.steps[0]={on:true,note:60,tie:true};t.steps[1]={on:true,note:62,tie:false};solo1(S)},300);
let ch1=r.msgs.filter(m=>(m.b[0]&0xEF)===0x80);
// order by ts
ch1.sort((a,b)=>a.ts-b.ts);
const on62=ch1.find(m=>m.b[0]===0x90&&m.b[1]===62),off60=ch1.find(m=>m.b[0]===0x80&&m.b[1]===60);
assert(on62&&off60&&on62.ts<off60.ts,'legato: on 62 before off 60');
console.log('legato OK',on62.ts.toFixed(2),off60.ts.toFixed(2));
// 4. swing 75: odd steps delayed by half a step
r=run(S=>{const t=S.tracks[0];t.steps.forEach(s=>{s.on=true;s.tie=false});S.swing=75;solo1(S)},400);
const o1=r.msgs.filter(m=>m.b[0]===0x90);assert(Math.abs((o1[1].ts-o1[0].ts)-187.5)<1e-9,'swing offset '+(o1[1].ts-o1[0].ts));
console.log('swing OK');
// 5. polymeter: track len 3
r=run(S=>{const t=S.tracks[0];t.len=3;t.steps.forEach((s,i)=>{s.on=true;s.note=60+i});solo1(S)},900);
assert.deepStrictEqual(r.msgs.filter(m=>m.b[0]===0x90).slice(0,7).map(m=>m.b[1]),[60,61,62,60,61,62,60]);console.log('polymeter OK');
// 6. scale quantise + channel change
r=run(S=>{S.scale='major';S.root=0;const t=S.tracks[0];t.ch=9;t.steps.forEach(s=>{s.on=false});t.steps[0]={on:true,note:61,tie:false};solo1(S)},100);
const q=r.msgs.find(m=>(m.b[0]&0xF0)===0x90);assert.deepStrictEqual(q.b,[0x98,60,100]);console.log('quantise+channel OK');
assert.strictEqual(E.quantise(66,'pentMinor',9),67);assert.strictEqual(E.noteName(60),'C4');
// 6b. scale-first helpers: in-scale test, direction, degree/octave stepping, migration snap
assert(E.inScale(60,'major',0)&&!E.inScale(61,'major',0),'C in C major, C# not');
assert.strictEqual(E.quantise(61,'major',0,'up'),62,'quantise up');
assert.strictEqual(E.quantise(61,'major',0,'down'),60,'quantise down');
assert.strictEqual(E.scaleStep(60,'major',0,1),62,'next degree');
assert.strictEqual(E.scaleStep(60,'major',0,-1),59,'previous degree');
assert.strictEqual(E.scaleStep(60,'pentMinor',0,1),63,'pentatonic degree is a minor third');
assert.strictEqual(E.octaveStep(60,1),72);assert.strictEqual(E.octaveStep(60,-1),48);
const migrated=E.saneState({scale:'major',root:0,tracks:[{steps:[{on:true,note:61}]}]});
assert.strictEqual(migrated.version,3);assert.strictEqual(migrated.tracks[0].steps[0].note,60,'migration snaps to scale');
assert.strictEqual(migrated.tracks.length,5,'old 4-track states grow to 5 tracks');
assert(migrated.tracks.slice(1).every(t=>t.steps.every(s=>!s.on)),'tracks added by migration start silent');
// 6b2. default layout: 2 melodic + 3 drum tracks
{const D=E.defaultState();assert.strictEqual(D.tracks.length,5);
 assert.deepStrictEqual(D.tracks.map(t=>t.trigger),[false,false,true,true,true],'2 melodic, 3 drum');
 assert.deepStrictEqual(D.tracks.slice(2).map(t=>t.trigNote),[36,38,42],'kick/snare/hat');
 assert.strictEqual(D.version,3);}
console.log('scale helpers OK');
// 6c. engine output quantises to a non-default scale
r=run(S=>{S.scale='harmonicMinor';S.root=0;const t=S.tracks[0];t.steps.forEach(s=>s.on=false);
  t.steps[0]={on:true,note:64,tie:false};solo1(S)},100);
const qh=r.msgs.find(m=>(m.b[0]&0xF0)===0x90);assert.strictEqual(qh.b[1],63,'E snaps to Eb in C harmonic minor');
console.log('harmonic minor output OK');
// 7. clock when stopped
r=run(S=>{S.clockWhenStopped=true},1000,{noStart:true});r.eng.refreshClock();r.adv(2000);
const c2=r.msgs.filter(m=>m.b[0]===0xF8).length;assert(c2>=40&&c2<=60,'clock when stopped ~48 in 1s, got '+c2);
assert(!r.msgs.some(m=>m.b[0]===0x90||m.b[0]===0xFA),'no notes/start while stopped');console.log('clock-when-stopped OK',c2);
// 8. droid.ini: 2 melodic pitch outputs, 4 hardware gates + one CV output as a gate
const S2=E.defaultState();S2.tracks[1].ch=7;const ini=E.droidIni(S2);
assert(/channel = 7\n    pitch1 = O2\n    gate1 = G1\.2/.test(ini),'melodic track 2 pitch+gate');
assert(/gate1 = G1\.1\n/.test(ini)&&/gate1 = G1\.4\n/.test(ini),'hardware gates 1-4');
assert(/channel = 5\n    gate1 = _GATE5\n/.test(ini),'5th track gate via internal cable');
assert(/input = _GATE5 \* 0\.5\n    output = O3/.test(ini),'5th gate scaled to 0/5 V on CV output O3');
for(const n of [3,4,5]){const blk=ini.slice(ini.indexOf('# track '+n),ini.indexOf('# track '+(n+1))>0?ini.indexOf('# track '+(n+1)):ini.indexOf('# clock'));
  assert(!/pitch1/.test(blk),'drum track '+n+' is gate-only');}
assert(!/trs = 1\n/.test(ini)&&(ini.match(/^    usb = 1$/gm)||[]).length===6,'usb=1 in all 6 midiin');
assert(/output = O7/.test(ini)&&/output = O8/.test(ini));
// allocation follows track types: making track 5 melodic moves it to pitch O3 / gate O4
{const S3=E.defaultState();S3.tracks[4].trigger=false;const ini3=E.droidIni(S3);
 const t5=ini3.slice(ini3.indexOf('# track 5'),ini3.indexOf('# clock'));
 assert(/pitch1 = O3/.test(t5)&&/gate1 = _GATE5/.test(t5),'melodic track 5 pitch on O3');
 assert(/input = _GATE5 \* 0\.5\n    output = O4/.test(ini3),'melodic track 5 gate moves to O4');}
console.log('droid.ini OK');
// 9. preset 'Octave Strut'
{const P=E.presetState('Octave Strut');const want=[40,52,0,40,0,47,52,0,43,0,55,43,0,50,45,52];
assert.strictEqual(P.bpm,121);const t=P.tracks[0];assert.strictEqual(t.ch,1);assert.strictEqual(t.len,16);assert.strictEqual(t.gate,50);
assert.deepStrictEqual(t.steps.slice(0,16).map(s=>s.on?s.note:0),want);
for(let i=1;i<P.tracks.length;i++)assert(!P.tracks[i].steps.some(s=>s.on),'track '+(i+1)+' empty');
const r9=run(S=>{Object.assign(S,P)},2000);const ons=r9.msgs.filter(m=>(m.b[0]&0xF0)===0x90);
assert(ons.every(m=>m.b[0]===0x90));assert.deepStrictEqual(ons.slice(0,11).map(m=>m.b[1]),want.filter(x=>x));
console.log('preset Octave Strut OK');}
// 10. MIDI input parsing, recording helper and monitor output
assert.deepStrictEqual(E.parseMidi([0x90,60,100]),{type:'on',ch:0,note:60,vel:100});
assert.deepStrictEqual(E.parseMidi([0x91,64,7]),{type:'on',ch:1,note:64,vel:7});
assert.deepStrictEqual(E.parseMidi([0x80,60,0]),{type:'off',ch:0,note:60,vel:0});
assert.deepStrictEqual(E.parseMidi([0x90,60,0]),{type:'off',ch:0,note:60,vel:0},'vel 0 note-on is off');
assert.strictEqual(E.parseMidi([0xF8]),null,'clock ignored');
assert.strictEqual(E.parseMidi([0xB0,1,1]),null,'CC ignored');
assert.strictEqual(E.parseMidi(null),null);
{
  const rs=E.defaultState();rs.scale='major';rs.root=0;
  assert.strictEqual(E.recordNote(rs,0,3,61),3);
  assert.strictEqual(rs.tracks[0].steps[3].on,true);
  assert.strictEqual(rs.tracks[0].steps[3].note,60,'recorded note snapped to scale');
  assert.strictEqual(rs.tracks[0].steps[3].tie,false);
  rs.tracks[1].trigger=true;
  const trigNote=rs.tracks[1].steps[2].note;
  E.recordNote(rs,1,2,61);
  assert.strictEqual(rs.tracks[1].steps[2].on,true,'trigger step fires');
  assert.strictEqual(rs.tracks[1].steps[2].note,trigNote,'trigger track ignores pitch');
  assert.strictEqual(E.recordNote(rs,9,0,60),-1,'bad track index');
  const r10=run(null,0,{noStart:true});
  r10.eng.noteOn(0,64,111);r10.eng.noteOff(0,64);
  const nOn=r10.msgs.find(m=>m.b[0]===0x90),nOff=r10.msgs.find(m=>m.b[0]===0x80);
  assert.deepStrictEqual(nOn.b,[0x90,64,111],'monitor note-on');
  assert.deepStrictEqual(nOff.b,[0x80,64,0],'monitor note-off');
  console.log('MIDI input + record helper + monitoring OK');
}
console.log('ALL TESTS PASSED');
