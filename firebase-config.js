/**
 * ============================================================
 *  CONFIGURAÇÃO DO FIREBASE
 * ============================================================
 *
 *  COMO ATIVAR A SINCRONIZAÇÃO NA NUVEM (passo a passo no FIREBASE.md):
 *
 *  1. Crie um projeto em  https://console.firebase.google.com
 *  2. Ative  Authentication > Sign-in method > E-mail/senha
 *  3. Ative  Firestore Database  (modo produção)
 *  4. Em  Configurações do projeto > Seus apps > Web,
 *     copie o objeto firebaseConfig e cole abaixo.
 *
 *  Enquanto estiver com os valores "SUA_...", o sistema funciona
 *  normalmente usando o armazenamento local do navegador (offline).
 * ============================================================
 */

const firebaseConfig = {
  apiKey: "AIzaSyAcAhcQ7u5d5qTU4mwj5I3S-JKGHLp7Wn8",
  authDomain: "financas-da-casa-c72c9.firebaseapp.com",
  projectId: "financas-da-casa-c72c9",
  storageBucket: "financas-da-casa-c72c9.firebasestorage.app",
  messagingSenderId: "633257427023",
  appId: "1:633257427023:web:a80f42e75d99ee3aff6a3a"
};

// Detecta se a config foi preenchida de verdade.
const FIREBASE_ENABLED = !Object.values(firebaseConfig).some(
  (v) => typeof v === 'string' && (v.startsWith('SUA_') || v.startsWith('SEU_'))
);
