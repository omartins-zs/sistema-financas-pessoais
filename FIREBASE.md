# ☁️ Sincronização na nuvem com Firebase

Por padrão, a versão estática salva os dados **apenas neste navegador** (localStorage).

Seguindo os passos abaixo você ativa **login** e **sincronização na nuvem**, podendo acessar os mesmos dados de **qualquer dispositivo** (celular, PC, outro navegador) — **100% gratuito** para uso pessoal.

> 💡 Para você e sua esposa compartilharem os mesmos lançamentos, usem **o mesmo e-mail e senha** para entrar.

---

## 1. Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com>
2. Clique em **Adicionar projeto** e dê um nome (ex: `financas-da-casa`)
3. Pode **desativar** o Google Analytics (não é necessário)
4. Clique em **Criar projeto**

---

## 2. Ativar a autenticação por e-mail/senha

1. No menu lateral: **Criação → Authentication**
2. Clique em **Vamos começar**
3. Aba **Sign-in method** → clique em **E-mail/senha**
4. **Ative** a primeira opção e clique em **Salvar**

---

## 3. Ativar o banco Firestore

1. No menu lateral: **Criação → Firestore Database**
2. Clique em **Criar banco de dados**
3. Escolha a localização (ex: `southamerica-east1`) e avance
4. Selecione **Iniciar no modo de produção** → **Criar**

### Regras de segurança

Na aba **Regras** do Firestore, substitua as regras pelo conteúdo do arquivo [`firestore.rules`](firestore.rules) e clique em **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function dono(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    match /financas/{uid} {
      allow read, write: if dono(uid);

      // Permissões do documento pai não se estendem às subcoleções.
      match /logs/{logId} {
        allow read: if dono(uid);
        allow create: if dono(uid);
        // Registros de auditoria são append-only: não podem ser editados nem apagados.
        allow update, delete: if false;
      }
      match /backups/{backupId} {
        allow read, write: if dono(uid);
      }
      match /backupsMeta/{backupId} {
        allow read, write: if dono(uid);
      }
    }
  }
}
```

> Isso garante que **cada usuário só acessa os próprios dados**. Os logs são somente leitura depois de criados; dados financeiros continuam no documento `financas/{uid}` e backups continuam na subcoleção `backups`.

#### Publicar pelo Firebase CLI (alternativa)

Na raiz deste repositório, `firebase.json` aponta para `firestore.rules` e `.firebaserc` seleciona o mesmo projeto configurado em `firebase-config.js`. Com o Firebase CLI instalado e autenticado, publique apenas as regras do Firestore:

```bash
firebase login
firebase deploy --only firestore:rules
```

Confira o projeto selecionado antes de publicar com `firebase use`. A publicação não altera os documentos de dados; ela atualiza somente as regras de acesso.

#### Testar as regras sem tocar na produção

Com Node.js 24.12+ e Java 21 instalados, rode `npm run test:rules:emulator`. O emulador carrega `firestore.rules` e usa um projeto `demo-`, sem conexão com os documentos reais. A integração contínua executa essa verificação em cada push e pull request.

---

## 4. Pegar a configuração do app Web

1. No menu lateral clique na engrenagem ⚙️ → **Configurações do projeto**
2. Em **Seus apps**, clique no ícone **`</>`** (Web)
3. Dê um apelido (ex: `web`) e clique em **Registrar app**
4. O Firebase mostra um trecho com `const firebaseConfig = { ... }`
5. **Copie apenas o objeto** `firebaseConfig`

---

## 5. Colar no projeto

Abra o arquivo **`firebase-config.js`** e substitua os valores:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "financas-da-casa.firebaseapp.com",
  projectId: "financas-da-casa",
  storageBucket: "financas-da-casa.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123...:web:abc..."
};
```

Salve, faça commit e envie para o GitHub. Pronto! 🎉

> Estrutura completa do banco (Google Firebase) também está no [README](README.md#-estrutura-de-banco-de-dados-google-firebase) — seção **gerada automaticamente**.

---

## 6. Autorizar o domínio do GitHub Pages

Para o login funcionar no site publicado:

1. **Authentication → Settings → Domínios autorizados**
2. Clique em **Adicionar domínio**
3. Adicione: `SEU_USUARIO.github.io`

---

## ✅ Como usar

- Ao abrir o site, aparece a **tela de login**
- Na primeira vez, clique em **Criar conta** (e-mail + senha de 6+ caracteres)
- Depois é só **Entrar** — os dados sincronizam automaticamente
- Use o mesmo login em todos os dispositivos para ver os mesmos dados

> ℹ️ Sobre a segurança da `apiKey`: no Firebase Web, ela **não é secreta** — quem protege os dados são as **regras do Firestore** (passo 3). Pode versionar o `firebase-config.js` sem problemas.
