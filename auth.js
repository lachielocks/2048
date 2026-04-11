/* auth.js — Auth state management, login/logout/session, header UI */
'use strict';

(function () {
  const supabase = window.db.client;

  // ─── State ─────────────────────────────────────────────────────
  let currentUser = null;
  let hasCompletedGame = false;
  let localGamesSynced = false;
  let pendingVerifyEmail = null; // email awaiting OTP confirmation

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
          ${isAdmin ? `<a class="auth-dropdown-item" href="/admin.html">Admin Panel</a>` : ''}
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
    suppressSignInToast = true;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) suppressSignInToast = false;
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
      pendingVerifyEmail = email;
      form.hidden = true;
      const block = document.getElementById('signup-confirm-block');
      if (block) {
        block.hidden = false;
        block.querySelector('#signup-otp')?.focus();
      }
    }
  }

  // ─── OTP verification ──────────────────────────────────────────
  async function handleOtpVerify(e) {
    e.preventDefault();
    clearAuthErrors();
    const token = document.getElementById('signup-otp')?.value.trim();

    if (!token || token.length !== 6) {
      showAuthError('otp-error', 'Enter the 6-digit code from your email.');
      return;
    }
    if (!pendingVerifyEmail) {
      showAuthError('otp-error', 'Session expired — please sign up again.');
      return;
    }

    const form = e.target;
    setAuthLoading(form, true);
    suppressSignInToast = true;
    const { error } = await supabase.auth.verifyOtp({
      email: pendingVerifyEmail,
      token,
      type: 'signup',
    });
    setAuthLoading(form, false);

    if (error) {
      suppressSignInToast = false;
      showAuthError('otp-error', error.message);
    } else {
      pendingVerifyEmail = null;
      closeAuthModal();
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

  // ─── Reset password modal ──────────────────────────────────────
  function openResetModal() {
    const modal = document.getElementById('reset-password-modal');
    if (modal) modal.hidden = false;
    document.getElementById('reset-new-password')?.focus();
  }

  function closeResetModal() {
    const modal = document.getElementById('reset-password-modal');
    if (modal) modal.hidden = true;
    const form = document.getElementById('reset-password-form');
    if (form) form.reset();
    document.querySelectorAll('#reset-error').forEach(el => { el.textContent = ''; el.hidden = true; });
  }

  async function handleSetNewPassword(e) {
    e.preventDefault();
    const form = e.target;
    const pw = document.getElementById('reset-new-password').value;
    const pw2 = document.getElementById('reset-confirm-password').value;

    if (pw.length < 6) { showAuthError('reset-error', 'Password must be at least 6 characters.'); return; }
    if (pw !== pw2)    { showAuthError('reset-error', 'Passwords don\'t match.'); return; }

    setAuthLoading(form, true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setAuthLoading(form, false);

    if (error) {
      showAuthError('reset-error', error.message);
    }
    // success handled by USER_UPDATED event
  }

  // ─── Auth info toast ───────────────────────────────────────────
  function showAuthToast(msg, type = 'success') {
    const container = document.getElementById('auth-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `auth-toast auth-toast--${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('auth-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('auth-toast--visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3500);
  }

  // ─── Admin check ───────────────────────────────────────────────
  let isAdmin = false;

  async function checkAdmin(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();
    isAdmin = data?.is_admin || false;
  }

  // ─── Auth state change ─────────────────────────────────────────
  // Track whether a sign-in was triggered by our own forms (suppress toast for those)
  let suppressSignInToast = false;

  supabase.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;

    if (event === 'PASSWORD_RECOVERY') {
      // User clicked a password reset link — show the set-new-password form
      renderLoggedIn(currentUser);
      openResetModal();
      cleanUrl();
      return;
    }

    if (event === 'SIGNED_IN') {
      await checkAdmin(currentUser.id);
      renderLoggedIn(currentUser);
      if (!suppressSignInToast) {
        // Came from an email link or magic link redirect
        showAuthToast('You\'re signed in — welcome back!');
        cleanUrl();
      }
      suppressSignInToast = false;

      if (!localGamesSynced) {
        localGamesSynced = true;
        await window.db.syncLocalGames(currentUser.id);
        if (typeof window.syncLocalAchievements === 'function') {
          await window.syncLocalAchievements(currentUser.id);
        }
      }
      return;
    }

    if (event === 'USER_UPDATED') {
      // Password successfully changed
      closeResetModal();
      showAuthToast('Password updated successfully!');
      cleanUrl();
      return;
    }

    if (event === 'SIGNED_OUT' || !currentUser) {
      localGamesSynced = false;
      renderLoggedOut();
      return;
    }

    // INITIAL_SESSION with an existing session
    if (currentUser) {
      await checkAdmin(currentUser.id);
      renderLoggedIn(currentUser);
      if (!localGamesSynced) {
        localGamesSynced = true;
        await window.db.syncLocalGames(currentUser.id);
        if (typeof window.syncLocalAchievements === 'function') {
          await window.syncLocalAchievements(currentUser.id);
        }
      }
    }
  });

  function cleanUrl() {
    if (window.location.hash || window.location.search.includes('code=')) {
      history.replaceState(null, '', window.location.pathname);
    }
  }

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
  function resetSignupFlow() {
    const form = document.getElementById('auth-form-signup');
    const block = document.getElementById('signup-confirm-block');
    const otpInput = document.getElementById('signup-otp');
    if (form) form.hidden = false;
    if (block) block.hidden = true;
    if (otpInput) otpInput.value = '';
    pendingVerifyEmail = null;
  }

  function wireModal() {
    const signinForm = document.getElementById('auth-form-signin');
    const signupForm = document.getElementById('auth-form-signup');
    const otpForm = document.getElementById('auth-form-otp');
    const tabSignin = document.getElementById('auth-tab-signin');
    const tabSignup = document.getElementById('auth-tab-signup');
    const forgotLink = document.getElementById('auth-forgot-link');
    const closeBtn = document.getElementById('auth-modal-close');
    const backdrop = document.getElementById('auth-modal');

    if (signinForm) signinForm.addEventListener('submit', handleSignIn);
    if (signupForm) signupForm.addEventListener('submit', handleSignUp);
    if (otpForm) otpForm.addEventListener('submit', handleOtpVerify);
    if (tabSignin) tabSignin.addEventListener('click', () => { clearAuthErrors(); resetSignupFlow(); setAuthTab('signin'); });
    if (tabSignup) tabSignup.addEventListener('click', () => { clearAuthErrors(); setAuthTab('signup'); });
    if (forgotLink) forgotLink.addEventListener('click', handleForgotPassword);
    if (closeBtn) closeBtn.addEventListener('click', () => { resetSignupFlow(); closeAuthModal(); });
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) { resetSignupFlow(); closeAuthModal(); }
      });
    }

    // Reset password form
    const resetForm = document.getElementById('reset-password-form');
    if (resetForm) resetForm.addEventListener('submit', handleSetNewPassword);

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const authModal = document.getElementById('auth-modal');
        if (authModal && !authModal.hidden) { resetSignupFlow(); closeAuthModal(); }
        const resetModal = document.getElementById('reset-password-modal');
        if (resetModal && !resetModal.hidden) closeResetModal();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireModal);
  } else {
    wireModal();
  }
})();
