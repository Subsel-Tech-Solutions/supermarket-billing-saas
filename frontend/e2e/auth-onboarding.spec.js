const { test, expect } = require("@playwright/test");
const { createMockState, installMockApi, signIn, fieldControl } = require("./helpers/mockBackend");

test.describe("Auth, Onboarding & Account Flows", () => {
  test("closed signups require a valid invite code before unlocking registration", async ({ page }) => {
    const state = createMockState({
      platform: { allowSignup: false, signupInviteCode: "INVITE2026", trialDays: 14 },
    });
    await installMockApi(page, state);

    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Signups are closed" })).toBeVisible();
    await expect(page.getByPlaceholder("Enter invite code")).toBeVisible();

    // First unlock with wrong invite code — form opens locally, backend rejects on submit
    await page.getByPlaceholder("Enter invite code").fill("WRONG-CODE");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Create your store" })).toBeVisible();
    await page.getByPlaceholder("e.g. Metro Supermarket").fill("Invite Only Mart");
    await page.getByPlaceholder("Owner name").fill("Ramesh");
    await page.getByPlaceholder("+91 …").fill("9876543219");
    await page.getByPlaceholder("you@store.com").fill("ramesh@invitemart.com");
    await page.getByPlaceholder("Min 6 characters").fill("secret123");
    await page.getByPlaceholder("Repeat password").fill("secret123");
    await page.getByRole("button", { name: "Create store" }).click();

    await expect(page.getByText("Invalid invite code")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);

    // Reload, enter valid invite code, and complete signup
    await page.goto("/signup");
    await page.getByPlaceholder("Enter invite code").fill("INVITE2026");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByPlaceholder("e.g. Metro Supermarket").fill("Invite Only Mart");
    await page.getByPlaceholder("Owner name").fill("Ramesh");
    await page.getByPlaceholder("+91 …").fill("9876543219");
    await page.getByPlaceholder("you@store.com").fill("ramesh@invitemart.com");
    await page.getByPlaceholder("Min 6 characters").fill("secret123");
    await page.getByPlaceholder("Repeat password").fill("secret123");
    await page.getByRole("button", { name: "Create store" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.locator("aside").getByText("Invite Only Mart")).toBeVisible();

    // Reload preserves authenticated session
    await page.reload();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("open public signup validates password rules and creates a new tenant store", async ({ page }) => {
    const state = createMockState({
      platform: { allowSignup: true, trialDays: 21 },
    });
    await installMockApi(page, state);

    await page.goto("/login");
    const createLink = page.getByRole("link", { name: /Start your 21-day free trial/i });
    await expect(createLink).toBeVisible();
    await createLink.click();
    await expect(page).toHaveURL(/\/signup$/);

    await page.getByPlaceholder("e.g. Metro Supermarket").fill("Green Valley Grocers");
    await page.getByPlaceholder("Owner name").fill("Suresh");
    await page.getByPlaceholder("you@store.com").fill("suresh@greenvalley.com");
    await page.getByPlaceholder("Min 6 characters").fill("pass1234");
    await page.getByPlaceholder("Repeat password").fill("different");
    await page.getByRole("button", { name: "Create store" }).click();
    await expect(page.getByText("Passwords do not match")).toBeVisible();

    await page.getByPlaceholder("Repeat password").fill("pass1234");
    await page.getByRole("button", { name: "Create store" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await page.locator("nav").getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("forgot password and reset password flows handle missing token and valid reset", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);

    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);

    await page.getByPlaceholder("you@yourstore.com").fill("owner@freshmart.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Check your inbox")).toBeVisible();

    // Missing token guard on /reset-password
    await page.goto("/reset-password");
    await expect(page.getByText(/This reset link is missing or invalid/i)).toBeVisible();

    // Valid token reset flow
    await page.goto("/reset-password?token=valid-reset-token");
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    await page.locator("#new-password").fill("newpass123");
    await page.locator("#confirm-password").fill("mismatch1");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Passwords do not match.")).toBeVisible();

    await page.locator("#confirm-password").fill("newpass123");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

    await page.getByRole("button", { name: "Go to sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("password visibility toggle, sign out, and my account password change work end-to-end", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);

    await page.goto("/login");
    const pwInput = page.locator('input[autocomplete="current-password"]');
    await expect(pwInput).toHaveAttribute("type", "password");
    await page.locator('input[autocomplete="current-password"] + button').click();
    await expect(pwInput).toHaveAttribute("type", "text");

    await signIn(page, "owner@freshmart.com", "owner-password");
    await expect(page).toHaveURL(/\/dashboard$/);

    // Go to Settings -> My Account -> update profile & change password
    await page.locator("nav").getByRole("link", { name: "Settings" }).click();
    await page.getByRole("tab", { name: "My Account" }).click();

    await fieldControl(page, "Name").fill("Owner Updated");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile updated")).toBeVisible();

    await fieldControl(page, "Current password").fill("owner-password");
    await fieldControl(page, "New password").fill("fresh-pass-99");
    await fieldControl(page, "Confirm new password").fill("fresh-pass-99");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByText("Password changed")).toBeVisible();

    // Sign out
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Old password rejected, new password succeeds
    await signIn(page, "owner@freshmart.com", "owner-password");
    await expect(page.getByText("Invalid email or password")).toBeVisible();

    await signIn(page, "owner@freshmart.com", "fresh-pass-99");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
