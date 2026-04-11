/* auth.js — Auth state management, login/logout/session, header UI */
'use strict';

(function () {
  const supabase = window.db.client;

  // ─── State ─────────────────────────────────────────────────────
  let currentUser = null;
  let hasCompletedGame = false;
  let localGamesSynced = false;

  // ─── Public API ────────────────────────────────────────────────
  window.getCurrentUser = () => currentUser;

  // ─── Avatar colour palette ─────────────────────────────────────
  const AVATAR_COLOURS = [
    '#e05a2b', '#c0392b', '#8e44ad', '#2980b9',
    '#16a085', '#27ae60', '#d35400', '#2c3e50',
  ];

  function avatarColour(name) {
    if (!name) return AVATAR_COLOURS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
  }

  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // ─── Header slot ───────────────────────────────────────────────
  function renderLoggedOut() {
    const slot = document.getElementById('auth-header-slot');
    if (!slot) return;
    slot.innerHTML = `<button id="auth-sign-in-btn" class="btn btn-auth-pill" aria-label="Sign in">Sign in</button>`;
    document.getElementById('auth-sign-in-btn').addEventListener('click', openAuthModal);
  }

  function renderLoggedIn(user) {
    const slot = document.getElementById('auth-header-slot');
    if (!slot) return;
    const name = user.user_metadata?.display_name || user.email || '';
    const truncated = name.length > 12 ? name.slice(0, 12) + '…' : name;
    const colour = avatarColour(name);
    const inits = initials(name);

    slot.innerHTML = `
      <div id="auth-avatar" aria-label="User menu" role="button" tabindex="0">
        <div class="avatar-circle" style="background:${colour}">${inits}</div>
        <span class="avatar-name">${truncated}</span>
        <div class="auth-dropdown" id="auth-dropdown" hidden>
          <button class="auth-dropdown-item" id="stats-open-btn">My Stats</button>
          <button class="auth-dropdown-item auth-dropdown-item--danger" id="sign-out-btn">Sign out</button>
        </div>
      </div>`;

    const avatar = document.getElementById('auth-avatar');
    const dropdown = document.getElementById('auth-dropdown');

    function toggleDropdown(e) {
      e.stopPropagation();
      dropdown.hidden = !dropdown.hidden;
    }

    avatar.addEventListener('click', toggleDropdown);
    avatar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDropdown(e); }
    });

    document.getElementById('stats-open-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.hidden = true;
      if (typeof window.openStatsModal === 'function') window.openStatsModal();
    });

    document.getElementById('sign-out-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      signOut();
    });

    document.addEventListener('click', () => { dropdown.hidden = true; }, { capture: false });
  }

  function showNotificationDot() {
    const btn = document.getElementById('auth-sign-in-btn');
    if (btn) btn.classList.add('has-notification');
  }

  // ─── Auth modal ────────────────────────────────────────────────
  function openAuthModal(initialTab) {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.hidden = false;
    setAuthTab(initialTab || 'signin');
    clearAuthErrors();
  }

  function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.hidden = true;
    clearAuthErrors();
  }

  window.openAuthModal = openAuthModal;

  function setAuthTab(tab) {
    const signinTab = document.getElementById('auth-tab-signin');
    const signupTab = document.getElementById('auth-tab-signup');
    const signinForm = document.getElementById('auth-form-signin');
    const signupForm = document.getElementById('auth-form-signup');
    if (!signinTab) return;

    if (tab === 'signin') {
      signinTab.classList.add('active');
      signupTab.classList.remove('active');
      signinForm.hidden = false;
      signupForm.hidden = true;
    } else {
      signupTab.classList.add('active');
      signinTab.classList.remove('active');
      signupForm.hidden = false;
      signinForm.hidden = true;
    }
  }

  function clearAuthErrors() {
    document.querySelectorAll('.auth-error').forEach(el => { el.textContent = ''; el.hidden = true; });
  }

  function showAuthError(id, msg) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.hidden = false; }
  }

  function setAuthLoading(form, loading) {
    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Please wait…' : btn.dataset.label;
    }
  }

  // ─── Sign in ───────────────────────────────────────────────────
  async function handleSignIn(e) {
    e.preventDefault();
    clearAuthErrors();
    const form = e.target;
    const email = form.querySelector('#signin-email').value.trim();
    const password = form.querySelector('#signin-password').value;

    if (!email) { showAuthError('signin-error', 'Please enter your email.'); return; }
    if (!password) { showAuthError('signin-error', 'Please enter your password.'); return; }

    setAuthLoading(form, true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(form, false);

    if (error) {
      showAuthError('signin-error', error.message);
    } else {
      closeAuthModal();
    }
  }

  // ─── Sign up ───────────────────────────────────────────────────
  async function handleSignUp(e) {
    e.preventDefault();
    clearAuthErrors();
    const form = e.target;
    const email = form.querySelector('#signup-email').value.trim();
    const password = form.querySelector('#signup-password').value;
    const displayName = form.querySelector('#signup-name').value.trim();

    if (!displayName) { showAuthError('signup-error', 'Please enter a display name.'); return; }
    if (!email) { showAuthError('signup-error', 'Please enter your email.'); return; }
    if (password.length < 6) { showAuthError('signup-error', 'Password must be at least 6 characters.'); return; }

    setAuthLoading(form, true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: displayName } },
    });
    setAuthLoading(form, false);

    if (error) {
      showAuthError('signup-error', error.message);
    } else {
      showAuthError('signup-error', '');
      const confirmEl = document.getElementById('signup-confirm-msg');
      if (confirmEl) confirmEl.hidden = false;
      form.hidden = true;
    }
  }

  // ─── Forgot password ───────────────────────────────────────────
  async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('signin-email').value.trim();
    if (!email) { showAuthError('signin-error', 'Enter your email above first.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      showAuthError('signin-error', error.message);
    } else {
      showAuthError('signin-error', '');
      const el = document.getElementById('signin-reset-msg');
      if (el) { el.hidden = false; }
    }
  }

  // ─── Sign out ──────────────────────────────────────────────────
  async function signOut() {
    await supabase.auth.signOut();
  }

  // ─── Auth state change ─────────────────────────────────────────
  supabase.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;

    if (currentUser) {
      renderLoggedIn(currentUser);

      // Sync local games once per session
      if (!localGamesSynced) {
        localGamesSynced = true;
        await window.db.syncLocalGames(currentUser.id);
        // Sync local achievements
        if (typeof window.syncLocalAchievements === 'function') {
          await window.syncLocalAchievements(currentUser.id);
        }
      }
    } else {
      localGamesSynced = false;
      renderLoggedOut();
    }
  });

  // ─── Listen for game:end — nudge guests, save for signed-in ────
  document.addEventListener('game:end', async (e) => {
    hasCompletedGame = true;
    if (!currentUser) {
      showNotificationDot();
      return;
    }
    await window.db.saveGame(currentUser.id, e.detail);
  });

  // ─── Wire up modal forms after DOM ready ───────────────────────
  function wireModal() {
    const signinForm = document.getElementById('auth-form-signin');
    const signupForm = document.getElementById('auth-form-signup');
    const tabSignin = document.getElementById('auth-tab-signin');
    const tabSignup = document.getElementById('auth-tab-signup');
    const forgotLink = document.getElementById('auth-forgot-link');
    const closeBtn = document.getElementById('auth-modal-close');
    const backdrop = document.getElementById('auth-modal');

    if (signinForm) signinForm.addEventListener('submit', handleSignIn);
    if (signupForm) signupForm.addEventListener('submit', handleSignUp);
    if (tabSignin) tabSignin.addEventListener('click', () => { clearAuthErrors(); setAuthTab('signin'); });
    if (tabSignup) tabSignup.addEventListener('click', () => { clearAuthErrors(); setAuthTab('signup'); });
    if (forgotLink) forgotLink.addEventListener('click', handleForgotPassword);
    if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeAuthModal();
      });
    }

    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('auth-modal');
        if (modal && !modal.hidden) closeAuthModal();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireModal);
  } else {
    wireModal();
  }
})();
