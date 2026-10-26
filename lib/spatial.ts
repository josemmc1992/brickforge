export type SpatialBounds={min:readonly [number,number,number];max:readonly [number,number,number]};

/**
 * Conservative broad phase. Choose the axis with the fewest interval pairs,
 * so a column along Y/Z does not degenerate merely because every X is equal.
 * Touching bounds are candidates; the caller retains its exact tolerance gate.
 */
export function spatialSweep(bounds:readonly SpatialBounds[],padding=0){
 if(!Number.isFinite(padding)||padding<0)throw new Error('Invalid spatial padding.');
 let ordered:number[]=[],axis=0,projectedPairs=Infinity;
 for(let candidate=0;candidate<3;candidate++){
  const order=Array.from({length:bounds.length},(_,i)=>i).sort((a,b)=>bounds[a].min[candidate]-bounds[b].min[candidate]||a-b);
  const ends=bounds.map(b=>b.max[candidate]).sort((a,b)=>a-b);
  let retired=0,pairs=0;
  for(let i=0;i<order.length;i++){
   const start=bounds[order[i]].min[candidate];
   while(retired<i&&ends[retired]+padding<start)retired++;
   pairs+=i-retired;
  }
  if(pairs<projectedPairs){ordered=order;axis=candidate;projectedPairs=pairs;}
 }
 function* pairs():Generator<[number,number]>{
  for(let i=0;i<ordered.length;i++){
   const a=ordered[i],first=bounds[a];
   for(let j=i+1;j<ordered.length;j++){
    const b=ordered[j],second=bounds[b];
    if(second.min[axis]>first.max[axis]+padding)break;
    if([0,1,2].some(k=>first.min[k]>second.max[k]+padding||second.min[k]>first.max[k]+padding))continue;
    yield a<b?[a,b]:[b,a];
   }
  }
 }
 return {axis,projectedPairs,pairs};
}
