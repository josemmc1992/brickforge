// The manifest is cheap to query. Geometry is loaded and pinned by the server
// before a validation; an unloaded or corrupt asset can never bypass the gate.
import manifest from './generated-assembly.json';
import type {Profile} from './base-profiles';

export type GeneratedConnectionFamily='stud-socket'|'stud-socket-access'|'axial-r4'|'axial-a6'|'technic-pin'|'minifig-neck'|'minifig-hips';
export type GeneratedEntry={asset:string;bytes:number;expandedBytes:number;connectorCount:number;family:string;connectionFamily?:GeneratedConnectionFamily;connectionFamilies?:GeneratedConnectionFamily[]};
export const generatedEntries=manifest.profiles as Record<string,GeneratedEntry>;
export const generatedUnavailable=manifest.unavailable as Record<string,string>;
export const generatedSummary=manifest.summary;
export const generatedFitLimits={
 nominalConnection:'LDCad R6/S6 standard stud/socket metadata',
 socketSupportRadialToleranceLdu:0.25,
 socketSupportAxialIntervalLdu:[0.5,3.5],
 collisionPenetrationToleranceLdu:0.01,
 physicalContactCertified:false,
 description:'Socket checks require a clear insertion volume and continuous nearby source surfaces. The 0.25 LDU radial band accommodates simplified LDraw geometry; it is not a measurement of physical contact, clutch strength or manufacturing tolerances.',
};
export const generatedAxialFitLimits={
 nominalConnection:'LDCad round R4, centred with both ends open',
 pose:'quarter-turn orientations; validated axial offsets for v2 profiles with compatible slide metadata; legacy or mixed v1 pairs retain coincident centres and one mate',
 sliding:true,
 reservations:'a socket reserves one contained shaft interval; multiple sockets require non-overlapping intervals',
 placementSearch:'finite axial samples including free-gap boundaries; an empty or exhausted search is not proof that no continuous offset fits',
 collisionPenetrationToleranceLdu:0.01,
 physicalContactCertified:false,
 description:'The source geometry proves a complete shaft or an open channel with surrounding walls. Collision solids preserve the actual, sometimes smaller faceted channel. This does not enable the outer catches of Technic pins or certify physical clutch strength.',
};
export const generatedKeyedAxialFitLimits={
 nominalConnection:'LDCad A6 keyed cross, two convex section components',
 pose:'quarter-turn orientations and validated axial offsets; the receiver must fit inside the proven keyed engagement interval',
 engagement:'reviewed beveled whole shafts: nominal length minus 5 LDU',
 reservations:'multiple receivers require disjoint engagement intervals',
 collisionPenetrationToleranceLdu:0.01,
 physicalContactCertified:false,
 description:'Source-certified complete keyed shafts or open cross channels. Beveled ends cannot supply engagement. Notched shafts, capped channels, arbitrary rotations and other pin joints remain unsupported.',
};
export const generatedAccessFitLimits={
 ...generatedFitLimits,
 accessColumnWidthLdu:20,
 sourceVoidNumericEpsilonLdu:1e-8,
 description:'The outward 20x20-LDU access column is empty of original body surfaces. Only that void is removed from the convex hull. Verified studs remain explicit; socket insertion and surrounding support require separate proofs. Larger neighbouring parts may still be conservatively rejected.',
};
export const generatedTechnicPinFitLimits={
 nominalConnection:'Fixed 20-LDU Technic pin ends; stepped R8/2, R6/16, R8/2 through holes',
 contract:'technic-pin-20-fixed-v1',
 reviewedPinParts:['3673'],
 pose:'quarter-turn orientations; fixed seated centres; no axial offset or articulated motion',
 occupancy:'one mate per pin end or hole; the two ends of 3673 are independent',
 sourceVoidNumericEpsilonLdu:1e-8,
 collisionPenetrationToleranceLdu:0.01,
 physicalContactCertified:false,
 description:'Full-source void and 48 complete wall-facet proofs precede channel removal. The complete reviewed frictionless pin retains its flange and tips. Previously enabled connectors keep their IDs and their individual contracts. Some holes remain disabled by geometry or complexity limits. Friction, deformation, clutch strength and other pin shapes are not simulated.',
};
export const generatedMinifigNeckFitLimits={
 contract:'minifig-neck-12-fixed-v1',
 nominalConnection:'Reviewed R6 neck of length 12 into a source-certified R6 head socket of depth 20',
 pose:'fixed seated mouth/base points; quarter-turn orientations; no axial offset',
 occupancy:'one head per neck, one neck per head socket',
 sourceVoidNumericEpsilonLdu:1e-8,collisionPenetrationToleranceLdu:0.01,physicalContactCertified:false,
 description:'Exact reviewed upper-neck geometry and two source-preserving torso solids; full 16-facet socket walls and full-source empty outward prism. Existing head studs retain their IDs. Arms, hips, headgear, articulation, friction and clutch strength are not certified by this contract.',
};
export const generatedMinifigHipFitLimits={
 contract:'minifig-hipstud-11-fixed-v1',
 nominalConnection:'Paired reviewed 11-LDU waist posts into source-certified torso sockets',
 pose:'fixed seating, opposed normals and aligned outward bevel headings; no axial offset',
 occupancy:'one mate per post/socket; the complete waist seats both posts',
 sourceVoidNumericEpsilonLdu:1e-8,collisionPenetrationToleranceLdu:0.01,physicalContactCertified:false,
 description:'Exact reviewed upper posts and lower torso interface. Two full-source empty outward prisms; all source surfaces retained. Existing foot and neck connectors retain their IDs. Leg pivots, arms, articulation, friction and clutch strength are not certified by this contract.',
};
const unavailableLabels:Record<string,string>={
 missing_connection_metadata:'La referencia no tiene datos de conexión en la biblioteca incorporada.',
 partial_connection_metadata:'Los datos de conexión contienen opciones o transformaciones pendientes de validar.',
 no_verified_standard_connections:'La forma está disponible, pero todavía no hay una unión compatible verificada por el motor.',
 missing_collision_envelope:'No se ha podido verificar la geometría de colisión de esta referencia.',
 shortcut_assembly_not_supported:'Es un conjunto LDraw ya montado; debe descomponerse en sus piezas antes de construir.',
 sticker_not_rigid_part:'Es una pegatina; aún no hay una herramienta para aplicarla a una superficie.',
 flexible_geometry_not_supported:'Esta referencia flexible necesita un mecanismo de deformación y encaje específico.',
 unsupported_meta:'La geometría contiene instrucciones que el compilador de colisiones todavía no interpreta.',
 face_limit:'La geometría supera el límite de complejidad de esta versión.',
 profile_complexity_limit:'El perfil supera el límite de complejidad de esta versión.',
 too_many_inactive_features:'La geometría necesita más comprobaciones de colisión de las admitidas en esta versión.',
};
export function unavailableReason(part:string){const code=generatedUnavailable[part];return {reasonCode:code??'missing_profile',reason:unavailableLabels[code]??'Esta pieza aún no tiene un perfil de encaje. Se puede visualizar, pero no añadir al ensamblaje.'};}
const prepared=new Map<string,Profile>();
export function generatedEntry(part:string):GeneratedEntry|undefined {
 return Object.hasOwn(generatedEntries,part)?generatedEntries[part]:undefined;
}
export function preparedGeneratedProfile(part:string):Profile|null {
 const entry=generatedEntry(part);
 if(!entry)return null;
 const profile=prepared.get(entry.asset);
 if(!profile)throw new Error('El perfil de '+part+' no está preparado para validar el ensamblaje.');
 return profile;
}
export function cacheGeneratedAsset(hash:string,profile:Profile){prepared.set(hash,profile);}
export function evictGeneratedAsset(hash:string){prepared.delete(hash);}
