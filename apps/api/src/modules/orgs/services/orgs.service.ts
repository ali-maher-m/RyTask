import { Injectable } from '@nestjs/common';
import type { Organization } from '@rytask/contracts';
import { GetOrgProvider } from '../providers/get-org.provider';

/**
 * Orgs application service — the controller's entry point (mirrors M1's service→provider
 * shape). US1 exposes the current-org read; US8 adds settings update / delete / transfer.
 */
@Injectable()
export class OrgsService {
  constructor(private readonly getOrg: GetOrgProvider) {}

  current(): Promise<Organization> {
    return this.getOrg.current();
  }
}
