import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initMercadoPago } from '@mercadopago/sdk-react';

const mpKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY;
if (mpKey) {
  initMercadoPago(mpKey, { locale: 'pt-BR' });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
