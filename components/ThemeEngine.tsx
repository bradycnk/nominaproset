import React, { useEffect } from 'react';
import { ConfigGlobal } from '../types';

interface ThemeEngineProps {
  config: ConfigGlobal | null;
}

const ThemeEngine: React.FC<ThemeEngineProps> = ({ config }) => {
  useEffect(() => {
    if (!config) return;

    const root = document.documentElement;
    const theme = config.theme || 'light';
    const accent = config.accent_color || 'green';

    root.setAttribute('data-theme', theme);

    let styleTag = document.getElementById('dynamic-theme-engine');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'dynamic-theme-engine';
      document.head.appendChild(styleTag);
    }

    let cssLines = [];

    // --- Mapeo de Modo Oscuro ---
    // Invertimos las escalas de grises (slate) y cambiamos el fondo base (white)
    if (theme === 'dark') {
      cssLines.push(`
        :root[data-theme="dark"] {
          --color-white: #0f172a !important; /* slate-900 */
          --color-slate-50: #1e293b !important; /* slate-800 */
          --color-slate-100: #334155 !important; /* slate-700 */
          --color-slate-200: #475569 !important; /* slate-600 */
          --color-slate-300: #64748b !important; /* slate-500 */
          --color-slate-400: #94a3b8 !important; /* slate-400 */
          --color-slate-500: #cbd5e1 !important; /* slate-300 */
          --color-slate-600: #e2e8f0 !important; /* slate-200 */
          --color-slate-700: #f1f5f9 !important; /* slate-100 */
          --color-slate-800: #f8fafc !important; /* slate-50 */
          --color-slate-900: #ffffff !important; /* white */
        }
        
        /* Ajuste global para el fondo del body */
        body {
          background-color: var(--color-slate-50);
          color: var(--color-slate-800);
        }
        
        /* Asegurar que las tablas e inputs se vean bien en modo oscuro */
        input, select {
          background-color: var(--color-white) !important;
          color: var(--color-slate-900) !important;
          border-color: var(--color-slate-200) !important;
        }
      `);
    } else {
        cssLines.push(`
        body {
          background-color: var(--color-slate-50);
          color: var(--color-slate-800);
        }
      `);
    }

    // --- Mapeo de Color de Acento ---
    // La app usa "emerald" como color principal por defecto.
    // Sustituimos las variables de "emerald" por la escala del color seleccionado.
    const colors = {
      'light-blue': {
        50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 
        500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e'
      },
      'dark-blue': {
        50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 
        500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a'
      },
      'apple-green': {
        50: '#f7fee7', 100: '#ecfccb', 200: '#d9f99d', 300: '#bef264', 400: '#a3e635', 
        500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212', 900: '#365314'
      },
      'orange': {
        50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 
        500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12'
      },
      'green': null // Por defecto no sobreescribimos
    };

    const selectedPallete = colors[accent as keyof typeof colors];

    if (selectedPallete) {
      cssLines.push(`
        :root {
          --color-emerald-50: ${selectedPallete[50]} !important;
          --color-emerald-100: ${selectedPallete[100]} !important;
          --color-emerald-200: ${selectedPallete[200]} !important;
          --color-emerald-300: ${selectedPallete[300]} !important;
          --color-emerald-400: ${selectedPallete[400]} !important;
          --color-emerald-500: ${selectedPallete[500]} !important;
          --color-emerald-600: ${selectedPallete[600]} !important;
          --color-emerald-700: ${selectedPallete[700]} !important;
          --color-emerald-800: ${selectedPallete[800]} !important;
          --color-emerald-900: ${selectedPallete[900]} !important;
        }
      `);
    }

    styleTag.innerHTML = cssLines.join(' ');

  }, [config?.theme, config?.accent_color]);

  return null;
};

export default ThemeEngine;