import React from 'react';

var ProfileContext = React.createContext(null);

function useProfile() {
  return React.useContext(ProfileContext);
}

function ThemeProvider(props) {
  var profile = props.profile;
  var children = props.children;

  var activeTheme = (profile && profile.active_theme) ? profile.active_theme : 'night-blue';
  var themeClass = 'theme-' + activeTheme;

  return (
    <ProfileContext.Provider value={profile}>
      <div className={themeClass} style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
        {children}
      </div>
    </ProfileContext.Provider>
  );
}

export { ThemeProvider, useProfile, ProfileContext };
export default ThemeProvider;
