// Shared by the service, MCP schemas and editor. Batch size is independent of model size.
export const MAX_MODEL_PIECES=15_000;
export const MAX_BATCH_OPERATIONS=500;
export const MAX_MODEL_CONNECTIONS=300_000;

// Stored, canonical piece JSON is measured in UTF-8 bytes. Imports and transport
// reserve extra room for pretty-printed JSON and API/MCP request envelopes.
export const MODEL_JSON_MAX_BYTES=16*1024*1024;
export const MODEL_REQUEST_MAX_BYTES=20*1024*1024;
export const MODEL_IMPORT_MAX_BYTES=MODEL_REQUEST_MAX_BYTES;
