import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

const projectId = 'demo-financas-da-casa';
const rules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
let testEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules }
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test('Firestore permite ao dono acessar somente seus dados e as subcoleções do app', async () => {
  const alice = testEnvironment.authenticatedContext('alice').firestore();
  const bob = testEnvironment.authenticatedContext('bob').firestore();
  const anonymous = testEnvironment.unauthenticatedContext().firestore();

  await assertSucceeds(setDoc(doc(alice, 'financas/alice'), { data: '{"2026-11":[]}' }));
  await assertSucceeds(getDoc(doc(alice, 'financas/alice')));
  await assertFails(getDoc(doc(alice, 'financas/bob')));
  await assertFails(setDoc(doc(alice, 'financas/bob'), { data: '{}' }));
  await assertFails(getDoc(doc(anonymous, 'financas/alice')));
  await assertFails(setDoc(doc(anonymous, 'financas/alice'), { data: '{}' }));

  for (const collection of ['logs', 'backups', 'backupsMeta']) {
    const ownDoc = doc(alice, `financas/alice/${collection}/record-1`);
    await assertSucceeds(setDoc(ownDoc, { quando: Date.now() }));
    await assertSucceeds(getDoc(ownDoc));
    if (collection === 'logs') {
      await assertFails(updateDoc(ownDoc, { resumo: 'alterado' }));
      await assertFails(deleteDoc(ownDoc));
    }
    await assertFails(getDoc(doc(alice, `financas/bob/${collection}/record-1`)));
    await assertFails(setDoc(doc(alice, `financas/bob/${collection}/record-1`), { quando: Date.now() }));
  }

  await assertFails(getDoc(doc(alice, 'financas/alice/unlisted/record-1')));
  await assertFails(setDoc(doc(alice, 'financas/alice/unlisted/record-1'), { value: 1 }));
});
