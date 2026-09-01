
'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

/**
 * Patrón Singleton robusto para Next.js.
 * Asegura que Firebase no intente inicializarse durante el SSR (Server Side Rendering)
 * lo cual es una causa común de errores 503 si las claves no están en el servidor.
 */
export function initializeFirebase() {
  // Verificación estricta de entorno cliente para evitar fallos en SSR
  if (typeof window === 'undefined') {
    return { 
      firebaseApp: null as any, 
      auth: null as any, 
      firestore: null as any 
    };
  }

  const g = globalThis as any;

  try {
    // Inicialización de la App con persistencia en globalThis para HMR
    if (!g._firebaseApp) {
      const apps = getApps();
      g._firebaseApp = apps.length > 0 ? apps[0] : initializeApp(firebaseConfig);
    }
    const app = g._firebaseApp as FirebaseApp;

    // Inicialización de Auth
    if (!g._firebaseAuth) {
      g._firebaseAuth = getAuth(app);
    }
    const auth = g._firebaseAuth as Auth;

    // Inicialización de Firestore
    if (!g._firebaseDb) {
      g._firebaseDb = getFirestore(app);
    }
    const firestore = g._firebaseDb as Firestore;

    return { firebaseApp: app, auth, firestore };
  } catch (error) {
    console.error("Fallo crítico en inicialización de Firebase:", error);
    // Devolvemos un objeto seguro para que los hooks no rompan la app
    return { firebaseApp: null as any, auth: null as any, firestore: null as any };
  }
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
