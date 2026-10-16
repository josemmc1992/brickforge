import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Studio from '../components/studio';
import './styles.css';
function App(){
 const [authenticated,setAuthenticated]=useState(false),[ready,setReady]=useState(false),[token,setToken]=useState(''),[error,setError]=useState('');
 useEffect(()=>{fetch('/api/session').then(r=>r.json()).then(s=>{setAuthenticated(s.authenticated);setReady(true);}).catch(()=>{setError('No se puede conectar con el servidor.');setReady(true);});},[]);
 if(!ready)return <p style={{padding:40}}>Abriendo Brickforge local…</p>;
 if(authenticated)return <Studio/>;
 return <main className="modal" style={{margin:'12vh auto'}}><h2>Brickforge</h2><p>Introduce la clave configurada en BRICKFORGE_TOKEN para abrir tu estudio.</p><form onSubmit={async e=>{e.preventDefault();try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});if(!r.ok)throw new Error('Clave incorrecta');setToken('');setAuthenticated(true);}catch(e){setError(e instanceof Error?e.message:'No se pudo iniciar sesión');}}}><label>Clave de acceso<input type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="current-password" required className="full-input"/></label><button type="submit" className="primary-button full">Entrar</button></form>{error&&<p role="alert">{error}</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
