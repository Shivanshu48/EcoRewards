// rewards.js
(async function () {
  // helper
  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
  function showNotification(msg, type='info') {
    const n = document.createElement('div'); n.className='popup-notification '+type; n.textContent = msg;
    document.body.appendChild(n); setTimeout(()=>n.classList.add('visible'),50);
    setTimeout(()=>{ n.classList.remove('visible'); setTimeout(()=>n.remove(),300); }, 3000);
  }

  // get logged in email
  const email = localStorage.getItem('loggedInUser');
  if (!email) {
    // redirect or message
    qs('.container').innerHTML = '<div style="padding:40px;text-align:center;">Please login to view Rewards.</div>';
    return;
  }

  // DOM refs
  const pointsEl = qs('#your-points');
  const rewardsList = qs('#rewards-list');
  const historyList = qs('#rewards-history');
  const tierLabel = qs('#tier-label');
  const leftTier = qs('#left-tier');
  const rightTier = qs('#right-tier');
  const progressFill = qs('.progress-fill');
  const nextRewardText = qs('#next-reward-text');

  // fetch user
  async function fetchUser() {
    const res = await fetch(`http://localhost:5000/get-user?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load user');
    return data.user;
  }

  // fetch rewards
  async function fetchRewards() {
    const res = await fetch('http://localhost:5000/rewards');
    return res.json();
  }

  // fetch history
  async function fetchHistory() {
    const res = await fetch(`http://localhost:5000/rewards-history?email=${encodeURIComponent(email)}`);
    return res.json();
  }

  // render rewards
  function renderRewards(list, userPoints) {
    rewardsList.innerHTML = '';
    list.forEach(r => {
      const card = document.createElement('div'); card.className = 'reward-card';
      card.innerHTML = `
        <h4>${r.title}</h4>
        <p>${r.description || ''}</p>
        <div class="reward-meta">
          <div>${r.cost} pts</div>
          <div>
            <button class="btn btn-primary redeem-btn" data-id="${r.id}" ${userPoints < r.cost ? 'disabled' : ''}>Redeem</button>
          </div>
        </div>
      `;
      rewardsList.appendChild(card);
    });
  }

  // render history
  function renderHistory(list) {
    historyList.innerHTML = '';
    if (!list.length) { historyList.innerHTML = '<div style="padding:12px;color:#666">No redemptions yet</div>'; return; }
    list.forEach(h => {
      const div = document.createElement('div'); div.className='history-item';
      div.innerHTML = `<div>${new Date(h.created_at).toLocaleString()} — ${h.title}</div><div>${h.cost} pts • ${h.status}</div>`;
      historyList.appendChild(div);
    });
  }

  // redeem handler
  rewardsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.redeem-btn');
    if (!btn) return;
    const rewardId = btn.getAttribute('data-id');
    if (!confirm('Redeem this reward?')) return;

    try {
      btn.disabled = true; btn.textContent = 'Processing...';
      const res = await fetch('http://localhost:5000/redeem', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email, rewardId: Number(rewardId) })
      });
      const data = await res.json();
      if (!data.success) {
        showNotification(data.message || 'Redeem failed', 'error');
        btn.disabled = false; btn.textContent = 'Redeem';
        return;
      }
      showNotification('Redeemed! Check your email for confirmation', 'success');
      // update UI: points and history
      const user = await fetchUser();
      pointsEl.textContent = user.points || 0;
      await reloadAll();
    } catch (err) {
      console.error(err);
      showNotification('Server error', 'error');
      btn.disabled = false; btn.textContent = 'Redeem';
    }
  });

  // tier progress update (basic three-tier system)
  function updateTierBar(points) {
    const base = 100;        // new-user baseline if you want
    const SILVER_MAX = 200;
    const GOLD_MAX = 500;

    let currentTier = 'Silver', next = 'Gold', percent = 0;
    if (points < SILVER_MAX) {
      currentTier = 'Silver'; next='Gold';
      percent = ((points - base) / (SILVER_MAX - base)) * 100;
    } else if (points < GOLD_MAX) {
      currentTier = 'Gold'; next='Platinum';
      percent = ((points - SILVER_MAX) / (GOLD_MAX - SILVER_MAX)) * 100;
    } else {
      currentTier = 'Platinum'; next='Max'; percent=100;
    }
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    leftTier.textContent = currentTier; rightTier.textContent = next;
    tierLabel.textContent = `${currentTier} → ${next}`;
    progressFill.style.width = percent + '%';

    // next reward text
    if (currentTier === 'Silver') {
      nextRewardText.textContent = `${Math.max(0, 200 - points)} points to reach Gold`;
    } else if (currentTier === 'Gold') {
      nextRewardText.textContent = `${Math.max(0, 500 - points)} points to reach Platinum`;
    } else {
      nextRewardText.textContent = `You've reached Platinum — great!`;
    }
  }

  // reload everything
  async function reloadAll() {
    try {
      const [user, rewards, history] = await Promise.all([fetchUser(), fetchRewards(), fetchHistory()]);
      pointsEl.textContent = user.points || 0;
      renderRewards(rewards, user.points || 0);
      renderHistory(history);
      updateTierBar(user.points || 0);
    } catch (err) {
      console.error('Reload error', err);
      document.querySelector('.container').innerHTML = '<div style="padding:20px;color:#c00">Failed to load rewards. Try refreshing.</div>';
    }
  }
document.getElementById("logoutBtn").onclick = () => {
  localStorage.removeItem("loggedInUser");
  window.location.href = "index.html";
};


  // initial load
  reloadAll();
})();
