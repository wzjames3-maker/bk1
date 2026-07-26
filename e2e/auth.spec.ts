import { test, expect } from '@playwright/test'

test.describe('认证', () => {
  test('登录成功跳转 Dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'wzjames3@gmail.com')
    await page.fill('input[type="password"]', '22090100114')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('h1')).toContainText('你好')
  })

  test('未登录访问 /episodes 重定向到 /login', async ({ page }) => {
    await page.goto('/episodes')
    await expect(page).toHaveURL(/\/login/)
  })
})
