export type ThemeId = 'market' | 'industrial' | 'acero' | 'carbon' | 'navy';

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  badge?: string;
  colors: {
    primary: string; // hex preview
    accent: string;
    bg: string;
  };
}

export const THEMES: Theme[] = [
  {
    id: 'industrial',
    name: 'Taller Industrial',
    description: 'Naranja seguridad + Grafito. Alta visibilidad, ideal para taller.',
    badge: 'Recomendado',
    colors: { primary: '#FF6A00', accent: '#1E293B', bg: '#F8FAFC' },
  },
  {
    id: 'acero',
    name: 'Acero & Aceite',
    description: 'Gris acero + Amarillo aceite. Profesional y limpio.',
    colors: { primary: '#475569', accent: '#EAB308', bg: '#F8FAFC' },
  },
  {
    id: 'carbon',
    name: 'Carbón Pro',
    description: 'Negro carbón + Cian eléctrico. Moderno, técnico.',
    colors: { primary: '#1C1C1E', accent: '#06B6D4', bg: '#F8FAFC' },
  },
  {
    id: 'navy',
    name: 'Navy Racing',
    description: 'Azul marino + Rojo racing. Deportivo, fuerte.',
    colors: { primary: '#0F2043', accent: '#EF4444', bg: '#F8FAFC' },
  },
  {
    id: 'market',
    name: 'Market Original',
    description: 'Verde esmeralda original. Para comparar.',
    colors: { primary: '#2A9D8F', accent: '#38BDF8', bg: '#F8FAFC' },
  },
];

export const THEME_STORAGE_KEY = 'tallerflow-theme';

export function applyTheme(id: ThemeId) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem(THEME_STORAGE_KEY, id);
  // actualizar theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  const theme = THEMES.find(t => t.id === id);
  if (meta && theme) meta.setAttribute('content', theme.colors.primary);
}

export function getSavedTheme(): ThemeId {
  if (typeof window === 'undefined') return 'industrial';
  const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
  return saved && THEMES.some(t => t.id === saved) ? saved : 'industrial';
}
