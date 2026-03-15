/**
 * Captive Landing Page
 * Fast-loading page shown when devices first connect via captive portal
 * Optimized for < 500ms load time with no external dependencies
 */

import React, { useEffect, useState } from 'react';

export function CaptiveLandingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          // Quick auth check
          const response = await fetch('/api/auth/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.ok) {
            setIsAuthenticated(true);
            // Redirect to main app if already authenticated
            window.location.href = 'http://192.168.4.1';
            return;
          }
        }
      } catch (error) {
        // Continue to show landing page
      }
      
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.spinner}></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>☁️</div>
          <h1 style={styles.title}>Redirecting to PocketCloud...</h1>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Inline SVG logo for fast loading */}
        <svg 
          width="80" 
          height="80" 
          viewBox="0 0 100 100" 
          style={styles.svgLogo}
        >
          <circle cx="50" cy="40" r="25" fill="#667eea" opacity="0.8"/>
          <circle cx="35" cy="55" r="15" fill="#764ba2" opacity="0.6"/>
          <circle cx="65" cy="55" r="15" fill="#764ba2" opacity="0.6"/>
          <circle cx="50" cy="70" r="10" fill="#667eea" opacity="0.4"/>
        </svg>
        
        <h1 style={styles.title}>Welcome to PocketCloud Drive</h1>
        <p style={styles.subtitle}>Your personal cloud storage</p>
        
        <a 
          href="http://192.168.4.1" 
          style={styles.button}
          onMouseOver={(e) => {
            e.currentTarget.style.background = styles.buttonHover.background;
            e.currentTarget.style.transform = styles.buttonHover.transform;
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = styles.button.background;
            e.currentTarget.style.transform = 'none';
          }}
        >
          Open PocketCloud →
        </a>
        
        <div style={styles.features}>
          <div style={styles.feature}>📁 File Storage</div>
          <div style={styles.feature}>🔄 Sync Anywhere</div>
          <div style={styles.feature}>🔒 Private & Secure</div>
        </div>
      </div>
    </div>
  );
}

// Inline styles for fast loading (no external CSS dependencies)
const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0,
    padding: '20px',
    boxSizing: 'border-box' as const
  },
  card: {
    background: 'rgba(255, 255, 255, 0.95)',
    borderRadius: '20px',
    padding: '40px',
    textAlign: 'center' as const,
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
    backdropFilter: 'blur(10px)'
  },
  svgLogo: {
    marginBottom: '20px'
  },
  logo: {
    fontSize: '64px',
    marginBottom: '20px'
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold' as const,
    color: '#333',
    margin: '0 0 10px 0'
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 30px 0'
  },
  button: {
    display: 'inline-block',
    padding: '16px 32px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    textDecoration: 'none',
    borderRadius: '12px',
    fontWeight: 'bold' as const,
    fontSize: '18px',
    transition: 'all 0.3s ease',
    border: 'none',
    cursor: 'pointer'
  },
  buttonHover: {
    background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
    transform: 'translateY(-2px)'
  },
  features: {
    display: 'flex',
    justifyContent: 'space-around',
    marginTop: '30px',
    flexWrap: 'wrap' as const,
    gap: '10px'
  },
  feature: {
    fontSize: '14px',
    color: '#666',
    padding: '8px 12px',
    background: '#f5f5f5',
    borderRadius: '20px',
    whiteSpace: 'nowrap' as const
  },
  spinner: {
    border: '4px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '50%',
    borderTop: '4px solid white',
    width: '40px',
    height: '40px',
    animation: 'spin 1s linear infinite',
    margin: '0 auto'
  }
};