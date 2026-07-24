import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'wzjames3@gmail.com')
  await page.fill('input[type="password"]', '22090100114')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/dashboard')
})

test.describe('创建向导', () => {
  test('AI 模式：空话题不能下一步', async ({ page }) => {
    await page.goto('/create')
    const nextBtn = page.locator('button:has-text("下一步")')
    await expect(nextBtn).toBeDisabled()
  })

  test('脚本模式：字数不足不能解析', async ({ page }) => {
    await page.goto('/create')
    await page.click('button:has-text("脚本直传")')
    await page.fill('textarea', '太短了')
    const parseBtn = page.locator('button:has-text("解析预览")')
    await expect(parseBtn).toBeDisabled()
  })
})
