# Promise Based Odoo RPC with TypeScript

## Usage

```
const rpc = new OdooRPC(
  'http://host:port',
  'db_name',
  'login_user',
  'password',
);

const data = await rpc.read({
  model: 'res.users',
  resolveFields: ['company_id'],
});
```

First you create an instance of the RPC with the required parameters.

Then you can either use .then or async/await with all the functions.

Something unique about this package is the resolveFields parameter.

It will get the related data from the foreign table instead of returning the Odoo Tuple of [ id, _rec_name ]

So in the example above, you will get the company_id field as a full object of the corresponding company_id.

The same concept is implemented with writing or creating data.

There are a lot of readymade functions to use, but you can also use the raw() function for unimplemented features.
