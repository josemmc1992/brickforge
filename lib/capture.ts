import type {Model} from './model';

export const CAPTURE_VIEWS=['isometric','front','back','left','right','top'] as const;
export type CaptureView=typeof CAPTURE_VIEWS[number];
export const CAPTURE_DEFAULT_WIDTH=1024;
export const CAPTURE_DEFAULT_HEIGHT=768;
export const CAPTURE_MIN_SIZE=256;
export const CAPTURE_MAX_SIZE=1024;
export const CAPTURE_MAX_PNG_BYTES=1024*1024;
export const CAPTURE_RESULT_BODY_BYTES=2*1024*1024;
export const CAPTURE_DEADLINE_MS=30000;
export type CaptureOptions={modelId:string;view:CaptureView;width:number;height:number;expectedRevision?:number};
/** An immutable, authorized model snapshot. A lease can complete this job once. */
export type CaptureJob={id:string;leaseToken:string;model:Model;view:CaptureView;width:number;height:number;expiresAt:number};
export type CaptureResultInput={id:string;leaseToken:string;data?:string;error?:string};
export type CaptureMetadata={modelId:string;revision:number;pieceCount:number;view:CaptureView;width:number;height:number;mimeType:'image/png'};
