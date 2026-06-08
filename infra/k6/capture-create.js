// k6 load script — cross-channel capture latency (T107, US8, FR-CAP-001 / SC-002).
//
// Every capture channel (web, Slack, MCP, API) funnels into the SAME `WorkItemsService.create`
// (one brain everywhere). This script drives that one hot path through its REST surface and FAILS
// the run if server-side create p95 exceeds 300 ms — the budget Slack's 3 s ack and the agent's
// interactive feel both depend on. The Slack/MCP edges add only enqueue + dispatch overhead on top
// of this number, so holding it here holds the whole capture promise.
//
//   Run (against a seeded local stack):
//     BASE_URL=http://localhost:3001 RYTASK_PAT=ryt_pat_xxx PROJECT_ID=<uuid> \
//       k6 run infra/k6/capture-create.js
//
// The PAT needs `work:write`. Use a throwaway project — this creates items.

import { check } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const PAT = __ENV.RYTASK_PAT || '';
const PROJECT_ID = __ENV.PROJECT_ID || '';

export const options = {
  scenarios: {
    capture: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || '30s',
    },
  },
  thresholds: {
    // The contract: server-side create stays ≤300 ms p95 (FR-CAP-001). The run is RED if it slips.
    'http_req_duration{endpoint:create}': ['p(95)<300'],
    'checks{endpoint:create}': ['rate>0.99'],
  },
};

export default function () {
  const res = http.post(
    `${BASE_URL}/api/v1/work-items`,
    JSON.stringify({
      projectId: PROJECT_ID,
      // Exercise the shared quick-add grammar the Slack slash path also uses (`#` stays a label).
      quickAdd: `Load capture ${__VU}-${__ITER} !high #load`,
    }),
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${PAT}`,
      },
      tags: { endpoint: 'create' },
    },
  );

  check(res, { 'created (201)': (r) => r.status === 201 }, { endpoint: 'create' });
}
