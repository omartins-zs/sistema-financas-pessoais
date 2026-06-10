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
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

// Detecta se a config foi preenchida de verdade.
const FIREBASE_ENABLED = !Object.values(firebaseConfig).some(
  (v) => typeof v === 'string' && (v.startsWith('SUA_') || v.startsWith('SEU_'))
);
