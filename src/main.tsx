import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const app = <App />
const renderedApp = import.meta.env.DEV && import.meta.env.VITE_REACT_STRICT_MODE === 'true'
  ? (
  <StrictMode>
    {app}
  </StrictMode>
    )
  : app

createRoot(document.getElementById('root')!).render(renderedApp)
