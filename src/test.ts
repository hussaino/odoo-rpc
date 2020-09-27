import { OdooRPC } from '.';

const rpc = new OdooRPC(
  'http://host:port',
  'db_name',
  'login_user',
  'password',
);

(async () => {
  await rpc.list({
    model: 'res.users',
    resolveFields: ['company_id'],
  });
})();
