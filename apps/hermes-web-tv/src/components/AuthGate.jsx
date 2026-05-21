import React from 'react';
import * as hermesApi from '../api/hermesApi.js';

var PANEL = {
  minHeight: '100vh',
  background: 'radial-gradient(ellipse at top, #1a2030 0%, #0d1117 60%, #08090d 100%)',
  color: '#e6edf3',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
};

var CARD = {
  width: 'min(560px, 100%)',
  background: '#161b22',
  border: '1px solid #30363d',
  borderRadius: '8px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.42)',
  padding: '1.5rem',
};

var INPUT = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#0d1117',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: '6px',
  padding: '0.75rem',
  fontSize: '1rem',
  outline: 'none',
};

var BUTTON = {
  background: 'linear-gradient(135deg, #1f6feb, #6366f1)',
  color: '#ffffff',
  border: '1px solid #1f6feb',
  borderRadius: '6px',
  padding: '0.75rem 1rem',
  fontWeight: 800,
  cursor: 'pointer',
};

var SECONDARY = {
  background: '#0d1117',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: '6px',
  padding: '0.65rem 0.9rem',
  fontWeight: 700,
  cursor: 'pointer',
};

function field(label, value, setValue, type, autoComplete) {
  return (
    <label style={{ display: 'block', marginBottom: '0.85rem' }}>
      <span style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', fontWeight: 700, marginBottom: '0.35rem' }}>{label}</span>
      <input
        value={value}
        type={type || 'text'}
        autoComplete={autoComplete || 'off'}
        onChange={function(e) { setValue(e.target.value); }}
        style={INPUT}
      />
    </label>
  );
}

function brandHeader(title, subtitle) {
  return (
    <div style={{ marginBottom: '1.2rem' }}>
      <div style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Dave<span style={{ color: '#1f6feb' }}>TV</span>
      </div>
      <h1 style={{ margin: '0.55rem 0 0.25rem', fontSize: '1.7rem' }}>{title}</h1>
      {subtitle ? <p style={{ margin: 0, color: '#8b949e', lineHeight: 1.5 }}>{subtitle}</p> : null}
    </div>
  );
}

function authErrorBox(message) {
  if (!message) { return null; }
  return (
    <div role="alert" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.45)', color: '#ffb4ae', padding: '0.7rem', borderRadius: '6px', marginBottom: '1rem' }}>
      {message}
    </div>
  );
}

function getQuery() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search || '');
}

function cleanUrl() {
  if (typeof window === 'undefined' || !window.history) return;
  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
}

function LoadingAuth() {
  return (
    <div style={PANEL}>
      <div style={CARD}>
        {brandHeader('Checking access', 'One moment.')}
      </div>
    </div>
  );
}

function LocalAdminDisabledView(props) {
  var onExit = props.onExit;
  return (
    <div style={PANEL}>
      <div style={CARD}>
        {brandHeader('Admin panel', 'Local development is running with DaveTV login disabled.')}
        <div style={{ background: 'rgba(227,179,65,0.12)', border: '1px solid rgba(227,179,65,0.45)', color: '#f0d58a', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', lineHeight: 1.45 }}>
          Family account management requires the API auth gate and an active Dave admin session. Keep local no-login mode for fast UI work, or enable auth locally when testing account creation.
        </div>
        <button type="button" style={SECONDARY} onClick={onExit}>Open DaveTV</button>
      </div>
    </div>
  );
}

function LoginView(props) {
  var auth = props.auth || {};
  var onAuthed = props.onAuthed;
  var adminMode = props.adminMode;
  var emailState = React.useState('');
  var email = emailState[0];
  var setEmail = emailState[1];
  var passState = React.useState('');
  var password = passState[0];
  var setPassword = passState[1];
  var messageState = React.useState('');
  var message = messageState[0];
  var setMessage = messageState[1];
  var busyState = React.useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var resetState = React.useState(false);
  var resetMode = resetState[0];
  var setResetMode = resetState[1];
  var resetInfoState = React.useState('');
  var resetInfo = resetInfoState[0];
  var setResetInfo = resetInfoState[1];
  var resetUrlState = React.useState('');
  var resetUrl = resetUrlState[0];
  var setResetUrl = resetUrlState[1];

  function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    hermesApi.login(email, password).then(function(body) {
      setBusy(false);
      if (onAuthed) { onAuthed(body.user); }
    }).catch(function(err) {
      setBusy(false);
      setMessage(err.message || 'Login failed.');
    });
  }

  function forgot(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setResetInfo('');
    setResetUrl('');
    hermesApi.requestPasswordReset(email).then(function(body) {
      setBusy(false);
      if (body && body.reset_url) {
        setResetInfo('SMTP is not configured yet. Use this reset form on this device.');
        setResetUrl(body.reset_url);
      } else {
        setResetInfo('If that email has an active DaveTV account, a reset link was created.');
      }
    }).catch(function(err) {
      setBusy(false);
      setMessage(err.message || 'Reset failed.');
    });
  }

  var providers = auth.oauth_providers || [];
  return (
    <div style={PANEL}>
      <form onSubmit={resetMode ? forgot : submit} style={CARD}>
        {brandHeader(adminMode ? 'Dave admin login' : 'Family login', auth.configured ? 'Invite-only access for DaveTV.' : 'Owner setup is required before family accounts can be used.')}
        {!auth.configured ? (
          <div style={{ background: 'rgba(227,179,65,0.12)', border: '1px solid rgba(227,179,65,0.45)', color: '#f0d58a', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
            No DaveTV admin account is configured. Set DAVETV_ADMIN_EMAIL on the VPS, then redeploy/restart the API. Dave can use Reset password to create the first password.
          </div>
        ) : null}
        {authErrorBox(message)}
        {resetInfo ? (
          <div style={{ background: 'rgba(31,111,235,0.12)', border: '1px solid rgba(31,111,235,0.45)', color: '#b9d4ff', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', wordBreak: 'break-word' }}>
            <div>{resetInfo}</div>
            {resetUrl ? (
              <a href={resetUrl} style={Object.assign({}, SECONDARY, { display: 'inline-flex', marginTop: '0.75rem', textDecoration: 'none' })}>Open reset form</a>
            ) : null}
          </div>
        ) : null}
        {field('Email', email, setEmail, 'email', 'email')}
        {!resetMode ? field('Password', password, setPassword, 'password', 'current-password') : null}
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={busy || !auth.configured} style={BUTTON}>{busy ? 'Working...' : (resetMode ? 'Send reset link' : 'Sign in')}</button>
          <button type="button" style={SECONDARY} onClick={function() { setResetMode(!resetMode); setMessage(''); setResetInfo(''); setResetUrl(''); }}>
            {resetMode ? 'Back to login' : 'Reset password'}
          </button>
        </div>
        {providers.length > 0 && !resetMode ? (
          <div style={{ borderTop: '1px solid #30363d', marginTop: '1.2rem', paddingTop: '1rem' }}>
            <div style={{ color: '#8b949e', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.6rem' }}>Configured sign-in providers</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {providers.map(function(p) {
                return (
                  <a key={p.id} href={hermesApi.buildApiUrl('/api/auth/oauth/' + encodeURIComponent(p.id) + '/start')} style={SECONDARY}>
                    {p.label}
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}

function RegisterView(props) {
  var token = props.token;
  var onAuthed = props.onAuthed;
  var auth = props.auth || {};
  var p1 = React.useState('');
  var password = p1[0];
  var setPassword = p1[1];
  var p2 = React.useState('');
  var confirm = p2[0];
  var setConfirm = p2[1];
  var errState = React.useState('');
  var err = errState[0];
  var setErr = errState[1];
  var busyState = React.useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var providers = auth.oauth_providers || [];

  function submit(e) {
    e.preventDefault();
    setErr('');
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    hermesApi.registerWithToken(token, password).then(function(body) {
      cleanUrl();
      setBusy(false);
      if (onAuthed) { onAuthed(body.user); }
    }).catch(function(error) {
      setBusy(false);
      setErr(error.message || 'Registration failed.');
    });
  }

  return (
    <div style={PANEL}>
      <form onSubmit={submit} style={CARD}>
        {brandHeader('Create your DaveTV account', 'This invite is limited to the family member Dave selected.')}
        {authErrorBox(err)}
        {field('Password', password, setPassword, 'password', 'new-password')}
        {field('Confirm password', confirm, setConfirm, 'password', 'new-password')}
        <button type="submit" disabled={busy} style={BUTTON}>{busy ? 'Creating...' : 'Create account'}</button>
        {providers.length > 0 ? (
          <div style={{ borderTop: '1px solid #30363d', marginTop: '1.2rem', paddingTop: '1rem' }}>
            <div style={{ color: '#8b949e', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.6rem' }}>Use a configured provider instead</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {providers.map(function(p) {
                return (
                  <a key={p.id} href={hermesApi.buildApiUrl('/api/auth/oauth/' + encodeURIComponent(p.id) + '/start?invite_token=' + encodeURIComponent(token))} style={SECONDARY}>
                    {p.label}
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}

function ResetView(props) {
  var token = props.token;
  var onAuthed = props.onAuthed;
  var doneState = React.useState(false);
  var done = doneState[0];
  var setDone = doneState[1];
  var p1 = React.useState('');
  var password = p1[0];
  var setPassword = p1[1];
  var p2 = React.useState('');
  var confirm = p2[0];
  var setConfirm = p2[1];
  var errState = React.useState('');
  var err = errState[0];
  var setErr = errState[1];

  function submit(e) {
    e.preventDefault();
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    hermesApi.resetPassword(token, password).then(function(body) {
      cleanUrl();
      if (body && body.user && onAuthed) {
        onAuthed(body.user);
        return;
      }
      setDone(true);
    }).catch(function(error) {
      setErr(error.message || 'Password reset failed.');
    });
  }

  return (
    <div style={PANEL}>
      <form onSubmit={submit} style={CARD}>
        {brandHeader(done ? 'Password updated' : 'Reset password', done ? 'DaveTV will keep this device signed in.' : 'Choose a new DaveTV password.')}
        {authErrorBox(err)}
        {done ? <a href="/" style={BUTTON}>Back to login</a> : (
          <React.Fragment>
            {field('New password', password, setPassword, 'password', 'new-password')}
            {field('Confirm password', confirm, setConfirm, 'password', 'new-password')}
            <button type="submit" style={BUTTON}>Save password</button>
          </React.Fragment>
        )}
      </form>
    </div>
  );
}

function AdminPanel(props) {
  var me = props.me || {};
  var onExit = props.onExit;
  var dataState = React.useState({ users: [], invites: [] });
  var data = dataState[0];
  var setData = dataState[1];
  var msgState = React.useState('');
  var msg = msgState[0];
  var setMsg = msgState[1];
  var actionLinkState = React.useState('');
  var actionLink = actionLinkState[0];
  var setActionLink = actionLinkState[1];
  var emailState = React.useState('');
  var email = emailState[0];
  var setEmail = emailState[1];
  var nameState = React.useState('Sherri');
  var displayName = nameState[0];
  var setDisplayName = nameState[1];
  var durationState = React.useState('30');
  var duration = durationState[0];
  var setDuration = durationState[1];
  var passState = React.useState({});
  var passwordById = passState[0];
  var setPasswordById = passState[1];
  var authState = props.auth || {};

  function load() {
    hermesApi.getAdminUsers().then(function(body) {
      setData({ users: body.users || [], invites: body.invites || [] });
    }).catch(function(err) {
      setMsg(err.message || 'Could not load admin data.');
    });
  }

  React.useEffect(function() { load(); }, []);

  function create(e) {
    e.preventDefault();
    setMsg('');
    setActionLink('');
    hermesApi.createUserAccount({
      email: email,
      display_name: displayName,
      duration_days: Number(duration),
      role: displayName === 'Dave' ? 'admin' : 'viewer',
    }).then(function(body) {
      setEmail('');
      if (body.reset_url) {
        setMsg('Account ready. SMTP is not configured yet, so open the reset form for this account.');
        setActionLink(body.reset_url);
      } else {
        setMsg('Account ready and reset link emailed.');
      }
      load();
    }).catch(function(err) {
      setMsg(err.message || 'Account creation failed.');
      setActionLink('');
    });
  }

  function setUserPassword(userId) {
    var nextPass = passwordById[userId] || '';
    setMsg('');
    setActionLink('');
    hermesApi.adminSetPassword(userId, nextPass).then(function() {
      setPasswordById(Object.assign({}, passwordById, { [userId]: '' }));
      setMsg('Password updated.');
      load();
    }).catch(function(err) {
      setMsg(err.message || 'Password update failed.');
    });
  }

  return (
    <div style={PANEL}>
      <div style={Object.assign({}, CARD, { width: 'min(980px, 100%)' })}>
        {brandHeader('Admin panel', 'Signed in as ' + (me.display_name || 'Dave'))}
        {msg ? (
          <div style={{ background: 'rgba(31,111,235,0.12)', border: '1px solid rgba(31,111,235,0.45)', color: '#b9d4ff', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', wordBreak: 'break-word' }}>
            <div>{msg}</div>
            {actionLink ? (
              <a href={actionLink} style={Object.assign({}, SECONDARY, { display: 'inline-flex', marginTop: '0.75rem', textDecoration: 'none' })}>Open reset form</a>
            ) : null}
          </div>
        ) : null}
        <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 180px 160px auto', gap: '0.75rem', alignItems: 'end', marginBottom: '1.2rem' }}>
          {field('Email', email, setEmail, 'email', 'email')}
          <label style={{ display: 'block', marginBottom: '0.85rem' }}>
            <span style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', fontWeight: 700, marginBottom: '0.35rem' }}>Family member</span>
            <select value={displayName} onChange={function(e) { setDisplayName(e.target.value); }} style={INPUT}>
              {(authState.allowed_names || []).map(function(n) { return <option key={n} value={n}>{n}</option>; })}
            </select>
          </label>
          <label style={{ display: 'block', marginBottom: '0.85rem' }}>
            <span style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', fontWeight: 700, marginBottom: '0.35rem' }}>Duration</span>
            <select value={duration} onChange={function(e) { setDuration(e.target.value); }} style={INPUT}>
              <option value="30">1 month</option>
              <option value="90">3 months</option>
              <option value="180">6 months</option>
              <option value="365">1 year</option>
            </select>
          </label>
          <button type="submit" style={BUTTON}>Create account</button>
        </form>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ color: '#8b949e', textAlign: 'left' }}>
                <th style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>User</th>
                <th style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>Email</th>
                <th style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>Role</th>
                <th style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>Last login</th>
                <th style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>Expires</th>
                <th style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>Password</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map(function(u) {
                return (
                  <tr key={u.id}>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>{u.display_name}</td>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>{u.email}</td>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>{u.role}</td>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>{u.last_login_at || 'Never'}</td>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>{u.account_expires_at || 'No limit'}</td>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #30363d' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <input
                          type="password"
                          value={passwordById[u.id] || ''}
                          onChange={function(e) { setPasswordById(Object.assign({}, passwordById, { [u.id]: e.target.value })); }}
                          style={Object.assign({}, INPUT, { minWidth: '150px', padding: '0.45rem' })}
                        />
                        <button type="button" style={SECONDARY} onClick={function() { setUserPassword(u.id); }}>Set</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem' }}>
          <button type="button" style={SECONDARY} onClick={onExit}>Open DaveTV</button>
          <button type="button" style={SECONDARY} onClick={function() { hermesApi.logout().then(function() { window.location.href = '/'; }); }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

function AuthGate(props) {
  var children = props.children;
  var q = getQuery();
  var registerToken = q.get('register_token') || '';
  var resetToken = q.get('reset_token') || '';
  var adminModeInitial = q.get('admin') === '1' || (typeof window !== 'undefined' && window.location.hash === '#admin');
  var loadingState = React.useState(true);
  var loading = loadingState[0];
  var setLoading = loadingState[1];
  var authState = React.useState(null);
  var auth = authState[0];
  var setAuth = authState[1];
  var userState = React.useState(null);
  var user = userState[0];
  var setUser = userState[1];
  var adminState = React.useState(adminModeInitial);
  var adminMode = adminState[0];
  var setAdminMode = adminState[1];

  React.useEffect(function() {
    hermesApi.getAuthMe().then(function(body) {
      setAuth((body && body.auth) || { required: true, configured: false, oauth_providers: [] });
      setUser((body && body.user) || null);
      setLoading(false);
    }).catch(function() {
      setAuth({ required: true, configured: false, oauth_providers: [] });
      setUser(null);
      setLoading(false);
    });
  }, []);

  if (loading) { return <LoadingAuth />; }
  if (registerToken) { return <RegisterView token={registerToken} auth={auth} onAuthed={function(u) { setUser(u); }} />; }
  if (resetToken) { return <ResetView token={resetToken} onAuthed={function(u) { setUser(u); }} />; }
  if (auth && auth.required === false) {
    if (adminMode) {
      return <LocalAdminDisabledView onExit={function() { setAdminMode(false); cleanUrl(); }} />;
    }
    return children;
  }
  if (!user) { return <LoginView auth={auth} adminMode={adminMode} onAuthed={function(u) { setUser(u); }} />; }
  if (adminMode) {
    if (user.role !== 'admin') {
      return <LoginView auth={auth} adminMode onAuthed={function(u) { setUser(u); }} />;
    }
    return <AdminPanel me={user} auth={auth} onExit={function() { setAdminMode(false); cleanUrl(); }} />;
  }
  return children;
}

export default AuthGate;
