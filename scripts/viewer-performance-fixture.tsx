import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Viewer from 'brickforge-benchmark-viewer';
import type {Piece} from '../lib/model';

// This entry is built only by viewer-performance.mjs, never by the application.
const fixture = (count:number):Piece[] => Array.from({length:count},(_,i)=>({
  id:`bench-${i}`,part:i%20===0?'3020':i%4===0?'3005':'3001',color:[4,1,14,71,2][i%5],
  position:[(i%100)*90,i%20===0?8:24,Math.floor(i/100)*50],rotation:[0,i%2?180:0,0],step:1+i%2,group:'Benchmark'
}));
const regression:Piece[] = [
  {id:'red',part:'3001',color:4,position:[-120,24,0],rotation:[0,0,0],step:1,group:'Test'},
  {id:'blue',part:'3005',color:1,position:[0,24,0],rotation:[0,90,0],step:2,group:'Test'},
  {id:'print',part:'3070bp01',color:15,position:[90,8,0],rotation:[0,180,0],step:1,group:'Test'},
  {id:'transparent',part:'3062b',color:47,position:[0,24,90],rotation:[0,0,0],step:2,group:'Test'},
  {id:'slope',part:'3040',color:14,position:[0,80,0],rotation:[90,0,90],step:1,group:'Test'}
];
const transparency:Piece[]=[
  ...[0,1,2].map(i=>({id:`glass-${i}`,part:'3062b',color:47,position:[0,24,(i-1)*24] as [number,number,number],rotation:[0,i*90,0] as [number,number,number],step:1,group:'Transparent overlap'})),
  {id:'backdrop',part:'3001',color:4,position:[0,24,-70],rotation:[0,0,0],step:1,group:'Transparent overlap'},
  {id:'printed-tile',part:'3070bp01',color:15,position:[-50,8,0],rotation:[0,90,0],step:1,group:'Transparent overlap'}
];
const test:any={diagnostics:null,lastPick:null,fixture,regression,transparency};
(window as any).viewerTest=test;
function App(){
  const [pieces,setPieces]=useState<Piece[]>([]),[selected,setSelected]=useState<string|null>(null),[step,setStep]=useState(2),[fit,setFit]=useState(0);
  test.setPieces=setPieces;test.select=setSelected;test.setStep=setStep;test.fit=()=>setFit(v=>v+1);test.pieces=pieces;test.selected=selected;
  return <Viewer pieces={pieces} selected={selected} visibleStep={step} fitSignal={fit} onSelect={(id:string|null)=>{test.lastPick=id;setSelected(id);}} onDiagnostics={(diagnostics:any)=>{test.diagnostics=diagnostics;}}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);
