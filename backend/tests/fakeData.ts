/** In-memory stand-in for the Amplify data client, so handlers run without AWS. */
type Row = Record<string, unknown> & { id: string };

export function makeFakeClient(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  let n = 0;
  const table = (name: string): Row[] => (tables[name] ??= [...(seed[name] ?? [])]);
  const model = (name: string) => ({
    get: async ({ id }: { id: string }) => ({ data: table(name).find((r) => r.id === id) ?? null }),
    list: async (input: { filter?: Record<string, { eq: unknown }> } = {}) => ({
      data: table(name).filter((r) => Object.entries(input.filter ?? {}).every(([k, c]) => r[k] === c.eq)),
    }),
    create: async (input: Record<string, unknown>) => {
      const row = { id: `${name}-${++n}`, ...input } as Row;
      table(name).push(row);
      return { data: row };
    },
    update: async (input: Row) => {
      const row = table(name).find((r) => r.id === input.id);
      if (!row) return { data: null, errors: [{}] };
      Object.assign(row, input);
      return { data: row };
    },
    delete: async ({ id }: { id: string }) => {
      tables[name] = table(name).filter((r) => r.id !== id);
      return { data: null };
    },
  });
  const names = ['CareRequest', 'HospitalStatus', 'HospitalProfile', 'Message', 'Activity', 'Referral', 'Transfer', 'Specialist', 'Reservation'];
  return { tables: (name: string) => table(name), client: { models: Object.fromEntries(names.map((m) => [m, model(m)])) } };
}

const STAFF = 'us-east-1_STAFF';
const PUBLIC = 'us-east-1_PUBLIC';
export const POOLS = { STAFF, PUBLIC };

export const patientEvent = (fieldName: string, args: Record<string, unknown>, sub = 'p1') => ({
  info: { fieldName },
  arguments: args,
  identity: { sub, claims: { iss: `https://cognito-idp.us-east-1.amazonaws.com/${PUBLIC}`, 'cognito:groups': ['patients'] } },
});

export const staffEvent = (
  fieldName: string,
  args: Record<string, unknown>,
  claims: { groups: string[]; hospitalId?: string; unit?: string; sub?: string },
) => ({
  info: { fieldName },
  arguments: args,
  identity: {
    sub: claims.sub ?? 's1',
    claims: {
      iss: `https://cognito-idp.us-east-1.amazonaws.com/${STAFF}`,
      'cognito:groups': claims.groups,
      'custom:hospitalId': claims.hospitalId,
      'custom:unit': claims.unit,
    },
  },
});
