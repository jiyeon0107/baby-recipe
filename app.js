// ============== Firebase 초기화 ==============
// Firebase 콘솔에서 복사한 설정값으로 교체하세요
const firebaseConfig = {
  apiKey: "AIzaSyB9DWEmMnalSgsQo2_zaSTLPPhuiQmXhVw",
  authDomain: "baby-recipe-a67c7.firebaseapp.com",
  projectId: "baby-recipe-a67c7",
  storageBucket: "baby-recipe-a67c7.firebasestorage.app",
  messagingSenderId: "686913550687",
  appId: "1:686913550687:web:87f45800c6dede37e29eea"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// ============== 인증 ==============
let unsubscribeRecipes = null;
let currentUserProfile = null;

auth.onAuthStateChanged(async user => {
  if (user) {
    document.getElementById('login-screen').style.display = 'none';
    const avatar = document.getElementById('user-avatar');
    if (user.photoURL) { avatar.src = user.photoURL; avatar.classList.remove('hidden'); }
    document.getElementById('current-user-email').textContent = user.email;

    try {
      currentUserProfile = await loadOrCreateUserProfile(user);
    } catch (err) {
      console.error('프로필 로드 실패:', err);
      currentUserProfile = {};
    }
    updateNicknameDisplay();

    if (!currentUserProfile.nickname) {
      showNicknameModal();
    } else {
      startRealtimeSync();
    }
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    currentUserProfile = null;
    state.recipes = [];
    renderHome();
    if (unsubscribeRecipes) { unsubscribeRecipes(); unsubscribeRecipes = null; }
  }
});

async function loadOrCreateUserProfile(user) {
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const profile = { email: user.email, photoURL: user.photoURL || '', createdAt: Date.now() };
    await ref.set(profile);
    return profile;
  }
  return snap.data();
}

function updateNicknameDisplay() {
  const nickname = currentUserProfile && currentUserProfile.nickname;
  const el = document.getElementById('current-nickname');
  if (el) el.textContent = nickname || '(미설정)';
}

function showNicknameModal() {
  const input = document.getElementById('nickname-input');
  if (currentUserProfile && currentUserProfile.nickname) input.value = currentUserProfile.nickname;
  document.getElementById('nickname-modal').classList.remove('hidden');
}

async function saveNickname() {
  const val = document.getElementById('nickname-input').value.trim();
  if (!val) { toast('닉네임을 입력해주세요'); return; }
  if (val.length > 10) { toast('닉네임은 10자 이내로 입력해주세요'); return; }
  try {
    await db.collection('users').doc(auth.currentUser.uid).update({ nickname: val });
    currentUserProfile.nickname = val;
    updateNicknameDisplay();
    document.getElementById('nickname-modal').classList.add('hidden');
    toast('닉네임이 저장됐어요');
    if (!unsubscribeRecipes) startRealtimeSync();
  } catch (err) {
    toast('저장에 실패했어요');
  }
}

function startRealtimeSync() {
  if (unsubscribeRecipes) return;
  unsubscribeRecipes = db.collection('recipes')
    .where('ownerId', '==', auth.currentUser.uid)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(snapshot => {
      state.recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const active = document.querySelector('.screen.active');
      if (active) {
        if (active.id === 'home-screen') renderHome();
        if (active.id === 'find-screen') renderFind();
      }
    }, err => console.error('Firestore 동기화 오류:', err));
}

async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') toast('로그인에 실패했어요');
  }
}

async function signOut() {
  if (!confirm('로그아웃 할까요?')) return;
  await auth.signOut();
}

// ============== 상태 ==============
let state = {
  recipes: [],
  currentFilter: 'all',
  currentTagFilter: null,
  searchQuery: '',
  editingRecipe: null,
  viewingRecipeId: null,
  currentIngredients: [],
};

// ============== 유틸 ==============
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.style.opacity = '0', 1800);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============== 화면 전환 ==============
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(name + '-screen');
  if (screen) screen.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('text-orange-500', b.dataset.nav === name);
    b.classList.toggle('text-gray-400', b.dataset.nav !== name);
  });
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'find') renderFind();
}
function goHome() { showScreen('home'); }

// ============== 홈 렌더링 ==============
function renderHome() {
  const countEl = document.getElementById('recipe-count-text');
  countEl.textContent = `총 ${state.recipes.length}개의 레시피`;

  const allTags = Array.from(new Set(state.recipes.flatMap(r => r.tags || [])));
  const tagContainer = document.getElementById('tag-filters');
  tagContainer.innerHTML = allTags.map(t => {
    const active = state.currentTagFilter === t;
    return `<button onclick="setTagFilter('${esc(t)}')" class="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${active ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-600'}">#${esc(t)}</button>`;
  }).join('');

  document.querySelectorAll('.filter-btn').forEach(b => {
    const active = state.currentFilter === b.dataset.filter && !state.currentTagFilter;
    b.classList.toggle('bg-orange-400', active);
    b.classList.toggle('text-white', active);
    b.classList.toggle('bg-gray-100', !active);
    b.classList.toggle('text-gray-600', !active);
  });

  let list = [...state.recipes];
  if (state.currentFilter === 'favorite') list = list.filter(r => r.isFavorite);
  if (state.currentTagFilter) list = list.filter(r => (r.tags || []).includes(state.currentTagFilter));
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.ingredients || []).some(i => (i.name || '').toLowerCase().includes(q)) ||
      (r.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const listEl = document.getElementById('recipe-list');
  const emptyEl = document.getElementById('empty-state');

  if (state.recipes.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  listEl.innerHTML = list.map(r => {
    const cover = r.coverPhoto ? `<img src="${r.coverPhoto}" class="w-full h-28 object-cover" />` : `<div class="w-full h-28 bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center text-3xl">🍲</div>`;
    const fav = r.isFavorite ? '<span class="absolute top-2 right-2 text-yellow-400 text-sm">⭐</span>' : '';
    const tags = (r.tags || []).slice(0, 2).map(t => `<span class="text-[10px] tag-chip px-1.5 py-0.5 rounded-full">#${esc(t)}</span>`).join('');
    return `
      <div onclick="openDetail('${r.id}')" class="cursor-pointer bg-white rounded-2xl overflow-hidden card-shadow">
        <div class="relative">${cover}${fav}</div>
        <div class="p-2.5">
          <div class="text-sm font-semibold text-gray-800 truncate">${esc(r.name) || '제목 없음'}</div>
          <div class="flex gap-1 mt-1 flex-wrap">${tags}</div>
        </div>
      </div>
    `;
  }).join('');

  if (list.length === 0) {
    listEl.innerHTML = `<div class="col-span-2 py-10 text-center text-sm text-gray-400">조건에 맞는 레시피가 없어요</div>`;
  }
}

function setTagFilter(tag) {
  state.currentTagFilter = state.currentTagFilter === tag ? null : tag;
  state.currentFilter = 'all';
  renderHome();
}

document.querySelectorAll('.filter-btn').forEach(b => {
  b.addEventListener('click', () => {
    state.currentFilter = b.dataset.filter;
    state.currentTagFilter = null;
    renderHome();
  });
});

document.getElementById('search-input').addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  renderHome();
});

// ============== 상세 화면 ==============
function openDetail(id) {
  state.viewingRecipeId = id;
  const r = state.recipes.find(r => r.id === id);
  if (!r) return;

  const favBtn = document.getElementById('detail-favorite-btn');
  favBtn.textContent = r.isFavorite ? '⭐' : '☆';

  const cover = r.coverPhoto ? `<img src="${r.coverPhoto}" class="w-full aspect-[4/3] object-cover" />` : '';
  const meta = [];
  if (r.cookingTime) meta.push(`⏱ ${esc(r.cookingTime)}분`);
  if (r.servings) meta.push(`🍽 ${esc(r.servings)}`);

  const ingredients = (r.ingredients || []).map(i =>
    `<div class="flex justify-between py-1.5 border-b border-gray-100 text-sm"><span class="text-gray-800">${esc(i.name)}</span><span class="text-gray-500">${esc(i.amount || '')}</span></div>`
  ).join('');

  const steps = (r.steps || []).map((s, idx) => `
    <div class="flex gap-3">
      <div class="flex-shrink-0 w-6 h-6 rounded-full bg-orange-400 text-white text-xs font-semibold flex items-center justify-center mt-1">${idx + 1}</div>
      <div class="flex-1">
        <div class="text-sm text-gray-800 whitespace-pre-wrap">${esc(s.text)}</div>
        ${s.photo ? `<img src="${s.photo}" class="mt-2 w-32 h-32 object-cover rounded-xl" />` : ''}
      </div>
    </div>
  `).join('');

  const tags = (r.tags || []).map(t => `<span class="text-xs tag-chip px-2.5 py-1 rounded-full">#${esc(t)}</span>`).join('');

  document.getElementById('detail-content').innerHTML = `
    ${cover}
    <div class="px-5 pt-4">
      <h1 class="text-xl font-bold text-gray-800">${esc(r.name)}</h1>
      ${meta.length ? `<div class="mt-2 text-xs text-gray-500 flex gap-3">${meta.join('')}</div>` : ''}
    </div>
    ${ingredients ? `
    <div class="px-5 pt-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-2">재료</h3>
      <div>${ingredients}</div>
    </div>` : ''}
    ${steps ? `
    <div class="px-5 pt-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">만드는 순서</h3>
      <div class="space-y-4">${steps}</div>
    </div>` : ''}
    ${r.memo ? `
    <div class="px-5 pt-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-2">메모</h3>
      <div class="bg-amber-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">${esc(r.memo)}</div>
    </div>` : ''}
    ${tags ? `
    <div class="px-5 pt-6">
      <div class="flex flex-wrap gap-2">${tags}</div>
    </div>` : ''}
  `;
  showScreen('detail');
}

async function toggleFavoriteCurrent() {
  const r = state.recipes.find(r => r.id === state.viewingRecipeId);
  if (!r) return;
  const newVal = !r.isFavorite;
  r.isFavorite = newVal;
  r.updatedAt = Date.now();
  document.getElementById('detail-favorite-btn').textContent = newVal ? '⭐' : '☆';
  toast(newVal ? '즐겨찾기에 추가했어요' : '즐겨찾기에서 제거했어요');
  try {
    await db.collection('recipes').doc(r.id).update({ isFavorite: newVal, updatedAt: r.updatedAt });
  } catch (err) {
    r.isFavorite = !newVal;
    document.getElementById('detail-favorite-btn').textContent = r.isFavorite ? '⭐' : '☆';
    toast('저장에 실패했어요');
  }
}

function editCurrent() {
  openEdit(state.viewingRecipeId);
}

// ============== 편집/등록 화면 ==============
function openEdit(id = null) {
  if (id) {
    const r = state.recipes.find(r => r.id === id);
    state.editingRecipe = JSON.parse(JSON.stringify(r));
    document.getElementById('edit-title').textContent = '레시피 수정';
    document.getElementById('delete-section').classList.remove('hidden');
  } else {
    state.editingRecipe = {
      id: uid(),
      name: '',
      coverPhoto: '',
      cookingTime: '',
      servings: '',
      ingredients: [],
      steps: [],
      memo: '',
      tags: [],
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    document.getElementById('edit-title').textContent = '새 레시피';
    document.getElementById('delete-section').classList.add('hidden');
  }
  renderEditForm();
  showScreen('edit');
}

function renderEditForm() {
  const r = state.editingRecipe;
  document.getElementById('edit-name').value = r.name || '';
  document.getElementById('edit-cooking-time').value = r.cookingTime || '';
  document.getElementById('edit-servings').value = r.servings || '';
  document.getElementById('edit-memo').value = r.memo || '';

  if (r.coverPhoto) {
    document.getElementById('cover-preview').src = r.coverPhoto;
    document.getElementById('cover-preview').classList.remove('hidden');
    document.getElementById('cover-placeholder').classList.add('hidden');
  } else {
    document.getElementById('cover-preview').classList.add('hidden');
    document.getElementById('cover-placeholder').classList.remove('hidden');
  }

  renderIngredientsEdit();
  renderStepsEdit();
  renderTagsEdit();
  renderRecentTags();
}

function renderIngredientsEdit() {
  const r = state.editingRecipe;
  if (r.ingredients.length === 0) r.ingredients.push({ name: '', amount: '' });
  const listEl = document.getElementById('ingredients-list');
  listEl.innerHTML = r.ingredients.map((ing, i) => `
    <div class="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
      <input value="${esc(ing.name)}" oninput="updateIngredient(${i}, 'name', this.value)" placeholder="재료명" class="flex-1 bg-transparent text-sm text-gray-800" />
      <input value="${esc(ing.amount)}" oninput="updateIngredient(${i}, 'amount', this.value)" placeholder="수량" class="w-20 bg-transparent text-sm text-gray-600 text-right" />
      <button onclick="removeIngredient(${i})" class="text-gray-300 text-lg">×</button>
    </div>
  `).join('');
  document.getElementById('ingredient-count').textContent = r.ingredients.filter(i => i.name).length + '개';
  renderIngredientSuggestions();
}

function renderIngredientSuggestions() {
  const r = state.editingRecipe;
  const current = new Set(r.ingredients.map(i => i.name.trim()).filter(Boolean));
  const counts = {};
  state.recipes.forEach(rc => (rc.ingredients || []).forEach(i => {
    if (i.name && !current.has(i.name)) counts[i.name] = (counts[i.name] || 0) + 1;
  }));
  const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 6).map(([n]) => n);
  const el = document.getElementById('ingredient-suggestions');
  el.innerHTML = top.map(n => `<button onclick="quickAddIngredient('${esc(n).replace(/'/g,"\\'")}')" class="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">💡 ${esc(n)}</button>`).join('');
}

function quickAddIngredient(name) {
  const r = state.editingRecipe;
  const blankIdx = r.ingredients.findIndex(i => !i.name.trim());
  if (blankIdx >= 0) r.ingredients[blankIdx].name = name;
  else r.ingredients.push({ name, amount: '' });
  renderIngredientsEdit();
}

function updateIngredient(i, field, val) {
  state.editingRecipe.ingredients[i][field] = val;
  document.getElementById('ingredient-count').textContent = state.editingRecipe.ingredients.filter(i => i.name).length + '개';
}
function addIngredient() {
  state.editingRecipe.ingredients.push({ name: '', amount: '' });
  renderIngredientsEdit();
}
function removeIngredient(i) {
  state.editingRecipe.ingredients.splice(i, 1);
  if (state.editingRecipe.ingredients.length === 0) state.editingRecipe.ingredients.push({ name: '', amount: '' });
  renderIngredientsEdit();
}

function renderStepsEdit() {
  const r = state.editingRecipe;
  if (r.steps.length === 0) r.steps.push({ text: '', photo: '' });
  const listEl = document.getElementById('steps-list');
  listEl.innerHTML = r.steps.map((s, i) => `
    <div class="flex gap-3">
      <div class="flex-shrink-0 w-6 h-6 rounded-full bg-orange-400 text-white text-xs font-semibold flex items-center justify-center mt-2">${i + 1}</div>
      <div class="flex-1 space-y-2">
        <textarea oninput="updateStep(${i}, 'text', this.value)" rows="2" placeholder="이 단계의 설명" class="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-800 resize-none">${esc(s.text)}</textarea>
        <div class="flex gap-2 items-center">
          ${s.photo
            ? `<div class="relative inline-block"><img src="${s.photo}" class="w-20 h-20 rounded-xl object-cover" /><button onclick="removeStepPhoto(${i})" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 text-white text-xs flex items-center justify-center shadow">×</button></div>`
            : `<label class="inline-flex items-center gap-1 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 cursor-pointer"><span>📷</span><span>사진 추가</span><input type="file" accept="image/*" class="hidden" onchange="handleStepPhoto(event, ${i})" /></label>`
          }
          <button onclick="removeStep(${i})" class="text-xs text-gray-400 ml-auto">삭제</button>
        </div>
      </div>
    </div>
  `).join('');
}

function updateStep(i, field, val) {
  state.editingRecipe.steps[i][field] = val;
}
function addStep() {
  state.editingRecipe.steps.push({ text: '', photo: '' });
  renderStepsEdit();
}
function removeStep(i) {
  state.editingRecipe.steps.splice(i, 1);
  if (state.editingRecipe.steps.length === 0) state.editingRecipe.steps.push({ text: '', photo: '' });
  renderStepsEdit();
}

// ============== 사진 처리 ==============
function resizeImage(file, maxDim, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => cb(blob), 'image/jpeg', 0.8);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function handleCoverPhoto(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  resizeImage(file, 400, (blob) => {
    state.editingRecipe._coverPhotoBlob = blob;
    const preview = URL.createObjectURL(blob);
    if (state.editingRecipe._coverPhotoPreview) URL.revokeObjectURL(state.editingRecipe._coverPhotoPreview);
    state.editingRecipe._coverPhotoPreview = preview;
    document.getElementById('cover-preview').src = preview;
    document.getElementById('cover-preview').classList.remove('hidden');
    document.getElementById('cover-placeholder').classList.add('hidden');
  });
}

function handleStepPhoto(ev, stepIdx) {
  const file = ev.target.files[0];
  if (!file) return;
  resizeImage(file, 300, (blob) => {
    const step = state.editingRecipe.steps[stepIdx];
    if (step._photoPreview) URL.revokeObjectURL(step._photoPreview);
    step._photoBlob = blob;
    const preview = URL.createObjectURL(blob);
    step._photoPreview = preview;
    step.photo = preview;
    renderStepsEdit();
  });
}

function removeStepPhoto(i) {
  const step = state.editingRecipe.steps[i];
  if (step._photoPreview) URL.revokeObjectURL(step._photoPreview);
  step._photoBlob = null;
  step._photoPreview = null;
  step.photo = '';
  renderStepsEdit();
}

function renderTagsEdit() {
  const tags = state.editingRecipe.tags || [];
  document.getElementById('edit-tags').innerHTML = tags.map((t, i) =>
    `<span class="tag-chip text-xs px-3 py-1.5 rounded-full font-medium flex items-center gap-1">#${esc(t)} <button onclick="removeTag(${i})" class="text-orange-400">×</button></span>`
  ).join('') || '<span class="text-xs text-gray-400">태그를 추가하면 나중에 찾기 쉬워요</span>';
}

function renderRecentTags() {
  const current = new Set(state.editingRecipe.tags || []);
  const all = Array.from(new Set(state.recipes.flatMap(r => r.tags || []))).filter(t => !current.has(t)).slice(0, 10);
  const el = document.getElementById('recent-tags');
  if (all.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="text-xs text-gray-400 w-full mb-1">자주 쓰는 태그</div>' +
    all.map(t => `<button onclick="quickAddTag('${esc(t).replace(/'/g,"\\'")}')" class="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">#${esc(t)}</button>`).join('');
}

function addTagFromInput() {
  const input = document.getElementById('tag-input');
  const val = input.value.trim().replace(/^#/, '');
  if (!val) return;
  val.split(',').map(v => v.trim()).filter(Boolean).forEach(v => {
    if (!state.editingRecipe.tags.includes(v)) state.editingRecipe.tags.push(v);
  });
  input.value = '';
  renderTagsEdit();
  renderRecentTags();
}

function quickAddTag(t) {
  if (!state.editingRecipe.tags.includes(t)) state.editingRecipe.tags.push(t);
  renderTagsEdit();
  renderRecentTags();
}
function removeTag(i) {
  state.editingRecipe.tags.splice(i, 1);
  renderTagsEdit();
  renderRecentTags();
}

document.getElementById('tag-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addTagFromInput(); }
});

// ============== 레시피 저장/삭제 ==============
async function saveRecipe() {
  const r = state.editingRecipe;
  r.name = document.getElementById('edit-name').value.trim();
  if (!r.name) { toast('레시피 이름을 입력해주세요'); return; }
  r.cookingTime = document.getElementById('edit-cooking-time').value;
  r.servings = document.getElementById('edit-servings').value.trim();
  r.memo = document.getElementById('edit-memo').value;
  r.ingredients = r.ingredients.filter(i => i.name.trim());
  r.steps = r.steps.filter(s => s.text.trim() || s.photo);
  r.updatedAt = Date.now();

  const saveBtn = document.querySelector('#edit-screen [onclick="saveRecipe()"]');
  if (saveBtn) saveBtn.disabled = true;

  try {
    if (r._coverPhotoBlob) {
      r.coverPhoto = await blobToDataURL(r._coverPhotoBlob);
      if (r._coverPhotoPreview) URL.revokeObjectURL(r._coverPhotoPreview);
      delete r._coverPhotoBlob;
      delete r._coverPhotoPreview;
    }

    for (let i = 0; i < r.steps.length; i++) {
      if (r.steps[i]._photoBlob) {
        r.steps[i].photo = await blobToDataURL(r.steps[i]._photoBlob);
        if (r.steps[i]._photoPreview) URL.revokeObjectURL(r.steps[i]._photoPreview);
        delete r.steps[i]._photoBlob;
        delete r.steps[i]._photoPreview;
      }
    }

    const recipeId = r.id;
    const { id, ...data } = r;
    data.ownerId = auth.currentUser.uid;
    data.ownerNickname = (currentUserProfile && currentUserProfile.nickname) || '';
    if (!data.visibility) data.visibility = 'private';
    await db.collection('recipes').doc(recipeId).set(data);

    const idx = state.recipes.findIndex(x => x.id === recipeId);
    if (idx >= 0) state.recipes[idx] = { id: recipeId, ...data };
    else state.recipes.unshift({ id: recipeId, ...data });

    state.editingRecipe = null;
    toast('저장했어요');
    openDetail(recipeId);
  } catch (err) {
    console.error('저장 오류:', err);
    toast('저장에 실패했어요. 다시 시도해주세요.');
    if (saveBtn) saveBtn.disabled = false;
  }
}

function cancelEdit() {
  if (state.editingRecipe) {
    if (state.editingRecipe._coverPhotoPreview) URL.revokeObjectURL(state.editingRecipe._coverPhotoPreview);
    (state.editingRecipe.steps || []).forEach(s => {
      if (s._photoPreview) URL.revokeObjectURL(s._photoPreview);
    });
  }
  state.editingRecipe = null;
  if (state.viewingRecipeId) openDetail(state.viewingRecipeId);
  else goHome();
}

async function deleteCurrentRecipe() {
  if (!confirm('이 레시피를 삭제할까요? 되돌릴 수 없어요.')) return;
  const id = state.editingRecipe.id;
  try {
    await db.collection('recipes').doc(id).delete();
    state.editingRecipe = null;
    state.viewingRecipeId = null;
    toast('삭제했어요');
    goHome();
  } catch (err) {
    toast('삭제에 실패했어요');
  }
}

// ============== 재료로 찾기 ==============
function renderFind() {
  const box = document.getElementById('current-ingredients');
  box.innerHTML = state.currentIngredients.map((ing, i) =>
    `<span class="tag-chip text-sm px-3 py-1.5 rounded-full font-medium flex items-center gap-1">${esc(ing)} <button onclick="removeCurrentIngredient(${i})" class="text-orange-400">×</button></span>`
  ).join('');

  const current = new Set(state.currentIngredients);
  const counts = {};
  state.recipes.forEach(r => (r.ingredients || []).forEach(i => {
    if (i.name && !current.has(i.name)) counts[i.name] = (counts[i.name] || 0) + 1;
  }));
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 8).map(([n])=>n);
  document.getElementById('find-suggestions').innerHTML = top.map(n =>
    `<button onclick="addCurrentIngredientName('${esc(n).replace(/'/g,"\\'")}')" class="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">+ ${esc(n)}</button>`
  ).join('');

  const results = document.getElementById('find-results');
  const empty = document.getElementById('find-empty');
  if (state.currentIngredients.length === 0) {
    results.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const matches = state.recipes.map(r => {
    const ingNames = (r.ingredients || []).map(i => i.name.trim()).filter(Boolean);
    if (ingNames.length === 0) return null;
    const have = ingNames.filter(n => state.currentIngredients.some(c => n.includes(c) || c.includes(n)));
    const missing = ingNames.filter(n => !have.includes(n));
    const rate = Math.round(have.length / ingNames.length * 100);
    return { recipe: r, rate, missing, haveCount: have.length, totalCount: ingNames.length };
  }).filter(Boolean).filter(m => m.haveCount > 0)
    .sort((a,b) => b.rate - a.rate || (b.recipe.isFavorite - a.recipe.isFavorite));

  if (matches.length === 0) {
    results.innerHTML = `<div class="py-8 text-center text-sm text-gray-400">입력한 재료로 만들 수 있는 레시피가 없어요</div>`;
    return;
  }

  results.innerHTML = matches.map(m => {
    const cover = m.recipe.coverPhoto ? `<img src="${m.recipe.coverPhoto}" class="w-16 h-16 object-cover rounded-xl" />` : `<div class="w-16 h-16 rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center text-2xl">🍲</div>`;
    const rateColor = m.rate === 100 ? 'text-green-600' : m.rate >= 60 ? 'text-orange-500' : 'text-gray-500';
    const missingText = m.missing.length === 0 ? '<span class="text-green-600">✓ 모든 재료 보유</span>' : `부족: ${m.missing.slice(0,3).map(esc).join(', ')}${m.missing.length>3?` 외 ${m.missing.length-3}개`:''}`;
    return `
      <div onclick="openDetail('${m.recipe.id}')" class="bg-white rounded-2xl p-3 flex gap-3 card-shadow cursor-pointer">
        ${cover}
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline justify-between">
            <div class="text-sm font-semibold text-gray-800 truncate">${esc(m.recipe.name)}</div>
            <div class="text-sm font-bold ${rateColor} ml-2">${m.rate}%</div>
          </div>
          <div class="text-xs text-gray-500 mt-1">보유 ${m.haveCount}/${m.totalCount}</div>
          <div class="text-xs text-gray-500 mt-0.5 truncate">${missingText}</div>
        </div>
      </div>
    `;
  }).join('');
}

function addCurrentIngredient() {
  const input = document.getElementById('find-input');
  const val = input.value.trim();
  if (!val) return;
  addCurrentIngredientName(val);
  input.value = '';
}
function addCurrentIngredientName(name) {
  if (!state.currentIngredients.includes(name)) state.currentIngredients.push(name);
  renderFind();
}
function removeCurrentIngredient(i) {
  state.currentIngredients.splice(i, 1);
  renderFind();
}
document.getElementById('find-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addCurrentIngredient(); }
});

// ============== 데이터 내보내기/가져오기 ==============
function exportData() {
  const data = JSON.stringify(state.recipes, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `baby-food-recipes-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('백업 파일을 다운로드했어요');
}

function importData(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error('형식 오류');
      if (!confirm(`${data.length}개의 레시피를 불러올까요? (기존 레시피에 추가됩니다)`)) return;
      toast('불러오는 중...');
      const batch = db.batch();
      data.forEach(r => {
        if (!r.id) r.id = uid();
        if (state.recipes.some(x => x.id === r.id)) r.id = uid();
        const { id, ...docData } = r;
        docData.ownerId = auth.currentUser.uid;
        docData.ownerNickname = (currentUserProfile && currentUserProfile.nickname) || '';
        if (!docData.visibility) docData.visibility = 'private';
        batch.set(db.collection('recipes').doc(id), docData);
      });
      await batch.commit();
      toast('불러오기 완료');
      showScreen('home');
    } catch (e) {
      alert('올바른 백업 파일이 아닙니다');
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

async function clearAll() {
  if (!confirm('정말 모든 레시피를 삭제할까요? 되돌릴 수 없어요.')) return;
  if (!confirm('한 번 더 확인할게요. 정말 삭제?')) return;
  try {
    const snapshot = await db.collection('recipes')
      .where('ownerId', '==', auth.currentUser.uid).get();
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    toast('모두 삭제했어요');
    showScreen('home');
  } catch (err) {
    toast('삭제에 실패했어요');
  }
}

// ============== 샘플 데이터 ==============
async function loadSampleData() {
  if (state.recipes.length > 0 && !confirm('이미 레시피가 있어요. 샘플을 추가할까요?')) return;
  const now = Date.now();
  const samples = [
    {
      id: uid(),
      name: '닭고기 애호박 죽',
      coverPhoto: '', cookingTime: '25', servings: '2회분',
      ingredients: [
        { name: '쌀', amount: '30g' },
        { name: '닭가슴살', amount: '20g' },
        { name: '애호박', amount: '20g' },
        { name: '당근', amount: '10g' },
        { name: '물', amount: '300ml' },
      ],
      steps: [
        { text: '쌀은 30분 이상 불려둔다', photo: '' },
        { text: '닭가슴살, 애호박, 당근을 잘게 다진다', photo: '' },
        { text: '냄비에 불린 쌀과 물을 넣고 끓인다', photo: '' },
        { text: '다진 재료를 넣고 쌀알이 퍼질 때까지 약불에서 끓인다', photo: '' },
      ],
      memo: '아이가 잘 먹음. 당근을 조금 더 넣어도 좋을 것 같음.',
      tags: ['후기이유식', '죽', '단백질'],
      isFavorite: true, createdAt: now - 3000, updatedAt: now - 3000,
    },
    {
      id: uid(),
      name: '고구마 사과 매시',
      coverPhoto: '', cookingTime: '15', servings: '1회분',
      ingredients: [
        { name: '고구마', amount: '50g' },
        { name: '사과', amount: '30g' },
        { name: '분유물', amount: '20ml' },
      ],
      steps: [
        { text: '고구마는 껍질을 벗기고 찐다', photo: '' },
        { text: '사과는 강판에 간다', photo: '' },
        { text: '고구마를 으깨고 사과와 섞은 뒤 분유물로 농도 조절', photo: '' },
      ],
      memo: '간식으로 좋음. 단맛이 있어서 아이가 좋아함.',
      tags: ['중기이유식', '간식', '과일'],
      isFavorite: false, createdAt: now - 2000, updatedAt: now - 2000,
    },
    {
      id: uid(),
      name: '소고기 브로콜리 볶음밥',
      coverPhoto: '', cookingTime: '20', servings: '2회분',
      ingredients: [
        { name: '밥', amount: '1/2공기' },
        { name: '소고기 다짐육', amount: '30g' },
        { name: '브로콜리', amount: '20g' },
        { name: '양파', amount: '10g' },
        { name: '참기름', amount: '약간' },
      ],
      steps: [
        { text: '브로콜리와 양파는 잘게 다지고, 브로콜리는 한 번 데친다', photo: '' },
        { text: '팬에 참기름 두르고 소고기를 먼저 볶는다', photo: '' },
        { text: '양파와 브로콜리를 넣고 볶는다', photo: '' },
        { text: '밥을 넣고 골고루 섞어 볶는다', photo: '' },
      ],
      memo: '',
      tags: ['완료기', '밥', '단백질'],
      isFavorite: false, createdAt: now - 1000, updatedAt: now - 1000,
    }
  ];

  try {
    const batch = db.batch();
    samples.forEach(s => {
      const { id, ...data } = s;
      batch.set(db.collection('recipes').doc(id), data);
    });
    await batch.commit();
    toast('샘플 레시피를 추가했어요');
    showScreen('home');
  } catch (err) {
    toast('추가에 실패했어요');
  }
}

// ============== 시작 ==============
showScreen('home');
