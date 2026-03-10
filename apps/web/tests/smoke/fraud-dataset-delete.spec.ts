import path from 'path';
import { expect, test } from '@playwright/test';

test('fraud dataset deletion removes active dataset artifacts and writes an audit event', async ({ page, request }) => {
  test.setTimeout(120000);
  const samplePath = path.resolve(__dirname, '../../public/fraud-sample.csv');

  await page.goto('/data-upload');
  await page.locator('input[type="file"]').first().setInputFiles(samplePath);

  await expect.poll(async () => {
    const workspace = await request.get('/api/fraud/workspace');
    const json = await workspace.json();
    return json.workspace.datasets?.length ?? 0;
  }, { timeout: 30000 }).toBeGreaterThan(0);

  const workspaceBefore = await request.get('/api/fraud/workspace');
  const beforeJson = await workspaceBefore.json();
  const dataset = beforeJson.workspace.datasets.find((item: { name: string }) => item.name.includes('fraud-sample.csv'));
  expect(dataset).toBeTruthy();
  const targetDataset = beforeJson.workspace.datasets.find((item: { id: string }) => item.id === beforeJson.workspace.activeDatasetId) ?? dataset;
  const activate = await request.put(`/api/fraud/datasets/${targetDataset.id}`, {
    data: { datasetId: targetDataset.id, active: true },
  });
  expect(activate.status()).toBe(200);

  const notFound = await request.delete('/api/fraud/datasets/dataset_missing_smoke');
  expect(notFound.status()).toBe(404);

  const activeDeleteBlocked = await request.delete(`/api/fraud/datasets/${targetDataset.id}`);
  expect(activeDeleteBlocked.status()).toBe(409);
  await expect(activeDeleteBlocked.json()).resolves.toMatchObject({
    code: 'ACTIVE_DATASET_DELETE_REQUIRES_CONFIRMATION',
  });

  const datasetCard = page.locator('div.rounded-xl').filter({ hasText: `${targetDataset.id}` }).first();
  await expect(datasetCard).toBeVisible();
  await datasetCard.getByRole('button', { name: 'Delete dataset' }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();

  await expect(page.getByText(new RegExp(`Deleted ${targetDataset.name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}`, 'i'))).toBeVisible({ timeout: 30000 });
  await expect(page.locator('div.rounded-xl').filter({ hasText: `${targetDataset.id}` })).toHaveCount(0);

  const workspaceAfter = await request.get('/api/fraud/workspace');
  const afterJson = await workspaceAfter.json();
  expect(afterJson.workspace.datasets.some((item: { id: string }) => item.id === targetDataset.id)).toBeFalsy();
  expect(afterJson.workspace.runs.some((item: { datasetId: string }) => item.datasetId === targetDataset.id)).toBeFalsy();
  expect(afterJson.workspace.cases.some((item: { datasetId: string }) => item.datasetId === targetDataset.id)).toBeFalsy();
  expect(afterJson.workspace.reports.some((item: { datasetId: string }) => item.datasetId === targetDataset.id)).toBeFalsy();
  expect(afterJson.workspace.auditEvents.some((item: { action: string; details?: { dataset_id?: string } }) => item.action === 'dataset_deleted' && item.details?.dataset_id === targetDataset.id)).toBeTruthy();
});
