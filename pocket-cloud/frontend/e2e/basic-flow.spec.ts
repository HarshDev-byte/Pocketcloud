import { test, expect } from '@playwright/test';

test.describe('Pocket Cloud Drive E2E', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');
    
    // Should show login page or file browser
    await expect(page).toHaveTitle(/Pocket Cloud/);
  });

  test('should handle file upload flow', async ({ page }) => {
    // This test would require a running backend
    // Skip in CI unless backend is available
    test.skip(!process.env.E2E_BACKEND_URL, 'Backend not available');
    
    await page.goto('/');
    
    // Login if needed
    const loginButton = page.locator('button:has-text("Login")');
    if (await loginButton.isVisible()) {
      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="password"]', 'testpass');
      await loginButton.click();
    }
    
    // Upload a file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Hello, World!')
    });
    
    // Verify file appears in list
    await expect(page.locator('text=test.txt')).toBeVisible();
  });

  test('should handle navigation', async ({ page }) => {
    await page.goto('/');
    
    // Test navigation between pages
    const navLinks = page.locator('nav a');
    const linkCount = await navLinks.count();
    
    for (let i = 0; i < linkCount; i++) {
      const link = navLinks.nth(i);
      const href = await link.getAttribute('href');
      
      if (href && href !== '#') {
        await link.click();
        await page.waitForLoadState('networkidle');
        
        // Should not show error page
        await expect(page.locator('text=Error')).not.toBeVisible();
      }
    }
  });
});