import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { ActivityRepository } from '../repositories/activity.repository';
import { LabelsRepository } from '../repositories/labels.repository';
import { WorkItemsRepository } from '../repositories/work-items.repository';
import { AddLabelProvider } from './add-label.provider';
import { LabelsProvider } from './labels.provider';
import { RemoveLabelProvider } from './remove-label.provider';

/**
 * Integration coverage for the label providers (US2, FR-LBL-001) against REAL PostgreSQL:
 * workspace-label create/list, attach (by id and create-on-capture by name) and detach,
 * each writing a LABEL_ADDED / LABEL_REMOVED activity row. SEED_USER is a project member.
 */
const SEED_ITEM_ID = '0193b3a0-0000-7000-8000-000000000020'; // seeded item, number 1
const MISSING_ITEM = '0193b3a0-0000-7000-8000-0000000000ab';
const MISSING_LABEL = '0193b3a0-0000-7000-8000-0000000000ac';
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

describe('Label providers (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let labelsProvider: LabelsProvider;
  let addLabel: AddLabelProvider;
  let removeLabel: RemoveLabelProvider;
  let activity: ActivityRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    const labels = new LabelsRepository(handle.db, tenant);
    const workItems = new WorkItemsRepository(handle.db, tenant);
    activity = new ActivityRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    labelsProvider = new LabelsProvider(labels, tenant);
    addLabel = new AddLabelProvider(workItems, labels, activity, access, tenant);
    removeLabel = new RemoveLabelProvider(workItems, labels, activity, access, tenant);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('creates and lists a workspace label', async () => {
    const created = await tenant.run(CTX, () =>
      labelsProvider.create({ name: 'bug', color: '#f00' }),
    );
    expect(created).toMatchObject({ name: 'bug', color: '#f00' });
    const all = await tenant.run(CTX, () => labelsProvider.list());
    expect(all.map((l) => l.id)).toContain(created.id);
  });

  it('rejects label list/create with no authenticated principal', async () => {
    await expect(
      tenant.run({ organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID }, () =>
        labelsProvider.list(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches a label by name (create-on-capture) and logs LABEL_ADDED', async () => {
    const before = await tenant.run(CTX, () => activity.listForItem(SEED_ITEM_ID));
    const { labelId } = await tenant.run(CTX, () =>
      addLabel.addLabel(SEED_ITEM_ID, { name: 'urgent' }),
    );
    expect(labelId).toBeTruthy();
    const after = await tenant.run(CTX, () => activity.listForItem(SEED_ITEM_ID));
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)?.action).toBe('LABEL_ADDED');
  });

  it('attaches an existing label by id', async () => {
    const label = await tenant.run(CTX, () => labelsProvider.create({ name: 'backend' }));
    const res = await tenant.run(CTX, () => addLabel.addLabel(SEED_ITEM_ID, { labelId: label.id }));
    expect(res.labelId).toBe(label.id);
  });

  it('rejects add with neither labelId nor name (400)', async () => {
    await expect(tenant.run(CTX, () => addLabel.addLabel(SEED_ITEM_ID, {}))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('404s add with an unknown labelId', async () => {
    await expect(
      tenant.run(CTX, () => addLabel.addLabel(SEED_ITEM_ID, { labelId: MISSING_LABEL })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s add/remove on a missing work item', async () => {
    await expect(
      tenant.run(CTX, () => addLabel.addLabel(MISSING_ITEM, { name: 'x' })),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      tenant.run(CTX, () => removeLabel.removeLabel(MISSING_ITEM, MISSING_LABEL)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('detaches a label and logs LABEL_REMOVED', async () => {
    const label = await tenant.run(CTX, () => labelsProvider.create({ name: 'temp' }));
    await tenant.run(CTX, () => addLabel.addLabel(SEED_ITEM_ID, { labelId: label.id }));
    const before = await tenant.run(CTX, () => activity.listForItem(SEED_ITEM_ID));
    await tenant.run(CTX, () => removeLabel.removeLabel(SEED_ITEM_ID, label.id));
    const after = await tenant.run(CTX, () => activity.listForItem(SEED_ITEM_ID));
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)?.action).toBe('LABEL_REMOVED');
  });
});
