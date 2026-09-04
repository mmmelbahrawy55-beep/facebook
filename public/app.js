// Freebuff Frontend Application
const API_BASE = '';

// State
let governorates = [];
let selectedGovernorate = null;
let selectedAd = null;
let eventSource = null;
let countdownInterval = null;

// DOM Elements
const fbStatus = document.getElementById('fbStatus');
const fbStatusText = document.getElementById('fbStatusText');
const fbLogoutBtn = document.getElementById('fbLogoutBtn');
const adForm = document.getElementById('adForm');
const addGroupForm = document.getElementById('addGroupForm');
const governorateSelect = document.getElementById('governorateSelect');
const discoverGroupsBtn = document.getElementById('discoverGroupsBtn');
const groupsList = document.getElementById('groupsList');
const adsList = document.getElementById('adsList');
const historyList = document.getElementById('historyList');
const loginModal = document.getElementById('loginModal');
const postModal = document.getElementById('postModal');
const fbLoginBtn = document.getElementById('fbLoginBtn');
const confirmPostBtn = document.getElementById('confirmPostBtn');
const delaySecondsInput = document.getElementById('delaySeconds');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadGovernorates();
  loadAds();
  loadHistory();
  checkFacebookStatus();
  connectToProgressStream();
});

// Load governorates
async function loadGovernorates() {
  try {
    const response = await fetch(`${API_BASE}/api/governorates`);
    governorates = await response.json();
    
    governorateSelect.innerHTML = '<option value="">اختر المحافظة</option>';
    governorates.forEach(gov => {
      const option = document.createElement('option');
      option.value = gov.id;
      option.textContent = `${gov.name_ar} (${gov.name_en})`;
      governorateSelect.appendChild(option);
    });
  } catch (error) {
    showToast('خطأ في تحميل المحافظات', 'error');
  }
}

// Load ads
async function loadAds() {
  try {
    const response = await fetch(`${API_BASE}/api/ads`);
    const ads = await response.json();
    
    if (ads.length === 0) {
      adsList.innerHTML = `
        <div class="empty-state">
          <span>📄</span>
          <p>لا توجد إعلانات بعد</p>
        </div>
      `;
      return;
    }

    adsList.innerHTML = ads.map(ad => `
      <div class="ad-item">
        <h4>${escapeHtml(ad.title)}</h4>
        <p>${escapeHtml(ad.description.substring(0, 100))}...</p>
        <p><strong>المحافظة:</strong> ${ad.governorate_name || 'غير محددة'}</p>
        <span class="status-badge status-${ad.status}">${getStatusText(ad.status)}</span>
        <div class="actions">
          <button class="btn btn-success btn-sm" onclick="openPostModal(${ad.id})">
            📤 نشر
          </button>
          <button class="btn btn-edit btn-sm" onclick="openEditAdModal(${ad.id})">
            ✏️ تعديل
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteAd(${ad.id}, '${escapeHtml(ad.title)}')">
            🗑️ حذف
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    showToast('خطأ في تحميل الإعلانات', 'error');
  }
}

// Delete ad
async function deleteAd(adId, adTitle) {
  if (!confirm(`هل أنت متأكد من حذف الإعلان "${adTitle}"؟`)) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/ads/${adId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      showToast('تم حذف الإعلان بنجاح', 'success');
      loadAds();
    } else {
      throw new Error('Failed to delete ad');
    }
  } catch (error) {
    showToast('خطأ في حذف الإعلان', 'error');
  }
}

// Open edit ad modal
async function openEditAdModal(adId) {
  try {
    const response = await fetch(`${API_BASE}/api/ads/${adId}`);
    const ad = await response.json();
    
    if (!ad) {
      showToast('الإعلان غير موجود', 'error');
      return;
    }
    
    // Create edit modal if not exists
    let editModal = document.getElementById('editAdModal');
    if (!editModal) {
      editModal = document.createElement('div');
      editModal.id = 'editAdModal';
      editModal.className = 'modal';
      editModal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>✏️ تعديل الإعلان</h3>
            <button class="close-btn" onclick="closeModal('editAdModal')">&times;</button>
          </div>
          <form id="editAdForm">
            <input type="hidden" id="editAdId">
            <div class="form-group">
              <label for="editAdTitle">عنوان الإعلان</label>
              <input type="text" id="editAdTitle" required>
            </div>
            <div class="form-group">
              <label for="editAdDescription">وصف الإعلان</label>
              <textarea id="editAdDescription" required></textarea>
            </div>
            <div class="form-group">
              <label for="editAdGovernorate">المحافظة</label>
              <select id="editAdGovernorate" required></select>
            </div>
            <div class="form-group">
              <label for="editAdImage">صورة الإعلان (اترك فارغة للاحتفاظ بالحالية)</label>
              <input type="file" id="editAdImage" accept="image/*">
            </div>
            <button type="submit" class="btn btn-primary btn-block">💾 حفظ التعديلات</button>
          </form>
        </div>
      `;
      document.body.appendChild(editModal);
      
      // Add event listener
      document.getElementById('editAdForm').addEventListener('submit', handleEditAdSubmit);
    }
    
    // Fill form with ad data
    document.getElementById('editAdId').value = ad.id;
    document.getElementById('editAdTitle').value = ad.title;
    document.getElementById('editAdDescription').value = ad.description;
    
    // Populate governorates
    const editGovernorate = document.getElementById('editAdGovernorate');
    editGovernorate.innerHTML = '<option value="">اختر المحافظة</option>';
    governorates.forEach(gov => {
      const option = document.createElement('option');
      option.value = gov.id;
      option.textContent = `${gov.name_ar} (${gov.name_en})`;
      if (gov.id === ad.governorate_id) {
        option.selected = true;
      }
      editGovernorate.appendChild(option);
    });
    
    openModal('editAdModal');
  } catch (error) {
    showToast('خطأ في تحميل بيانات الإعلان', 'error');
  }
}

// Handle edit ad form submit
async function handleEditAdSubmit(e) {
  e.preventDefault();
  
  const adId = document.getElementById('editAdId').value;
  const formData = new FormData();
  formData.append('title', document.getElementById('editAdTitle').value);
  formData.append('description', document.getElementById('editAdDescription').value);
  formData.append('governorate_id', document.getElementById('editAdGovernorate').value);
  
  const imageFile = document.getElementById('editAdImage').files[0];
  if (imageFile) {
    formData.append('image', imageFile);
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/ads/${adId}`, {
      method: 'PUT',
      body: formData
    });
    
    if (response.ok) {
      showToast('تم تعديل الإعلان بنجاح', 'success');
      closeModal('editAdModal');
      loadAds();
    } else {
      throw new Error('Failed to update ad');
    }
  } catch (error) {
    showToast('خطأ في تعديل الإعلان', 'error');
  }
}

// Load posting history
async function loadHistory() {
  try {
    const response = await fetch(`${API_BASE}/api/history`);
    const history = await response.json();
    
    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <span>📈</span>
          <p>لا يوجد سجل بعد</p>
        </div>
      `;
      return;
    }

    historyList.innerHTML = history.slice(0, 20).map(h => `
      <div class="group-item">
        <div>
          <h4>${escapeHtml(h.ad_title || 'إعلان محذوف')}</h4>
          <p>${h.governorate_name || 'غير محددة'} - ${h.posted_at || ''}</p>
        </div>
        <span class="status-badge status-${h.status}">${h.status === 'success' ? '✅ نجح' : '❌ فشل'}</span>
      </div>
    `).join('');
  } catch (error) {
    showToast('خطأ في تحميل السجل', 'error');
  }
}

// Check Facebook connection status
async function checkFacebookStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/facebook/status`);
    const data = await response.json();
    
    if (data.connected) {
      fbStatus.classList.add('connected');
      fbStatusText.textContent = 'متصل';
      fbLogoutBtn.style.display = 'inline-block';
      discoverGroupsBtn.disabled = false;
    } else {
      fbStatus.classList.remove('connected');
      fbStatusText.textContent = 'غير متصل';
      fbLogoutBtn.style.display = 'none';
      discoverGroupsBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error checking Facebook status:', error);
  }
}

// Facebook logout
fbLogoutBtn.addEventListener('click', async () => {
  if (!confirm('هل أنت متأكد من قطع الاتصال بفيسبوك؟')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/facebook/logout`, {
      method: 'POST'
    });
    
    if (response.ok) {
      showToast('تم قطع الاتصال بفيسبوك', 'success');
      checkFacebookStatus();
    } else {
      throw new Error('Failed to logout');
    }
  } catch (error) {
    showToast('خطأ في قطع الاتصال', 'error');
  }
});

// Connect to SSE progress stream
function connectToProgressStream() {
  if (eventSource) {
    eventSource.close();
  }
  
  eventSource = new EventSource(`${API_BASE}/api/progress`);
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleProgressUpdate(data);
  };
  
  eventSource.onerror = () => {
    console.log('SSE connection error, reconnecting...');
    setTimeout(connectToProgressStream, 3000);
  };
}

// Handle progress updates from server
function handleProgressUpdate(data) {
  const progressContainer = document.getElementById('progressContainer');
  const progressText = document.getElementById('progressText');
  const progressFill = document.getElementById('progressFill');
  const progressCurrent = document.getElementById('progressCurrent');
  const progressTotal = document.getElementById('progressTotal');
  const delayInfo = document.getElementById('delayInfo');
  
  switch (data.type) {
    case 'posting':
      progressContainer.style.display = 'block';
      progressText.textContent = `جاري النشر إلى: ${data.groupName}`;
      progressFill.style.width = `${(data.current / data.total) * 100}%`;
      progressCurrent.textContent = data.current;
      progressTotal.textContent = data.total;
      delayInfo.style.display = 'none';
      addLogEntry(`جاري النشر إلى ${data.groupName}...`, 'waiting');
      break;
      
    case 'posted':
      if (data.status === 'success') {
        addLogEntry(`✅ تم النشر بنجاح إلى ${data.groupName}`, 'success');
      } else {
        addLogEntry(`❌ فشل النشر إلى ${data.groupName}: ${data.error}`, 'failed');
      }
      break;
      
    case 'waiting':
      progressText.textContent = `انتظار قبل النشرة التالية...`;
      delayInfo.style.display = 'block';
      startCountdown(data.delaySeconds);
      addLogEntry(`⏳ الانتظار ${data.delaySeconds} ثانية قبل ${data.nextGroup}`, 'waiting');
      break;
      
    case 'completed':
      progressContainer.style.display = 'block';
      progressText.textContent = `✅ اكتمل النشر!`;
      progressFill.style.width = '100%';
      delayInfo.style.display = 'none';
      
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      
      showToast(`تم النشر بنجاح إلى ${data.successCount} مجموعة (${data.failedCount} فشل)`, 'success');
      loadAds();
      loadHistory();
      break;
      
    case 'error':
      progressText.textContent = `❌ خطأ: ${data.message}`;
      showToast(`خطأ: ${data.message}`, 'error');
      break;
  }
}

// Start countdown timer
function startCountdown(seconds) {
  const countdownEl = document.getElementById('countdown');
  let remaining = seconds;
  
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  countdownEl.textContent = remaining;
  
  countdownInterval = setInterval(() => {
    remaining--;
    countdownEl.textContent = remaining;
    
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }, 1000);
}

// Add log entry
function addLogEntry(message, type) {
  const postLog = document.getElementById('postLog');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  postLog.appendChild(entry);
  postLog.scrollTop = postLog.scrollHeight;
}

// Create ad form submission
adForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData();
  formData.append('title', document.getElementById('adTitle').value);
  formData.append('description', document.getElementById('adDescription').value);
  formData.append('governorate_id', governorateSelect.value);
  
  const imageFile = document.getElementById('adImage').files[0];
  if (imageFile) {
    formData.append('image', imageFile);
  }

  try {
    const response = await fetch(`${API_BASE}/api/ads`, {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      showToast('تم حفظ الإعلان بنجاح', 'success');
      adForm.reset();
      loadAds();
    } else {
      throw new Error('Failed to create ad');
    }
  } catch (error) {
    showToast('خطأ في حفظ الإعلان', 'error');
  }
});

// Add group form submission
addGroupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const governorateId = governorateSelect.value;
  if (!governorateId) {
    showToast('يرجى اختيار المحافظة أولاً', 'error');
    return;
  }
  
  const groupName = document.getElementById('groupName').value;
  const groupUrl = document.getElementById('groupUrl').value;
  
  try {
    const response = await fetch(`${API_BASE}/api/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: groupName,
        url: groupUrl,
        governorate_id: governorateId
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showToast('تم إضافة المجموعة بنجاح', 'success');
      addGroupForm.reset();
      loadGroups(governorateId);
    } else {
      throw new Error(data.error || 'Failed to add group');
    }
  } catch (error) {
    showToast('خطأ في إضافة المجموعة: ' + error.message, 'error');
  }
});

// Discover groups button click
discoverGroupsBtn.addEventListener('click', async () => {
  const governorateId = governorateSelect.value;
  
  if (!governorateId) {
    showToast('يرجى اختيار المحافظة أولاً', 'error');
    return;
  }

  // Check Facebook connection
  await checkFacebookStatus();
  
  if (!fbStatus.classList.contains('connected')) {
    openModal('loginModal');
    return;
  }

  const loading = document.getElementById('discoverLoading');
  loading.classList.add('active');
  discoverGroupsBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/groups/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ governorate_id: governorateId })
    });

    const data = await response.json();
    
    if (response.ok) {
      showToast(`تم اكتشاف ${data.groups.length} مجموعة`, 'success');
      loadGroups(governorateId);
    } else {
      throw new Error(data.error || 'Failed to discover groups');
    }
  } catch (error) {
    showToast('خطأ في اكتشاف المجموعات: ' + error.message, 'error');
  } finally {
    loading.classList.remove('active');
    discoverGroupsBtn.disabled = false;
  }
});

// Load groups for governorate
async function loadGroups(governorateId) {
  try {
    const response = await fetch(`${API_BASE}/api/groups/${governorateId}`);
    const groups = await response.json();
    
    if (groups.length === 0) {
      groupsList.innerHTML = `
        <div class="empty-state">
          <span>👥</span>
          <p>لا توجد مجموعات بعد</p>
        </div>
      `;
      return;
    }

    groupsList.innerHTML = groups.map(group => `
      <div class="group-item">
        <div>
          <h4>${escapeHtml(group.name)}</h4>
          <p>${escapeHtml(group.url)}</p>
        </div>
        <div class="group-actions">
          <label class="group-toggle">
            <input type="checkbox" ${group.is_active ? 'checked' : ''} onchange="toggleGroup(${group.id})">
            <span class="toggle-slider"></span>
          </label>
          <button class="btn btn-danger btn-sm" onclick="deleteGroup(${group.id}, '${escapeHtml(group.name)}')">
            🗑️
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    showToast('خطأ في تحميل المجموعات', 'error');
  }
}

// Toggle group active status
async function toggleGroup(groupId) {
  try {
    await fetch(`${API_BASE}/api/groups/${groupId}/toggle`, {
      method: 'PATCH'
    });
  } catch (error) {
    showToast('خطأ في تغيير حالة المجموعة', 'error');
    loadGroups(governorateSelect.value);
  }
}

// Delete group
async function deleteGroup(groupId, groupName) {
  if (!confirm(`هل أنت متأكد من حذف المجموعة "${groupName}"؟`)) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/groups/${groupId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      showToast('تم حذف المجموعة بنجاح', 'success');
      loadGroups(governorateSelect.value);
    } else {
      throw new Error('Failed to delete group');
    }
  } catch (error) {
    showToast('خطأ في حذف المجموعة', 'error');
  }
}

// Load groups when governorate changes
governorateSelect.addEventListener('change', (e) => {
  const governorateId = e.target.value;
  if (governorateId) {
    loadGroups(governorateId);
  } else {
    groupsList.innerHTML = `
      <div class="empty-state">
        <span>👥</span>
        <p>لا توجد مجموعات بعد</p>
      </div>
    `;
  }
});

// Open post modal
function openPostModal(adId) {
  selectedAd = adId;
  
  // Reset progress display
  document.getElementById('progressContainer').style.display = 'none';
  document.getElementById('postLog').innerHTML = '';
  document.getElementById('delayInfo').style.display = 'none';
  document.getElementById('delaySettings').style.display = 'block';
  
  // Find ad details
  fetch(`${API_BASE}/api/ads/${adId}`)
    .then(res => res.json())
    .then(ad => {
      if (ad) {
        document.getElementById('postAdDetails').innerHTML = `
          <div style="background: #f8f9fa; padding: 15px; border-radius: 10px;">
            <h4>${escapeHtml(ad.title)}</h4>
            <p style="margin: 10px 0; color: #666;">${escapeHtml(ad.description.substring(0, 150))}...</p>
            <p><strong>المحافظة:</strong> ${ad.governorate_name}</p>
          </div>
        `;
        openModal('postModal');
      }
    });
}

// Confirm post button click
confirmPostBtn.addEventListener('click', async () => {
  if (!selectedAd) return;

  const loading = document.getElementById('postLoading');
  const delaySettings = document.getElementById('delaySettings');
  const delaySeconds = parseInt(delaySecondsInput.value) || 60;
  
  loading.classList.add('active');
  delaySettings.style.display = 'none';
  confirmPostBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/ads/${selectedAd}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delaySeconds: delaySeconds })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to start posting');
    }
    
    showToast('بدأ النشر - يمكنك متابعة التقدم', 'success');
    
  } catch (error) {
    showToast('خطأ في بدء النشر: ' + error.message, 'error');
    loading.classList.remove('active');
    confirmPostBtn.disabled = false;
    delaySettings.style.display = 'block';
  }
});

// Facebook login button click
fbLoginBtn.addEventListener('click', async () => {
  const loading = document.getElementById('loginLoading');
  loading.classList.add('active');
  fbLoginBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/facebook/login`, {
      method: 'POST'
    });

    const data = await response.json();
    
    if (response.ok) {
      showToast('تم الاتصال بفيسبوك بنجاح', 'success');
      closeModal('loginModal');
      checkFacebookStatus();
    } else {
      throw new Error(data.error || 'Failed to login');
    }
  } catch (error) {
    showToast('خطأ في الاتصال بفيسبوك: ' + error.message, 'error');
  } finally {
    loading.classList.remove('active');
    fbLoginBtn.disabled = false;
  }
});

// Modal functions
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Close modal on outside click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
});

// Toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper function
function getStatusText(status) {
  const statusTexts = {
    pending: '⏳ قيد الانتظار',
    posted: '✅ تم النشر',
    failed: '❌ فشل'
  };
  return statusTexts[status] || status;
}
