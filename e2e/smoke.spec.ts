import { expect, test } from "@playwright/test";

test("the front page is the Intervention Manager sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  await expect(page.getByText("Intervention Manager")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("signed-out visitors to /manage are sent to login with a return path", async ({ page }) => {
  await page.goto("/manage/admin/registry");
  await expect(page).toHaveURL(/\/\?next=%2Fmanage%2Fadmin%2Fregistry$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("signed-out visitors to /dashboard are sent to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/\?next=%2Fdashboard$/);
});

test("public form route does not require login", async ({ page }) => {
  // Without a reachable database the page cannot load the form, but it must never send the visitor to login.
  await page.goto("/f/HENT-M-001-REG");
  await expect(page).toHaveURL(/\/f\/HENT-M-001-REG$/);
});
