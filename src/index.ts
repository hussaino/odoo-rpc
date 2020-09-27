import Axios, { AxiosRequestConfig } from 'axios';

export interface FieldToResolve {
  name: string;
  alias?: string;
  foreignField: string;
}

export interface ReadArguments {
  model: string;
  id: number;
  resolveFields?: string[];
  fields?: string[];
  context?: object;
}

export interface ReadManyArguments {
  model: string;
  ids: number[];
  resolveFields?: string[];
  fields?: string[];
  context?: object;
}

export interface ListArguments {
  model: string;
  offset?: number;
  limit?: number;
  resolveFields?: string[];
  fields?: string[];
  context?: object;
}

export interface SearchArugment {
  model: string;
  domain: any[];
  context?: object;
}

export interface CreateArguments {
  model: string;
  vals: object;
  resolveFields?: FieldToResolve[];
}

export interface SearchWithFieldsArgument extends SearchArugment {
  resolveFields?: string[];
  fields?: string[];
}

export interface CreateArguments {
  model: string;
  vals: object;
  resolveFields?: FieldToResolve[];
}

export interface WriteArguments {
  model: string;
  vals: object;
  ids: number | number[];
  resolveFields?: FieldToResolve[];
}

export interface SearchAndWriteArguments {
  model: string;
  vals: object;
  domain: any[];
  resolveFields?: FieldToResolve[];
  context?: object;
}

export interface UnlinkArguments {
  model: string;
  ids: number | number[];
}

export interface SendNotesArguments {
  db: string;
  model: string;
  recordId: number;
  message: string;
}

export class OdooRPC {
  private loginPromise;
  private uid;
  constructor(
    private url: string,
    private db: string,
    login: string,
    private password: string,
  ) {
    this.loginPromise = Axios.post(`${url}/web/session/authenticate`, {
      jsonrpc: '2.0',
      params: {
        db,
        login,
        password,
      },
    });

    this.loginPromise
      .then((res) => {
        this.uid = res.data.result.uid;
      })
      .catch((err) => {
        throw err;
      });
  }

  async getFieldRelation(model: string, field: string) {
    const parent = await this.searchOne({
      model: 'ir.model',
      domain: [['model', '=', model]],
    });
    const relationshipData = await this.searchOne({
      model: 'ir.model.fields',
      domain: [
        ['model_id', '=', parent.id],
        ['name', '=', field],
      ],
    });
    const relation = {
      model: relationshipData.relation,
      type: relationshipData.ttype,
    };
    return relation;
  }

  async resolveRead(model: string, parentData: any, resolveFields: string[]) {
    const isArray = Array.isArray(parentData);
    const tempParentData = Array.isArray(parentData)
      ? parentData
      : [parentData];
    await Promise.all(
      resolveFields.map(async (rec) => {
        const relationInfo = await this.getFieldRelation(model, rec);
        const relatedIds: number[] = [];
        tempParentData.forEach((parent: any) => {
          const ids =
            relationInfo.type === 'many2many' ? parent[rec] : [parent[rec][0]];
          relatedIds.push(...ids);
        });
        const relatedData = await this.readMany({
          model: relationInfo.model,
          ids: relatedIds,
        });
        const updatedData = tempParentData.map((parent: any) => {
          const ids: number[] =
            relationInfo.type === 'many2many' ? parent[rec] : [parent[rec][0]];
          parent[rec] =
            relationInfo.type === 'many2many'
              ? relatedData.filter((single) => ids.includes(single.id))
              : relatedData.find((single) => ids.includes(single.id));
          return parent;
        });

        return isArray ? updatedData : updatedData[0];
      }),
    );
    return isArray ? tempParentData : tempParentData[0];
  }

  async resolveWrite(
    model: string,
    parentData: any,
    resolveFields: FieldToResolve[],
  ) {
    const tempParentData = { ...parentData };
    await Promise.all(
      resolveFields.map(async (rec) => {
        const relationInfo = await this.getFieldRelation(model, rec.name);
        const domain: any[] = [];
        const key = rec.alias || rec.name;
        const isArray = Array.isArray(tempParentData[key]);
        if (isArray) {
          tempParentData[key].forEach((parent: any) => {
            domain.push('|', [rec.foreignField, '=', parent]);
          });
          domain.splice(domain.length - 2, 1);
        } else {
          domain.push([rec.foreignField, '=', tempParentData[key]]);
        }
        const relatedData = await this.searchMany({
          model: relationInfo.model,
          domain,
        });
        const ids: any[] =
          relationInfo.type === 'many2many'
            ? tempParentData[key]
            : [tempParentData[key]];
        delete tempParentData[key];
        tempParentData[rec.name] =
          relationInfo.type === 'many2many'
            ? relatedData
                .filter((single) => ids.includes(single[rec.foreignField]))
                .map((obj) => obj.id)
            : relatedData.find((single) =>
                ids.includes(single[rec.foreignField]),
              ).id;

        return relatedData;
      }),
    );
    return tempParentData;
  }

  async read({
    model,
    id,
    resolveFields = [],
    fields,
    context,
  }: ReadArguments) {
    const res = await this.raw(model, 'read', [[id]], {
      ...(fields && { fields }),
      ...context,
    });
    if (!res.length) {
      throw `${id} not found on model: ${model}`;
    }
    const data = res[0];
    if (resolveFields.length) {
      return await this.resolveRead(model, data, resolveFields);
    }
    return data;
  }

  async readMany({
    model,
    ids,
    resolveFields = [],
    fields,
    context,
  }: ReadManyArguments) {
    const data = await this.raw(model, 'read', [ids], {
      ...(fields && { fields }),
      ...context,
    });
    if (!data.length) {
      throw `${ids} not found on model: ${model}`;
    }
    if (resolveFields.length) {
      return await this.resolveRead(model, data, resolveFields);
    }
    return data;
  }

  async list({
    model,
    resolveFields,
    offset = 0,
    limit = 100,
    fields,
    context,
  }: ListArguments) {
    const data = await this.searchMany({
      model,
      domain: [],
      resolveFields,
      fields,
      context: {
        offset,
        limit,
        ...context,
      },
    });
    if (!data.length) {
      throw `Nothing found on model: ${model}`;
    }
    return data;
  }

  async searchId({ model, domain, context }: SearchArugment): Promise<number> {
    const data = await this.raw(model, 'search', [domain], context);
    if (data.length) {
      return data[0];
    }
    throw `${domain} not found on model: ${model}`;
  }

  async searchIds({
    model,
    domain,
    context,
  }: SearchArugment): Promise<number[]> {
    const data = await this.raw(model, 'search', [domain], context);
    if (data.length) {
      return data;
    }
    throw `${domain} not found on model: ${model}`;
  }

  async searchMany({
    model,
    domain,
    resolveFields = [],
    fields,
    context,
  }: SearchWithFieldsArgument) {
    const data = await this.raw(model, 'search_read', [domain], {
      ...(fields && { fields }),
      ...context,
    });
    if (!data.length) {
      throw `${domain} not found on model: ${model}`;
    }
    if (resolveFields.length) {
      return await this.resolveRead(model, data, resolveFields);
    }
    return data;
  }

  async searchOne({
    model,
    domain,
    resolveFields = [],
    fields,
    context,
  }: SearchWithFieldsArgument) {
    const res = await this.raw(model, 'search_read', [domain], {
      ...(fields && { fields }),
      ...context,
    });
    if (!res.length) {
      throw `${domain} not found on model: ${model}`;
    }
    const data = res[0];
    if (resolveFields.length) {
      return await this.resolveRead(model, data, resolveFields);
    }
    return data;
  }

  async create({
    model,
    vals,
    resolveFields = [],
  }: CreateArguments): Promise<number> {
    const data = resolveFields.length
      ? await this.resolveWrite(model, vals, resolveFields)
      : vals;
    const id = await this.raw(model, 'create', [data]);
    return data;
  }

  async write({
    model,
    ids,
    vals,
    resolveFields = [],
  }: WriteArguments): Promise<boolean> {
    if (!Array.isArray(ids)) {
      ids = [ids];
    }
    const data = resolveFields.length
      ? await this.resolveWrite(model, vals, resolveFields)
      : vals;
    const success = await this.raw(model, 'write', [ids, data]);
    return success;
  }

  async searchAndWrite({
    model,
    domain,
    vals,
    resolveFields = [],
    context,
  }: SearchAndWriteArguments): Promise<number[]> {
    const ids = await this.searchIds({ model, domain, context });
    if (!ids.length) {
      throw `${domain} not found on model: ${model}`;
    }
    await this.write({ model, ids, vals, resolveFields });
    return ids;
  }

  async unlink({ model, ids }: UnlinkArguments): Promise<boolean> {
    if (!Array.isArray(ids)) {
      ids = [ids];
    }
    const success = await this.raw(model, 'unlink', [ids]);
    return success;
  }

  async sendNote({
    model,
    recordId,
    message,
  }: SendNotesArguments): Promise<number> {
    const id = await this.raw(model, 'message_post', [[recordId]], {
      body: message,
      message_type: 'comment',
      subtype: 'mail.mt_note',
    });
    return id;
  }

  async sendMessage({
    model,
    recordId,
    message,
  }: SendNotesArguments): Promise<number> {
    const id = await this.raw(model, 'message_post', [[recordId]], {
      body: message,
      message_type: 'comment',
      subtype: 'mail.mt_comment',
    });
    return id;
  }

  async raw(
    model: string,
    function_name: string,
    args: any[] = [[]],
    kwargs = {},
  ) {
    if (!this.url || !this.url.startsWith('http')) {
      throw 'Malformed Odoo URL';
    }
    await this.loginPromise;
    const options: AxiosRequestConfig = {
      url: `${this.url}/jsonrpc`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept-encoding': 'gzip, deflate',
        Accept: 'application/json',
      },
      data: {
        method: 'call',
        jsonrpc: '2.0',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            this.db,
            this.uid,
            this.password,
            model,
            function_name,
            args,
            kwargs,
          ],
        },
      },
    };
    const res = (await Axios(options)).data;
    if (res.error) {
      throw res.error;
    }
    return res.result;
  }
}
