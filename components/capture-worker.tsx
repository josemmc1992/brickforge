import {useEffect} from 'react';
import type {CaptureJob} from '@/lib/capture';
import {renderModelCapture} from './model-capture';

const pollInterval = 750;

async function post(path: '/api/capture/claim' | '/api/capture/result', body: unknown, signal: AbortSignal) {
  const response = await fetch(path, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin',
    body: JSON.stringify(body), signal,
  });
  if (!response.ok) throw new Error('No se pudo comunicar con el servicio de capturas.');
  return response.json();
}

/** One authenticated, sequential capture worker, independent of the model open in the editor. */
export default function CaptureWorker() {
  useEffect(() => {
    const lifetime = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const {job} = await post('/api/capture/claim', {}, AbortSignal.any([lifetime.signal, AbortSignal.timeout(5000)])) as {job: CaptureJob | null};
        if (job && !lifetime.signal.aborted) {
          let result: {data?: string; error?: string};
          const remaining = job.expiresAt - Date.now();
          if (remaining <= 0) result = {error: 'La captura ha agotado su plazo.'};
          else {
            const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(Math.max(1, remaining))]);
            try { result = {data: await renderModelCapture(job, signal)}; }
            catch (error) { result = {error: error instanceof Error ? error.message : 'No se pudo capturar el modelo.'}; }
          }
          if (!lifetime.signal.aborted) {
            await post('/api/capture/result', {id: job.id, leaseToken: job.leaseToken, ...result}, AbortSignal.any([lifetime.signal, AbortSignal.timeout(5000)]));
          }
        }
      } catch {
        // A closed server or an expired lease must not interrupt editing. The MCP request has its own timeout.
      } finally {
        if (!lifetime.signal.aborted) timer = setTimeout(() => void poll(), pollInterval);
      }
    };
    void poll();
    return () => { lifetime.abort(); if (timer !== undefined) clearTimeout(timer); };
  }, []);
  return null;
}
