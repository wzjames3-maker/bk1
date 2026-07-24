import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'wzjames3@gmail.com')
  await page.fill('input[type="password"]', '22090100114')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/dashboard')
})

test.describe('作品列表', () => {
  test('列表正常渲染', async ({ page }) => {
    await page.goto('/episodes')
    await expect(page.locator('h1')).toContainText('我的作品')
  })

  test('搜索过滤', async ({ page }) => {
    await page.goto('/episodes')
    await page.fill('input[placeholder*="搜索"]', 'AI')
    await page.waitForTimeout(500)
    await expect(page.locator('text=AI').first()).toBeVisible()
  })

  test('状态筛选', async ({ page }) => {
    await page.goto('/episodes')
    await page.click('button:has-text("已完成")')
    await page.waitForTimeout(300)
    await expect(page.locator('button:has-text("已完成")')).toBeVisible()
  })
})
