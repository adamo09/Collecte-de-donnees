import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import App from '@/App';
import { FournisseurSession } from '@/contextes/Session';
import '@/utils/theme.css';

const clientRequetes = new QueryClient({
  defaultOptions: {
    queries: {
      // Les données de contrôle changent au rythme des synchronisations
      // terrain : inutile de recharger à chaque retour d'onglet.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Réessayer une fois suffit ; au-delà, l'écran doit dire ce qui ne
      // va pas plutôt que de tourner en boucle.
      retry: 1,
    },
  },
});

const racine = document.getElementById('racine');
if (!racine) throw new Error('Élément #racine introuvable.');

createRoot(racine).render(
  <StrictMode>
    <QueryClientProvider client={clientRequetes}>
      <FournisseurSession>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </FournisseurSession>
    </QueryClientProvider>
  </StrictMode>,
);
