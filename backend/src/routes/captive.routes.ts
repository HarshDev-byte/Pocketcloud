import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

// Apple iOS/macOS captive portal detection
router.get('/hotspot-detect.html', (req: Request, res: Response) => {
  const ua = req.headers['user-agent'] ?? '';
  
  if (ua.includes('CaptiveNetworkSupport')) {
    // This is the OS checking — return success to open the browser
    logger.debug('Captive portal check from Apple device');
    return res.status(200).send('<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>');
  }
  
  // Browser opened the captive page — redirect to app
  logger.info('Captive portal redirect to PocketCloud');
  res.redirect('http://192.168.4.1');
});

// Apple variants
router.get('/library/test/success.html', (req: Request, res: Response) => {
  logger.debug('Apple captive portal check (library/test)');
  res.status(200).send('Success');
});

// Android (AOSP) — must return EXACTLY 204 No Content
router.get('/generate_204', (req: Request, res: Response) => {
  logger.debug('Android captive portal check (generate_204)');
  res.status(204).end();
});

// Android connectivity check domains (intercepted by dnsmasq)
router.get('/connectivitycheck.gstatic.com/generate_204', (req: Request, res: Response) => {
  logger.info('Android connectivity check redirect');
  res.redirect('http://192.168.4.1');
});

// Windows NCSI (Network Connectivity Status Indicator)
router.get('/ncsi.txt', (req: Request, res: Response) => {
  logger.debug('Windows NCSI check');
  res.type('text/plain').send('Microsoft NCSI');
});

router.get('/redirect', (req: Request, res: Response) => {
  logger.info('Windows captive portal redirect');
  res.redirect('http://192.168.4.1');
});

router.get('/connecttest.txt', (req: Request, res: Response) => {
  logger.debug('Windows connect test');
  res.type('text/plain').send('Microsoft Connect Test');
});

// Firefox connectivity check
router.get('/canonical.html', (req: Request, res: Response) => {
  logger.info('Firefox captive portal redirect');
  res.redirect('http://192.168.4.1');
});

// Ubuntu/Gnome NetworkManager
router.get('/nm-check.txt', (req: Request, res: Response) => {
  logger.debug('NetworkManager check');
  res.type('text/plain').send('NetworkManager is online\n');
});

// Catch-all: if request host is a known captive portal detection domain,
// redirect to app instead of 404
router.use((req: Request, res: Response, next) => {
  const captiveHosts = [
    'captive.apple.com',
    'www.apple.com',
    'connectivitycheck.gstatic.com',
    'connectivitycheck.android.com',
    'www.msftconnecttest.com',
    'www.msftncsi.com',
    'detectportal.firefox.com',
    'nmcheck.gnome.org',
    'network-test.debian.org'
  ];
  
  const host = req.hostname ?? '';
  
  if (captiveHosts.some(h => host.includes(h))) {
    logger.info('Captive portal domain detected, redirecting', { host });
    return res.redirect('http://192.168.4.1');
  }
  
  next();
});

export default router;
