import { Injectable } from '@nestjs/common';
import type { ListGithubConnectionsResponse } from '@rytask/contracts';
import { toGithubConnectionDto } from '../domain/github-connection.mapper';
import { GithubConnectionsRepository } from '../repositories/github-connections.repository';

/** The org's repository connections (M5) — revoked rows included so the UI can show history. */
@Injectable()
export class ListGithubConnectionsProvider {
  constructor(private readonly connections: GithubConnectionsRepository) {}

  async list(): Promise<ListGithubConnectionsResponse> {
    const rows = await this.connections.listForOrg();
    return { data: rows.map(toGithubConnectionDto) };
  }
}
