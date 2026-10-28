import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {applyTheme, getTheme} from './lib/theme';

// Apply the saved colour theme before the first render
applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(<App />);
