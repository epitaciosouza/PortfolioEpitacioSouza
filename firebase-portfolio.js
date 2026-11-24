import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import { getFirestore, doc, getDocFromServer, onSnapshot, runTransaction } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const config = {
  apiKey: 'AIzaSyB4HMDoS1Yp-zoJdRzEHGUviUjL_qZkDX8',
  authDomain: 'portfolio-epitacio-souza.firebaseapp.com',
  projectId: 'portfolio-epitacio-souza',
  storageBucket: 'portfolio-epitacio-souza.firebasestorage.app',
  messagingSenderId: '119105746880',
  appId: '1:119105746880:web:9a08670c35654205a93a25'
};
const ADMIN_UID = 'UqoyXdtVl9W3q1HYcYk6tuMeBmq1';
const VISITOR_UID = 'jo0MHuJl3zbdh4DzONZ54uwJpgs2';
const emails = { DUT8: 'epitacioeu0001@gmail.com', VIEW: 'view@portfolio-epitacio.invalid' };
const app = initializeApp(config), auth = getAuth(app), db = getFirestore(app);
const portfolio = doc(db, 'portfolio', 'dados');
const gate = document.getElementById('authGate');
const form = document.getElementById('authForm');
const error = document.getElementById('authError');
const button = document.getElementById('authSubmit');
const actions = document.querySelector('.global-actions');
const logout = document.getElementById('authLogout');
let unsubscribe = null, generation = 0, cloudPayload = null;

function lock(message = '') {
  document.body.classList.remove('signed-in');
  gate.hidden = false;
  actions.hidden = true;
  logout.hidden = true;
  window.portfolioIsAdmin = false;
  cloudPayload = null;
  window.portfolioApplyCloud([]);
  window.portfolioApplyPhoto(null);
  window.portfolioApplyUpdatedAt(null);
  error.textContent = message;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const username = document.getElementById('authUser').value.trim().toUpperCase();
  const email = emails[username];
  if (!email) { error.textContent = 'Usuário ou senha inválidos.'; return; }
  button.disabled = true; error.textContent = '';
  try { await signInWithEmailAndPassword(auth, email, document.getElementById('authPassword').value); }
  catch { error.textContent = 'Não foi possível entrar. Confira usuário, senha e conexão.'; }
  finally { document.getElementById('authPassword').value = ''; button.disabled = false; }
});
logout.addEventListener('click', () => signOut(auth));
window.portfolioCloudVersion = () => cloudPayload;
window.portfolioCloudSave = async (records, expectedPayload) => {
  if (!auth.currentUser || auth.currentUser.uid !== ADMIN_UID) throw new Error('Apenas o administrador pode alterar os dados.');
  const payload = JSON.stringify(records);
  if (new TextEncoder().encode(payload).length > 950000) throw new Error('A planilha excede o limite de armazenamento desta versão.');
  await runTransaction(db, async transaction => {
    const current = await transaction.get(portfolio);
    const currentPayload = current.exists() ? current.data().payload : null;
    if (currentPayload !== expectedPayload) throw new Error('Os dados na nuvem foram alterados durante a importação. Recarregue e tente novamente.');
    const photo = current.exists() ? (current.data().fotoPerfil || '') : '';
    if (new TextEncoder().encode(payload).length + new TextEncoder().encode(photo).length > 950000) throw new Error('Os dados e a foto excedem o limite de armazenamento desta versão.');
    transaction.set(portfolio, { payload, atualizadoEm: new Date().toISOString() }, { merge: true });
  });
};
window.portfolioSavePhoto = async (photo, onlyIfMissing = false) => {
  if (!auth.currentUser || auth.currentUser.uid !== ADMIN_UID) throw new Error('Apenas o administrador pode alterar a foto.');
  await runTransaction(db, async transaction => {
    const current = await transaction.get(portfolio);
    if (!current.exists()) throw new Error('Importe os dados do portfólio antes de adicionar a foto.');
    if (onlyIfMissing && current.data().fotoPerfil) return;
    const payload = current.data().payload || '';
    if (new TextEncoder().encode(payload).length + new TextEncoder().encode(photo).length > 950000) throw new Error('Os dados e a foto excedem o limite de armazenamento desta versão.');
    transaction.update(portfolio, { fotoPerfil: photo });
  });
};
onAuthStateChanged(auth, async user => {
  const thisGeneration = ++generation;
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  lock();
  if (!user) return;
  if (![ADMIN_UID, VISITOR_UID].includes(user.uid)) { await signOut(auth); lock('Usuário sem acesso ao portfólio.'); return; }
  try {
    const snapshot = await getDocFromServer(portfolio);
    if (thisGeneration !== generation) return;
    cloudPayload = snapshot.exists() ? snapshot.data().payload : null;
    const records = snapshot.exists() ? JSON.parse(cloudPayload) : [];
    if (!Array.isArray(records)) throw new Error('Dados inválidos');
    window.portfolioIsAdmin = user.uid === ADMIN_UID;
    window.portfolioApplyCloud(records);
    window.portfolioApplyPhoto(snapshot.exists() ? snapshot.data().fotoPerfil : null);
    window.portfolioApplyUpdatedAt(snapshot.exists() ? snapshot.data().atualizadoEm : null);
    if (window.portfolioIsAdmin && snapshot.exists() && !snapshot.data().fotoPerfil) {
      try {
        const localPhoto = localStorage.getItem('portfolio-profile-photo');
        if (localPhoto && /^data:image\/jpeg;base64,/.test(localPhoto)) await window.portfolioSavePhoto(localPhoto, true);
      } catch { console.warn('Não foi possível sincronizar a foto local. Selecione-a novamente.'); }
      if (thisGeneration !== generation) return;
    }
    actions.hidden = !window.portfolioIsAdmin;
    document.getElementById('profilePhoto').disabled = !window.portfolioIsAdmin;
    document.body.classList.add('signed-in'); gate.hidden = true; logout.hidden = false;
    unsubscribe = onSnapshot(portfolio, next => {
      if (thisGeneration !== generation) return;
      try { const payload = next.exists() ? next.data().payload : null; const value = next.exists() ? JSON.parse(payload) : []; if (!Array.isArray(value)) throw new Error('Dados inválidos'); cloudPayload = payload; window.portfolioApplyCloud(value); window.portfolioApplyPhoto(next.exists() ? next.data().fotoPerfil : null); window.portfolioApplyUpdatedAt(next.exists() ? next.data().atualizadoEm : null); }
      catch { alert('Não foi possível ler os dados atualizados.'); }
    }, () => alert('A conexão com os dados foi interrompida.'));
  } catch {
    if (thisGeneration === generation) { await signOut(auth); lock('Não foi possível carregar o portfólio. Verifique a conexão ou tente novamente.'); }
  }
});
