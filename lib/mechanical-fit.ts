// Family dispatch keeps R4 compatibility and the separately certified keyed A6
// contract independent. A matching radius alone is never a compatible joint.
import {validAxialConnector,transformAxialConnector,axialEngagement,axialOffsetRange,type AxialConnector} from './axial-fit';
import {validKeyedAxialConnector,transformKeyedAxialConnector,keyedEngagement,keyedOffsetRange,type KeyedAxialConnector} from './keyed-axial-fit';
export type MechanicalConnector=AxialConnector|KeyedAxialConnector;
export const isMechanicalConnector=(c:{kind:string}):c is MechanicalConnector=>['bar','bar-socket','axle','axle-socket'].includes(c.kind);
export const isShaft=(c:MechanicalConnector)=>c.kind==='bar'||c.kind==='axle';
export const isLegacyAxial=(c:MechanicalConnector)=>c.axial.contract==='r4-through-centered-fixed-v1';
export function mechanicalKindsCompatible(a:MechanicalConnector,b:MechanicalConnector){return (a.kind==='bar'&&b.kind==='bar-socket')||(b.kind==='bar'&&a.kind==='bar-socket')||(a.kind==='axle'&&b.kind==='axle-socket')||(b.kind==='axle'&&a.kind==='axle-socket');}
export function validMechanicalConnector(value:unknown):value is MechanicalConnector{return validAxialConnector(value)||validKeyedAxialConnector(value);}
const isRound=(c:MechanicalConnector):c is AxialConnector=>c.kind==='bar'||c.kind==='bar-socket';
export function transformMechanicalConnector(c:MechanicalConnector,rotation:(v:[number,number,number])=>[number,number,number],translation:[number,number,number]):MechanicalConnector{return isRound(c)?transformAxialConnector(c,rotation,translation):transformKeyedAxialConnector(c,rotation,translation);}
export function mechanicalEngagement(a:MechanicalConnector,b:MechanicalConnector){if(isRound(a))return isRound(b)?axialEngagement(a,b):null;return isRound(b)?null:keyedEngagement(a,b);}
export function mechanicalConnectorsMatch(a:MechanicalConnector,b:MechanicalConnector){return mechanicalEngagement(a,b)!==null;}
export function mechanicalOffsetRange(a:MechanicalConnector,b:MechanicalConnector){if(isRound(a))return isRound(b)?axialOffsetRange(a,b):null;return isRound(b)?null:keyedOffsetRange(a,b);}
export function mechanicalInterval(c:MechanicalConnector):[number,number]{return c.kind==='axle'?[...c.axial.engagementInterval]:[-c.axial.length/2,c.axial.length/2];}
