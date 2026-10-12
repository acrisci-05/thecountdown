// Funzione Vercel: tutte le richieste /api/* arrivano qui (vedi la riscrittura in vercel.json).
// La logica è la stessa del server locale, in lib/api.mjs.
import { handleApi } from '../lib/api.mjs';

export default {
  fetch(request) {
    return handleApi(request);
  },
};
