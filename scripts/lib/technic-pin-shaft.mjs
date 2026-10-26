// Whole, reviewed frictionless pin. The transitive source hash pins every DAT
// dependency, including the two connect.dat ends and their detailed lip faces.
// This deliberately does not admit friction ridges, flexible pins or a shape
// inferred from nominal metadata. Independent tests cover every source face.
import {createEnvelopeCompiler,conservativeHull,sha256} from './ldraw-envelope.mjs';
import {reviewedR4Section,certifyAxialChannel,clipSurfacePolygon,subtractConvexPrism} from './axial-envelope.mjs';
export const REVIEWED_TECHNIC_PIN=Object.freeze({part:'3673',sourceHash:'51fee91334a790cb6041c4a4c8b7e0d84700a2d18bca2c818bc33a4a819328ee'});
const EPS=1e-8,dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const fail=(reason)=>({status:'indeterminate',reason}),triangulate=p=>Array.from({length:Math.max(0,p.length-2)},(_,i)=>[p[0],p[i+1],p[i+2]]);
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);
const local=([x,y,z])=>[y,x,-z],world=local;
function reviewedMetadata(c){
 const s=c?.shape,expected=[['L_',6.25,2],['R',6,16],['R',8,4],['R',6,16],['_L',6.25,2]];
 if(c?.type!=='cylinder'||c.gender!=='M'||!finite(c.pos)||c.pos.some(n=>n!==0)||!finite(c.normal)||Math.abs(c.normal[0])!==1||c.normal[1]!==0||c.normal[2]!==0||!Array.isArray(c.unsupportedFeatures)||c.unsupportedFeatures.length||c.scale!=='none'||!['cor','none'].includes(c.mirror))return false;
 if(!Array.isArray(c.frame)||c.frame.length!==9||c.frame.some(n=>n!==0&&n!==1&&n!==-1))return false;
 const axes=[0,1,2].map(i=>[c.frame[i],c.frame[i+3],c.frame[i+6]]);
 if(axes.some(a=>a.filter(n=>n!==0).length!==1)||dot(axes[0],axes[1])||dot(axes[0],axes[2])||dot(axes[1],axes[2])||axes[1].some((n,i)=>n!==-c.normal[i]))return false;
 return !!s&&s.group===''&&s.center===true&&s.caps==='none'&&typeof s.slide==='boolean'&&Array.isArray(s.sections)&&s.sections.length===5&&s.sections.every((v,i)=>v.shape===expected[i][0]&&v.radius===expected[i][1]&&v.length===expected[i][2]);
}
function radialPlanes(polygon){return polygon.map((a,i)=>{const b=polygon[(i+1)%polygon.length],d=[b[1]-a[1],0,a[0]-b[0]],l=Math.hypot(...d);let normal=d.map(n=>n/l),constant=normal[0]*a[0]+normal[2]*a[1];if(constant<0){normal=normal.map(n=>-n);constant=-constant;}return {normal,constant};});}
function clip(p,planes){for(const h of planes){p=clipSurfacePolygon(p,h);if(!p.length)break;}return p;}
export function certifyReviewedTechnicPin(geometry,connector,repository){
 try{
  if(!reviewedMetadata(connector))return fail('unreviewed_technic_pin_metadata');
  if(!repository||typeof repository.read!=='function'||typeof repository.resolve!=='function')return fail('missing_technic_pin_repository');
  if(!geometry||geometry.sourceHash!==REVIEWED_TECHNIC_PIN.sourceHash||!Array.isArray(geometry.body)||!geometry.body.length||geometry.body.length>32000||geometry.body.some(f=>!Array.isArray(f)||![3,4].includes(f.length)||!f.every(finite))||!Array.isArray(geometry.studs)||geometry.studs.length)return fail('unreviewed_technic_pin_geometry');
  const expected=createEnvelopeCompiler(repository).geometry(REVIEWED_TECHNIC_PIN.part);
  if(expected.sourceHash!==REVIEWED_TECHNIC_PIN.sourceHash||JSON.stringify(expected.body)!==JSON.stringify(geometry.body)||expected.studs.length)return fail('technic_pin_source_changed');
  const section=reviewedR4Section(repository),faces=geometry.body.map(f=>f.map(local)),triangles=faces.flatMap(triangulate);
  const inner=certifyAxialChannel({body:faces,studs:[],sourceHash:geometry.sourceHash},{section,length:40});if(inner.status!=='certified')return fail(inner.reason);
  // A regular 16-facet void contained in the already proved R4 void keeps
  // complexity bounded. Shrinking it cannot remove additional source material.
  const exact=radialPlanes(inner.certificate.section.polygon),scale=Math.min(1,...exact.map(h=>h.constant/Math.max(...section.polygon.map(([x,z])=>dot([x,0,z],h.normal)))));
  if(!Number.isFinite(scale)||scale<=.99||scale>1)return fail('technic_pin_inner_void_too_small');
  const innerSection=section.polygon.map(p=>p.map(n=>n*scale)),innerPlanes=radialPlanes(innerSection);
  if(innerSection.some(([x,z])=>exact.some(h=>dot([x,0,z],h.normal)>h.constant+EPS)))return fail('technic_pin_inner_void_not_contained');
  const cuts=[-20,-18,-2,2,18,20],solids=[];
  for(let i=0;i+1<cuts.length;i++){
   const planes=[{normal:[0,1,0],constant:cuts[i+1]},{normal:[0,-1,0],constant:-cuts[i]}];
   const sliced=triangles.flatMap(t=>triangulate(clip(t,planes))).filter(t=>{const y=t.reduce((s,p)=>s+p[1]/3,0);return y>cuts[i]+EPS&&y<cuts[i+1]-EPS&&Math.hypot(...cross(sub(t[1],t[0]),sub(t[2],t[0])))>EPS*EPS;});
   const hull=conservativeHull(sliced.flat()).solid,cut=subtractConvexPrism(hull,innerPlanes);if(cut.status!=='subtracted')return fail(cut.reason);solids.push(...cut.solids);
  }
  if(!solids.length||solids.length>129||solids.some(s=>s.vertices.length>128||s.normals.length>128||s.edges.length>128||s.planes.length>128||s.vertices.some(p=>!finite(p))))return fail('technic_pin_body_complexity');
  const reread=createEnvelopeCompiler(repository).geometry(REVIEWED_TECHNIC_PIN.part);if(reread.sourceHash!==expected.sourceHash||JSON.stringify(reread.body)!==JSON.stringify(expected.body))return fail('technic_pin_source_changed_during_proof');
  const transformed=solids.map(s=>({vertices:s.vertices.map(world),normals:s.normals.map(world),edges:s.edges.map(world),planes:s.planes.map(h=>({normal:world(h.normal),constant:h.constant}))}));
  return {status:'certified',version:'reviewed-whole-technic-pin-20-ends-v1',sourceHash:geometry.sourceHash,geometryHash:sha256(JSON.stringify(geometry.body)),asset:{solids:transformed},innerSection,
   connectors:[-1,1].map(sign=>({id:'pin:'+sign*10+':0:0',kind:'pin',point:[sign*10,0,0],normal:[sign,0,0],pin:{contract:'technic-pin-20-fixed-v1',length:20,shaftRadius:6,collarRadius:8,shaftSpan:16}})),
   certificate:{reviewedSource:REVIEWED_TECHNIC_PIN,sourceFaces:geometry.body.length,bodyPartitions:cuts,innerVoidScale:scale,innerVoidProof:inner.certificate,numericEpsilon:EPS,limitation:'fixed seating at either 20-LDU end; source lip geometry retained, no friction or insertion deformation model'}};
 }catch(e){if(e.code)return fail(e.code);throw e;}
}
