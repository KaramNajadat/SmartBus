import React, { createContext, useContext, useState, useEffect } from 'react';
import baseTheme, { lightThemeColors, darkThemeColors } from '../styles/theme';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  // Check local storage for saved preference, default to dark
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    const savedTheme = localStorage.getItem('app-theme');
    return savedTheme ? savedTheme === 'dark' : true;
  });

  const toggleTheme = () => {
    setIsDarkTheme(prev => !prev);
  };

  useEffect(() => {
    localStorage.setItem('app-theme', isDarkTheme ? 'dark' : 'light');
    if(isDarkTheme) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }, [isDarkTheme]);

  // Dynamically constructed theme object injected into Context
  const theme = {
    ...baseTheme,
    colors: isDarkTheme ? darkThemeColors : lightThemeColors,
    isDarkTheme,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};
