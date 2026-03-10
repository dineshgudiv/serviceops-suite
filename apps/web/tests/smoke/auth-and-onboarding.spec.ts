import { expect, test, type Page } from '@playwright/test';

const seededEmail = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@demo.local';
const seededPassword = process.env.SMOKE_ADMIN_PASSWORD ?? 'Admin123!demo';
const mailpitBaseUrl = process.env.MAILPIT_BASE_URL ?? 'http://127.0.0.1:8025';

async function signIn(page: Page, email = seededEmail, password = seededPassword) {
  await signInTo(page, email, password, /\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

async function signInTo(page: Page, email: string, password: string, destination: RegExp) {
  await page.goto('/login');
  await page.getByPlaceholder('user@company.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(destination, { timeout: 60_000, waitUntil: 'commit' });
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login(\?.*)?$/);
}

async function currentOrgId(page: Page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/session/me', { cache: 'no-store' });
    const json = await res.json();
    return json.user.orgId as string;
  });
}

async function inviteUser(page: Page, email: string, role: string, displayName: string) {
  const body = await page.evaluate(
    async ({ orgId, email, displayName, role }) => {
      const res = await fetch('/api/bff/auth/register-invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgId, email, displayName, role }),
      });
      return { status: res.status, body: await res.json() };
    },
    {
      orgId: await currentOrgId(page),
      email,
      displayName,
      role,
    }
  );
  expect(body.status).toBe(200);
  const token =
    body.body.dev_link
      ? new URL(body.body.dev_link).searchParams.get('token')
      : new URL(await waitForMailpitLink(email, '/accept-invite?token=')).searchParams.get('token');
  expect(token).toBeTruthy();
  return token!;
}

async function waitForMailpitLink(email: string, pathFragment: string) {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const search = await fetch(`${mailpitBaseUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    if (search.ok) {
      const payload = (await search.json()) as { messages?: Array<{ ID: string }> };
      const latest = payload.messages?.[0]?.ID;
      if (latest) {
        const message = await fetch(`${mailpitBaseUrl}/api/v1/message/${latest}`);
        if (message.ok) {
          const data = (await message.json()) as { Text?: string; HTML?: string };
          const content = `${data.Text ?? ''}\n${data.HTML ?? ''}`;
          const match = content.match(new RegExp(`http://127\\.0\\.0\\.1:8080${pathFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s"'<]+`));
          if (match) {
            return match[0];
          }
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${pathFragment} mail for ${email}`);
}

test('signed-out protected route redirects to login', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('signup page clearly enforces invite-only onboarding', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Account creation is invite-only' })).toBeVisible();
  await expect(page.getByText(/administrator must create your account and send an invite/i)).toBeVisible();
});

test('anonymous route handler request returns auth required', async ({ request }) => {
  const res = await request.get('/api/bff/auth/orgs');
  expect(res.status()).toBe(401);
  await expect(res.json()).resolves.toMatchObject({
    error: { code: 'AUTH_REQUIRED' },
  });
});

test('login succeeds and dashboard loads without false demo fallback', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Fallback to DEMO')).toHaveCount(0);
});

test('logout clears session and protected routes redirect back to login', async ({ page }) => {
  await signIn(page);
  await signOut(page);
  await page.goto('/dashboard');
  await page.waitForURL(/\/login\?next=%2Fdashboard/);
});

test('analyst cannot access admin routes or admin-only auth endpoints', async ({ page }) => {
  const analystEmail = `analyst-${Date.now()}@example.com`;
  const analystPassword = 'AnalystPass123!';

  await signIn(page);

  const invite = await page.request.post('/api/bff/auth/register-invite', {
    data: {
      orgId: await page.evaluate(async () => {
        const res = await fetch('/api/session/me', { cache: 'no-store' });
        const json = await res.json();
        return json.user.orgId;
      }),
      email: analystEmail,
      displayName: 'Smoke Analyst',
      role: 'ANALYST',
    },
  });

  expect(invite.status()).toBe(200);
  const inviteBody = await invite.json();
  const inviteUrl = new URL(inviteBody.dev_link ?? (await waitForMailpitLink(analystEmail, '/accept-invite?token=')));
  const token = inviteUrl.searchParams.get('token');
  expect(token).toBeTruthy();

  await signOut(page);

  await page.goto(`/accept-invite?token=${encodeURIComponent(token!)}`);
  await page.getByPlaceholder('Your name').fill('Smoke Analyst');
  await page.getByPlaceholder('Create a password').fill(analystPassword);
  await page.getByPlaceholder('Confirm your password').fill(analystPassword);
  await page.getByRole('button', { name: 'Activate account' }).click();
  await page.waitForURL(/\/login$/);

  await signIn(page, analystEmail, analystPassword);
  await page.goto('/admin');
  await page.waitForURL(/\/forbidden$/);
  await expect(page.getByRole('heading', { name: 'Forbidden' })).toBeVisible();

  const forbidden = await page.request.post('/api/bff/auth/register-invite', {
    data: {
      orgId: await page.evaluate(async () => {
        const res = await fetch('/api/session/me', { cache: 'no-store' });
        const json = await res.json();
        return json.user.orgId;
      }),
      email: `blocked-${Date.now()}@example.com`,
      role: 'READONLY',
    },
  });
  expect(forbidden.status()).toBe(403);
  await expect(forbidden.json()).resolves.toMatchObject({
    error: { code: 'FORBIDDEN_ROLE' },
  });
});

test('audit log loads with session org scope and does not throw missing orgKey', async ({ page }) => {
  await signIn(page);
  await page.goto('/audit-log');
  await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();
  await expect(page.getByText(/Missing required request parameter 'orgKey'/i)).toHaveCount(0);
  await expect(page.getByText('Audit Log failed')).toHaveCount(0);
});

test('getting-started renders for signed-in user', async ({ page }) => {
  await signIn(page);
  await page.goto('/getting-started');
  await expect(page.getByRole('heading', { name: 'Add your data' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add Services' })).toBeVisible();
});

test('invalid invite token screen is controlled', async ({ page }) => {
  await page.goto('/accept-invite?token=invalid');
  await page.getByPlaceholder('Your name').fill('Invited User');
  await page.getByPlaceholder('Create a password').fill('InvalidPass123!');
  await page.getByPlaceholder('Confirm your password').fill('InvalidPass123!');
  await page.getByRole('button', { name: 'Activate account' }).click();
  await expect(page.getByText(/Invite acceptance failed|expired|invalid/i)).toBeVisible();
});

test('forgot password uses non-enumerating success copy', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByPlaceholder('user@company.com').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('If an account exists for that email, reset instructions have been sent.')).toBeVisible();
});

test('forgot password delivery reaches Mailpit with a reset link', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByPlaceholder('user@company.com').fill(seededEmail);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('If an account exists for that email, reset instructions have been sent.')).toBeVisible();
  const resetLink = await waitForMailpitLink(seededEmail, '/reset-password?token=');
  expect(resetLink).toContain('/reset-password?token=');
});

test('invalid reset token screen is controlled', async ({ page }) => {
  await page.goto('/reset-password?token=invalid');
  await page.getByPlaceholder('Create a strong password').fill('ResetPass123!');
  await page.getByPlaceholder('Confirm your password').fill('ResetPass123!');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText(/failed|invalid|expired/i)).toBeVisible();
});

test('valid reset token updates password and allows sign-in', async ({ page }) => {
  const initialPassword = `InvitePass!${Date.now()}Aa`;
  const nextPassword = `ResetPass!${Date.now()}Bb`;
  const email = `reset-user-${Date.now()}@example.com`;

  await signIn(page);

  const invite = await page.request.post('/api/bff/auth/register-invite', {
    data: {
      orgId: await page.evaluate(async () => {
        const res = await fetch('/api/session/me', { cache: 'no-store' });
        const json = await res.json();
        return json.user.orgId;
      }),
      email,
      displayName: 'Reset User',
      role: 'ANALYST',
    },
  });
  expect(invite.status()).toBe(200);
  const inviteBody = await invite.json();
  const inviteToken = new URL(inviteBody.dev_link ?? (await waitForMailpitLink(email, '/accept-invite?token='))).searchParams.get('token');
  expect(inviteToken).toBeTruthy();

  await signOut(page);
  await page.goto(`/accept-invite?token=${encodeURIComponent(inviteToken!)}`);
  await page.getByPlaceholder('Your name').fill('Reset User');
  await page.getByPlaceholder('Create a password').fill(initialPassword);
  await page.getByPlaceholder('Confirm your password').fill(initialPassword);
  await page.getByRole('button', { name: 'Activate account' }).click();
  await page.waitForURL(/\/login$/);

  await page.goto('/forgot-password');
  await page.getByPlaceholder('user@company.com').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const resetLink = await waitForMailpitLink(email, '/reset-password?token=');
  const token = new URL(resetLink).searchParams.get('token');
  expect(token).toBeTruthy();

  await page.goto(`/reset-password?token=${encodeURIComponent(token!)}`);
  await page.getByPlaceholder('Create a strong password').fill(nextPassword);
  await page.getByPlaceholder('Confirm your password').fill(nextPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await page.waitForURL(/\/login$/);

  await signIn(page, email, nextPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('invalid verify-email token screen is controlled', async ({ page }) => {
  await page.goto('/verify-email?token=invalid');
  await expect(page.getByText(/Verification failed|expired|already used/i)).toBeVisible();
});

test('theme studio persists preset and accessibility settings', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Open Theme Studio' }).click();
  await page.getByRole('button', { name: 'Slate Neutral executive dark' }).click();
  await page.getByRole('button', { name: 'Light' }).click();
  await page.getByText('High contrast').locator('..').getByRole('checkbox').check();
  await page.getByText('Reduce motion').locator('..').getByRole('checkbox').check();

  await expect
    .poll(async () =>
      page.evaluate(() => ({
        preset: document.documentElement.dataset.soTheme,
        mode: document.documentElement.dataset.soMode,
        highContrast: document.documentElement.dataset.soHighContrast,
        reducedMotion: document.documentElement.dataset.soReducedMotion,
        stored: window.localStorage.getItem('ui.theme.studio'),
      }))
    )
    .toMatchObject({
      preset: 'slate',
      mode: 'light',
      highContrast: 'true',
      reducedMotion: 'true',
    });

  await page.reload();
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        preset: document.documentElement.dataset.soTheme,
        mode: document.documentElement.dataset.soMode,
        highContrast: document.documentElement.dataset.soHighContrast,
        reducedMotion: document.documentElement.dataset.soReducedMotion,
      }))
    )
    .toMatchObject({
      preset: 'slate',
      mode: 'light',
      highContrast: 'true',
      reducedMotion: 'true',
    });
});

test('global create submits an incident and it appears in the incidents list', async ({ page }) => {
  const title = `Smoke incident ${Date.now()}`;
  await signIn(page);
  await page.getByRole('button', { name: 'Create work item' }).click();
  await page.getByRole('menuitem', { name: /New Incident/i }).click();
  await page.waitForURL(/\/incidents\/new$/);
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Description').fill('Synthetic smoke incident created through the global create entry point.');
  await page.getByLabel('Requester').fill('smoke-requester@example.com');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(/\/incidents\?created=INC-/, { timeout: 60_000, waitUntil: 'commit' });
  await expect(page.getByText(/persisted and is now part of the real incidents queue/i)).toBeVisible();
  await page.getByPlaceholder(/Search id\/title\/service\/assignee\/tags/i).fill(title);
  await expect(page.getByText(title)).toBeVisible();
});

test('requester portal submits a service request and admin console sees the same record', async ({ page }) => {
  const email = `requester-${Date.now()}@example.com`;
  const password = `RequesterPass!${Date.now()}Aa`;
  const subject = `Portal service request ${Date.now()}`;

  await signIn(page);
  const token = await inviteUser(page, email, 'REQUESTER', 'Smoke Requester');
  await signOut(page);

  await page.goto(`/accept-invite?token=${encodeURIComponent(token)}`);
  await page.getByPlaceholder('Your name').fill('Smoke Requester');
  await page.getByPlaceholder('Create a password').fill(password);
  await page.getByPlaceholder('Confirm your password').fill(password);
  await page.getByRole('button', { name: 'Activate account' }).click();
  await page.waitForURL(/\/login$/);

  await signInTo(page, email, password, /\/portal$/);
  await expect(page.getByRole('heading', { name: /support for requesters/i })).toBeVisible();
  await page.goto('/dashboard');
  await page.waitForURL(/\/forbidden$/);

  await page.goto('/portal/knowledge');
  await expect(page.getByRole('heading', { name: /browse knowledge|results for/i })).toBeVisible();

  await page.goto('/portal/request-service');
  await page.getByLabel('Subject *').fill(subject);
  await page.getByLabel('Description *').fill('Requester needs finance analytics access with a real persisted service request through the portal.');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText(/submitted successfully/i)).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/portal\/requests\/service-request\/\d+\?created=SR-/);
  await expect(page.getByText(/submitted successfully/i)).toBeVisible();

  await page.goto('/portal/my-requests');
  await expect(page.getByText(subject)).toBeVisible();

  await signOut(page);
  await signIn(page);
  await page.goto('/catalog');
  await expect(page.getByText(subject)).toBeVisible();
});

test('requester portal incident appears in the internal incidents queue', async ({ page }) => {
  const email = `requester-incident-${Date.now()}@example.com`;
  const password = `RequesterIncident!${Date.now()}Bb`;
  const title = `Portal incident ${Date.now()}`;

  await signIn(page);
  const token = await inviteUser(page, email, 'REQUESTER', 'Incident Requester');
  await signOut(page);

  await page.goto(`/accept-invite?token=${encodeURIComponent(token)}`);
  await page.getByPlaceholder('Your name').fill('Incident Requester');
  await page.getByPlaceholder('Create a password').fill(password);
  await page.getByPlaceholder('Confirm your password').fill(password);
  await page.getByRole('button', { name: 'Activate account' }).click();
  await page.waitForURL(/\/login$/);

  await signInTo(page, email, password, /\/portal$/);
  await page.goto('/portal/report-issue');
  await page.getByLabel('Title *').fill(title);
  await page.getByLabel('Description *').fill('Requester can no longer use the travel approval flow because the application is returning an error.');
  await page.getByRole('button', { name: 'Submit incident' }).click();
  await expect(page.getByText(/submitted successfully/i)).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/portal\/requests\/incident\/\d+\?created=INC-/);
  await expect(page.getByText(/submitted successfully/i)).toBeVisible();

  await signOut(page);
  await signIn(page);
  await page.goto('/incidents');
  await page.getByPlaceholder(/Search id\/title\/service\/assignee\/tags/i).fill(title);
  await expect(page.getByText(title)).toBeVisible();
});
