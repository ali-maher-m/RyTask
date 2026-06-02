import { Injectable, NotFoundException } from '@nestjs/common';
import type { Organization } from '@rytask/contracts';
import { OrganizationsRepository } from '../repositories/organizations.repository';
import { toOrgDto } from './org.mapper';

/** Read the current org + settings (US1 AC4, FR-TEN-004). Tenant comes from the principal. */
@Injectable()
export class GetOrgProvider {
  constructor(private readonly orgs: OrganizationsRepository) {}

  async current(): Promise<Organization> {
    const row = await this.orgs.current();
    if (!row) {
      throw new NotFoundException('organization not found');
    }
    return toOrgDto(row);
  }
}
