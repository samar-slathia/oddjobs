const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 }, // Mobile viewport
  });
  const page = await context.newPage();

  console.log('--- STARTING UX SIMPLIFICATION TEST ---');

  try {
    console.log('1. Verifying Registration Page');
    await page.goto('http://localhost:5173/register');

    // Ensure fields are empty by default
    const nameValue = await page.inputValue('input[name="name"]');
    const emailValue = await page.inputValue('input[name="email"]');
    const passwordValue = await page.inputValue('input[name="password"]');
    
    assert.strictEqual(nameValue, '', 'Name should be empty by default');
    assert.strictEqual(emailValue, '', 'Email should be empty by default');
    assert.strictEqual(passwordValue, '', 'Password should be empty by default');
    console.log(' - Fields are empty by default');

    // Ensure Phone and Location do NOT exist
    const phoneCount = await page.locator('input[name="phone"]').count();
    const locationCount = await page.locator('input[name="location"]').count();
    assert.strictEqual(phoneCount, 0, 'Phone field should be removed');
    assert.strictEqual(locationCount, 0, 'Location field should be removed');
    console.log(' - Phone and Location fields successfully removed');

    // Ensure Admin is NOT an option
    const textContent = await page.content();
    assert(!textContent.includes('Admin'), 'Admin should not appear on registration');
    console.log(' - No admin option on registration');

    // Test Show Password toggle
    const passwordInput = page.locator('input[name="password"]');
    assert.strictEqual(await passwordInput.getAttribute('type'), 'password', 'Password is hidden by default');
    await page.click('button:has(.lucide-eye)'); // Click show
    assert.strictEqual(await passwordInput.getAttribute('type'), 'text', 'Password shown after click');
    console.log(' - Show/hide password toggle works on Registration');

    // Create a new customer
    const testEmail = `newcustomer_${Date.now()}@test.com`;
    await page.fill('input[name="name"]', 'New Mobile Customer');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('text=Hire Local Services'); // Ensure role is customer
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('http://localhost:5173/customer');
    console.log(' - Customer Registration successful');

    console.log('2. Verifying Customer Dashboard Empty State');
    
    // Check for empty state elements
    const emptyStateHeader = page.locator('h3:has-text("No Requests Found")');
    await emptyStateHeader.waitFor({ state: 'visible' });

    const browseBtn = page.locator('button:has-text("Browse Local Services")');
    await browseBtn.waitFor({ state: 'visible' });
    console.log(' - Empty state shows "Browse Local Services" CTA');

    await browseBtn.click();
    await page.waitForURL('http://localhost:5173/services');
    console.log(' - CTA successfully redirects to /services page');

    console.log('3. Verifying Login Page');
    
    await context.clearCookies();
    await page.goto('http://localhost:5173/login');

    await page.goto('http://localhost:5173/login');

    // Verify Admin demo login does not exist
    const adminBtnCount = await page.locator('button:has-text("Admin")').count();
    assert.strictEqual(adminBtnCount, 0, 'Admin demo button should be removed');
    console.log(' - No admin option on login');

    // Test Show Password toggle on Login
    const loginPasswordInput = page.locator('input[type="password"]');
    assert.strictEqual(await loginPasswordInput.count(), 1, 'Password input exists');
    await page.click('button:has(.lucide-eye)'); // Click show
    const loginTextInput = page.locator('input[type="text"]');
    assert.strictEqual(await loginTextInput.count(), 1, 'Password field changed to text');
    console.log(' - Show/hide password toggle works on Login');

    console.log('ALL UX SIMPLIFICATION TESTS PASSED (Including Mobile Viewport)');

  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
