//@ts-check
import { MyORMAdapterError, 
    MyORMColumnDoesNotExistError, 
    MyORMConstraintError, 
    MyORMInternalError, 
    MyORMInvalidPropertyTypeError, 
    MyORMNonUniqueKeyError, 
    MyORMNotImplementedError, 
    MyORMOptionsError, 
    MyORMSyntaxError } from "./exceptions.js";
import { deepCopy } from "./util.js";
import { Where, WhereBuilder } from "./where-builder.js";
import * as Types from "./types.js";
import { CommandListener } from "./events.js";

/**
 * @typedef {object} MyORMOptions
 * @prop {boolean=} allowTruncation
 * Disable protective measures to prevent an accidental truncation of your table through the `.truncate()` function. (default: false)
 * @prop {boolean=} allowUpdateAll
 * Disable protective measures to prevent an accidental update of all records on your table. (default: false)
 */

/**
 * @template {import('./types.js').SqlTable} T 
 * Model representing the raw table in SQL.
 * @template {import('./types.js').SqlTable} U 
 * Model representing the table how it is worked on in `MyORM`.
 * @typedef {object} ContextState
 * @prop {import('./types.js').SelectClauseProperty[]} select
 * Columns to retrieve from the database.
 * @prop {[Omit<Omit<import('./types.js').FromClauseProperty, "targetTableKey">, "sourceTableKey">, ...import('./types.js').FromClauseProperty[]]} from
 * Tables to retrieve columns from in the database. (The first time will always be the main table of the context.)
 * @prop {import('./types.js').GroupByClauseProperty[]=} groupBy
 * Columns to group by.
 * @prop {import('./types.js').SortByClauseProperty[]=} sortBy
 * Columns to sort by.
 * @prop {number=} limit
 * Number of rows to retrieve.
 * @prop {number=} offset
 * Number of rows to skip before retrieving.
 * @prop {WhereBuilder<any, any>=} where
 * Builder representing state of the WHERE clause.
 * @prop {boolean=} explicit
 * True if the next update/delete operation should be explicit. False otherwise.
 * @prop {boolean=} negated
 * Direct relationships from this table.
 * @prop {((t: U) => T)=} mapBack 
 * Mapping function used to map aliased records to the raw table models.
 * @prop {((t: T) => U)=} mapForward 
 * Mapping function used to map raw table records to the aliased version.
 */

/**
 * @enum {0|1|2|3}
 */
export const EventTypes = {
    QUERY: /** @type {0} */ (0),
    INSERT: /** @type {1} */ (1),
    UPDATE: /** @type {2} */ (2),
    DELETE: /** @type {3} */ (3),
};

/**
 * Class representing a connection to a database's table for usage of relational mapping.
 * @template {import('./types.js').SqlTable} TTableModel
 * Original table model as it is portrayed in the database.
 * @template {import('./types.js').SqlTable} [TAliasModel=import('./types.js').OnlyNonSqlTables<TTableModel>]
 * **Used internally**  
 * Uses to track the state of what the models should look like in the arguments or return values for transactional functions (`.select()`, `.insert()`, `.update()`, `.delete()`)
 */
export class MyORMContext {
    /** Table name as it appears in the database.
     * @protected @type {string} */ _table;
    /** Object containing keys that are exact names of each column of the table and values containing information about the column's configuration.
     * @protected @type {{[K in keyof TTableModel]: import('./schema.js').DescribedSchema}} */ _schema;
    /** List of constraints that are on this table.
     * @protected @type {import('./types.js').ConstraintData[]} */ _constraints;
    /** All relationships between this context and other tables.
     * @protected @type {Record<string, import('./types.js').Relationship<TTableModel>>} */ _relationships;
    /** Promise used for handling asynchronous tasks in synchronous functions.
     * @protected @type {Promise<any>} */ _promise;

    /** State of the context, used to store different "views" of the context.
     * @type {ContextState<TTableModel, TAliasModel>} */ #state;
    /** Adapter being used by the user.
     * @type {import("./types.js").MyORMAdapter<any>} */ #adapter;
    /** Options passed in by the user that determine certain behaviors in `MyORM`.
     * @type {MyORMOptions} */ #options;
    /** Function used to identify a default value for unspecified columns.
     * @type {((model: TTableModel) => void)=} */ #identification;
    /** Emitter for handling events across `MyORM`.
     * @type {CommandListener} */ #emitter;
     
    /**
     * Create a new `MyORMContext` to interact with a table in your database.
     * @param {import("./types.js").MyORMAdapter<any>} adapter 
     * Adapter being used for which type of database is being worked on.
     * @param {string} table 
     * Name of the table as it exactly appears in the database.
     * @param {MyORMOptions=} tableOptions 
     * Additional options that can be passed to enable/disable certain features.
     */
    constructor(adapter, table, tableOptions={}) {
        this.#adapter = adapter;
        this._table = table;
        this.#options = {
            allowTruncation: false,
            allowUpdateAll: false,
            ...tableOptions,
        };
        this.#state = {
            select: [],
            from: [{
                table,
                alias: table
            }],
        }
        this._constraints = [];
        this._relationships = {};
        this.#identification = undefined;
        this.#emitter = new CommandListener(table);

        this._promise = this.#describe(table).then(async schema => {
            this.#state.select = Object.values(schema).map(f => ({
                column: this.#adapter.syntax.escapeColumn(f.field),
                table: this.#adapter.syntax.escapeTable(f.table),
                alias: this.#adapter.syntax.escapeColumn(f.alias)
            }));
            this._schema = /** @type {{[K in keyof TTableModel]: import('./schema.js').DescribedSchema}} */ (Object.fromEntries(Object.entries(schema).map(([k,v]) => [v.field, v])));
            const scope = this.#getScope();
            const { cmd, args } = this.#adapter.serialize(scope).forConstraints(table);
            this._constraints = await this.#adapter.execute(scope).forConstraints(cmd, args);
        });
    }

    /**
     * Query rows from the table using all configured clauses on the state of this context.
     * @template {import('./types.js').SelectedColumnsModel<TTableModel>|TAliasModel} [TSelectedColumns=TAliasModel]
     * Used internally for typescript to create a new `TAliasModel` on the returned context, which will change the scope of what the user will see in further function calls.
     * @param {((model: import('./types.js').SpfSelectCallbackModel<TTableModel>) => import('./types.js').MaybeArray<keyof TSelectedColumns>)=} modelCallback
     * Used to choose which columns to retrieve from the query.  
     * If nothing is specified, the original aliased representation will be returned.  
     * If a GROUP BY clause has been specified, an error will be thrown.
     * @returns {Promise<(TSelectedColumns extends TAliasModel ? TAliasModel : import('./types.js').ReconstructSqlTable<TTableModel, TSelectedColumns>)[]>} Array of records, serialized from the rows returned from the query given the clauses specified.
     */
    async select(modelCallback=undefined) {
        await this._promise;
        if(modelCallback) {
            if(this.#state.groupBy) throw Error('Cannot choose columns when a GROUP BY clause is present.');
            const selects = /** @type {import('./types.js').MaybeArray<import('./types.js').SelectClauseProperty>}*/ (/** @type {unknown} */ (modelCallback(this.#newProxyForColumn())));
            this.#state.select = [...Array.isArray(selects) ? selects : [selects]];
        }
        const scope = this.#getScope();

        // make sure primary keys exist within query, otherwise serialization breaks.
        const stateOfSelectsMapped = this.#state.select.map(s => s.alias);
        if (this.#state.from.length > 1 && !this.#state.groupBy) {
            for (let i = 1; i < this.#state.from.length; ++i) {
                const table = /** @type {import("./types.js").FromClauseProperty} */(this.#state.from[i]);
                if (!stateOfSelectsMapped.includes(table.targetTableKey.alias)) {
                    this.#state.select.push(table.targetTableKey);
                }
                if (!stateOfSelectsMapped.includes(table.sourceTableKey.alias)) {
                    this.#state.select.push(table.sourceTableKey);
                }
            }
        }
        const { cmd, args } = this.#adapter.serialize(scope).forQuery({
            select: this.#state.select,
            from: this.#state.from,
            //@ts-ignore `._getConditions` is marked private so the User does not see the function.
            where: this.#state?.where?._getConditions(),
            group_by: this.#state.groupBy,
            order_by: this.#state.sortBy,
            limit: this.#state.limit,
            offset: this.#state.offset
        });
        try {
            const results = await this.#adapter.execute(scope).forQuery(cmd, args);
            const serialized = /** @type {any} */ (this.#serialize(results));
            this.#emitter.emitQuerySuccess({
                cmd, 
                args,
                results
            });
            return serialized;
        } catch(err) {
            this.#emitter.emitQueryFail({
                cmd,
                args,
                err: /** @type {Error} */ (err)
            });
            throw err;
        }
    }

    /**
     * Query the total number of rows from the table using all configured clauses on the state of this context.  
     * __NOTE: This function will return the COUNT(*) of the query being executed, and depending on the adapter, if there are any inclusions (`.include()`) then 
     * the number returned might be of all rows in the `LEFT JOIN` instead of the total number of rows just on the table this context represents.__
     * @returns {Promise<number>} Number of rows in the table specified through the clauses.
     */
    async count() {
        await this._promise;
        const scope = this.#getScope();
        const { cmd, args } = this.#adapter.serialize(scope).forCount({
            select: this.#state.select,
            from: this.#state.from,
            //@ts-ignore `._getConditions` is marked private so the User does not see the function.
            where: this.#state.where?._getConditions(),
            group_by: this.#state.groupBy,
            order_by: this.#state.sortBy,
            limit: this.#state.limit,
            offset: this.#state.offset
        });
        try {
            const result = await this.#adapter.execute(scope).forCount(cmd, args);
            this.#emitter.emitQuerySuccess({
                cmd, 
                args,
                results: [result]
            });
            return result;
        } catch(err) {
            this.#emitter.emitQueryFail({
                cmd,
                args,
                err: /** @type {Error} */ (err)
            });
            throw err;
        }
    }
    
    /**
     * Insert records into the table.
     * @param {import('./types.js').MaybeArray<TTableModel>} records
     * Record or records to insert into the database.
     * @returns {Promise<TTableModel[]>} The same records that were inserted, with appropriate columns being identified from AUTO_INCREMENT properties or `.default()` values.
     */
    async insert(records) {
        await this._promise;
        if (records === undefined) return [];
        records = Array.isArray(records) ? records : [records];
        if (records.length <= 0) return [];
        // Map the records back to their original Table representation, just so MyORM can correctly work with it.
        if(this.#identification !== undefined) {
            // identify all columns that do not exist on each record with the user's identification function.
            const newProxy = (r, table=this._table, relationships=this._relationships, schema=this._schema) => new Proxy(r, {
                get: (t,p,r) => {
                    if (typeof p === "symbol") throw new MyORMInvalidPropertyTypeError(p);
                    if (p in relationships) {
                        return newProxy(t[p], relationships[p].table, relationships[p].relationships, relationships[p].schema);
                    }
                    if (!(p in schema)) throw new MyORMColumnDoesNotExistError(p, table);
                    return t[p];
                },
                set: (t,p,v) => {
                    if (typeof p === "symbol") throw new MyORMInvalidPropertyTypeError(p);
                    if (!(p in this._schema)) throw new MyORMColumnDoesNotExistError(p, table);
                    if(!this._schema[p].isIdentity && !(p in t)) {
                        //@ts-ignore `p` will belong in `t`, as it is pre-checked to see if p is in schema.
                        t[p] = v;
                        return true;
                    }
                    return true;
                }
            });
            // set user specified default values
            records.forEach(r => this.#identification?.call(this, newProxy(r)));
        }
        // set database specified default values (this is mapped as we also remove keys that should not exist during the insert.)
        const recs = records.map(r => {
            /** @type {any} */
            let o = {};
            for(const key in this._schema) {
                // delete virtual keys.
                if(this._schema[key].isIdentity || this._schema[key].isIdentity || this._schema[key].isVirtual) continue;
                // set defaults
                if(!(key in r)) {
                    r[key] = /** @type {any} */ (this._schema[key].defaultValue());
                }
                // transfer
                o[key] = r[key];
            }
            return o;
        });
        const insertIds = await this.#insert(recs);
        const idKey = this.#getIdentityKey();
        if(idKey !== undefined) {
            records.forEach((r,n) => {
                //@ts-ignore property access is valid, although typescript says otherwise.
                r[idKey.field] = insertIds[n];
            });
        }
        
        // If the schema has any column that is virtually generated, then we want to return the most up to date values, so we re-select the records we just inserted.
        if(Object.values(this._schema).filter(c => c.isVirtual).length > 0) {
            // get an array of all unique columns that are to be inserted.
            const columns = Array.from(new Set(records.flatMap(r => Object.keys(r).filter(k => isPrimitive(r[k])))));
            // map each record so all of them have the same keys, where keys that are not present have a null value.
            const values = records.map(r => Object.values({...Object.fromEntries(columns.map(c => [c,null])), ...Object.fromEntries(Object.entries(r).filter(([k,v]) => isPrimitive(v)))}))
            const where = Where(columns[0], this._table, this._relationships, this._schema);
            let chain = where.in(values.map(v => v[0]));
            for(let i = 1; i < columns.length; ++i) {
                //@ts-ignore typescript will show as error because TTableModel is generic in this context.
                chain = chain.and(m => m[columns[i]].in(values.map(v => v[i])));
            }
            return await this.#duplicate(ctx => {
                ctx.#state.where = where;
            }).select();
        }
        return records;
    }

    /**
     * Update rows within the table given an array of records (update by primary key [implicit]) 
     * or a function that specifies the values to update, using a built WHERE clause using `.where()` [explicit].  
     * @param {import('./types.js').MaybeArray<TTableModel>|((m: TTableModel) => Partial<TTableModel>|void)} records  
     * Records or function to use to determine what rows to update.
     * - `TTableModel|TTableModel[] records`: Records to update, this will require the primary key(s) to be present on the record, otherwise this function will throw an error.  
     * - `((model: TTableModel) => Partial<TTableModel>|undefined) records`: A function that either sets `model`'s respective columns to the desired values in the update or returns an object containin the properties and desired values to update to.
     * __NOTE: For explicit usage, the object returned will take precedence over property sets.__
     * @returns {Promise<number>} Number of rows that were affected by the update.
     * @example
     * ```ts
     * const ctx = new MyORMContext<{ Id: number, Name: string }>(adapter, "Foo");
     * // implicit
     * ctx.update({ Id: 1, Name: "john" }).then(n => console.log(`number of rows affected: ${n}`)); // will print 1
     * ctx.update({ Id: 1, Name: "jane" }).then(n => console.log(`number of rows affected: ${n}`)); // will print 1
     * // explicit using sets
     * ctx.where(m => m.Id.in([1])).update(m => {
     *   m.Name = "john";
     * }).then(n => console.log(`number of rows affected: ${n}.`)); // will print 1
     * // explicit using update object.
     * ctx.where(m => m.Id.in([1])).update(m => {
     *   return {
     *     Name: "jane"
     *   };
     * }).then(n => console.log(`number of rows affected: ${n}.`)); // will print 1
     * ```
     */
    async update(records) {
        await this._promise;
        let cmd, args;
        if(records === undefined) return 0;
        const scope = this.#getScope();
        const pKeys = this.#getPrimaryKeys();
        // the user is explicitly telling MyORM what columns/values to set.
        if (typeof records === 'function') {
            if (this.#state.where == undefined && !this.#options.allowUpdateAll) {
                throw new MyORMOptionsError('Updating all is disabled on this context. You can enable updating to all records by passing { allowUpdateAll: true } into "options" during construction.');
            }
            let columns = [];
            let values = [];
            // user can either do value sets (e.g., `m.Column = 12`) or return an object. If an object is returned, then `o` takes precedence.
            const newProxy = () => new Proxy(/** @type {any} */({}), {
                set: (t,p,v) => {
                    if(typeof p === "symbol") throw new MyORMInvalidPropertyTypeError(p);
                    // Ignore changes to primary keys.
                    if(pKeys.includes(p)) return false;
                    // Only change columns that are within the schema.
                    if(!(p in this._schema)) return false;
                    columns.push(p);
                    values.push(v);
                    return true;
                }
            });
            let o = records(newProxy());
            // sets through returned object.
            if(o !== undefined) {
                o = /** @type {Partial<TTableModel>} */ (Object.fromEntries(Object.entries(o).filter(([k,v]) => !pKeys.includes(k)))); 
                columns = Object.keys(o);
                values = Object.values(o);
            }

            //@ts-ignore ._getConditions is marked private, but is available for use within this context.
            const whereConditions = this.#state.where._getConditions();
            // sets through explicit set values from proxy. 
            const detail = this.#adapter.serialize(scope).forUpdate({
                table: this._table,
                columns,
                where: whereConditions,
                explicit: {
                    values
                }
            });
            cmd = detail.cmd;
            args = detail.args;
        } else {
            // Otherwise, user passed in a record or an array of records that are to be updated via their primary key.
            records = Array.isArray(records) ? records : [records];
            if(records.length <= 0) return 0;
            if (pKeys.length <= 0) {
                throw new MyORMSyntaxError(`No primary key exists on ${this._table}. Use the explicit version of this update by passing a callback instead.`);
            }
            
            // get the columns that are to be updated.
            const columns = records
                .flatMap(r => Object.keys(r)
                    .filter((k) => r[k] == null || typeof r[k] !== "object" || r[k] instanceof Date))
                    .filter((k, n, self) => self.indexOf(k) === n)
                .filter(k => {
                    if(this._schema[k].isVirtual) {
                        this.#emitter.emitWarning({
                            table: this._table,
                            type: "Update",
                            message: `An attempt was made to update a virtually generated column.`,
                            dateIso: new Date().toISOString(),
                        })
                    }
                    return !pKeys.includes(k) || this._schema[k].isVirtual;
                }); // ignore primary key changes.
            
            // add a WHERE statement so the number of rows affected returned matches the actual rows affected, otherwise it will "affect" all rows.
            let where = Where(pKeys[0], this._table, this._relationships, this._schema);
            let chain = where.in(records.map(r => r[pKeys[0]]))
            for(let i = 1; i < pKeys.length; ++i) {
                //@ts-ignore
                chain = chain.and(m => m[pKeys[i]].in(records.map(r => r[pKeys[i]])).and(m => m[pKeys[i+1]].in(r[pKeys[i+1]])));
            }
            //@ts-ignore ._getConditions is marked private, but is available for use within this context.
            const whereConditions = where._getConditions();
    
            const detail = this.#adapter.serialize(scope).forUpdate({
                table: this._table,
                columns,
                where: whereConditions,
                implicit: {
                    primaryKeys: pKeys,
                    objects: records
                }
            });
            cmd = detail.cmd;
            args = detail.args;
        }

        try {
            const results = await this.#adapter.execute(scope).forUpdate(cmd, args);
            this.#emitter.emitUpdateSuccess({
                cmd,
                args,
                results: [results]
            });
            return results;
        } catch(err) {
            this.#emitter.emitUpdateFail({
                cmd,
                args,
                err
            });
            throw err;
        }
    }

    /**
     * Delete the records specified. Each record specified should have their primary key(s) specified as well.
     * If no records are specified, then the delete will occur based off the built `WHERE` clause.  
     * @param {import('./types.js').MaybeArray<TAliasModel>?} records 
     * Records to delete (default: undefined) If undefined is passed, then the explicit version of this function will occur, which deletes records based on the `WHERE` clause specified..
     * @returns {Promise<number>} Number of rows affected.
     * @example
     * ```ts
     * const ctx = new MyORMContext<{ Id: number, Name: string }>(adapter, "Foo");
     * // implicit
     * ctx.delete({ Id: 1, Name: "john" }).then(n => console.log(`number of rows affected: ${n}`)); // will print 1
     * // explicit
     * ctx.where(m => m.Id.in([1])).delete().then(n => console.log(`number of rows affected: ${n}.`)); // will print 1
     * ```
     */
    async delete(records=null) {
        await this._promise;
        if(records === undefined) return 0;
        const scope = this.#getScope();

        let cmd, args;
        if (records === null) {
            if (this.#state.where === undefined) {
                throw new MyORMSyntaxError("No WHERE clause was provided, possibly resulting in an update to all records.");
            }
            //@ts-ignore ._getConditions is marked private, but is available for use within this context.
            const whereConditions = this.#state.where._getConditions();
            const detail = this.#adapter.serialize(scope).forDelete({
                table: this._table,
                where: whereConditions
            });
            cmd = detail.cmd;
            args = detail.args;
        } else {
            const pKeys = this.#getPrimaryKeys();
            records = Array.isArray(records) ? records : [records];
            if (records.length <= 0) return 0;
            if (pKeys === undefined) {
                throw new MyORMSyntaxError(`No primary key exists on ${this._table}. Use the explicit version of this update by passing a callback instead.`);
            }
            // add a WHERE statement so the number of rows affected returned matches the actual rows affected, otherwise it will "affect" all rows.
            let where = Where(pKeys[0], this._table, this._relationships, this._schema);
            let chain = where.in(records.map(r => r[pKeys[0]]))
            for(let i = 1; i < pKeys.length; ++i) {
                //@ts-ignore
                chain = chain.and(m => m[pKeys[i]].in(records.map(r => r[pKeys[i]])).and(m => m[pKeys[i+1]].in(r[pKeys[i+1]])));
            }
    
            //@ts-ignore ._getConditions is marked private, but is available for use within this context.
            const whereConditions = where._getConditions();
    
            const detail = this.#adapter.serialize(scope).forDelete({
                table: this._table,
                where: whereConditions
            });
            cmd = detail.cmd;
            args = detail.args
        }

        try {
            const results = await this.#adapter.execute(scope).forDelete(cmd, args);
            this.#emitter.emitDeleteSuccess({
                cmd,
                args,
                results: [results]
            });
            return results;
        } catch(err) {
            this.#emitter.emitDeleteFail({
                cmd,
                args,
                err
            });
            throw err;
        }
    }

    /**
     * Truncate the table.  
     * __NOTE: Usage of this function requires the property, `allowTruncation`, to be present and truthy in the `options` passed into the constructor.__ 
     * @returns {Promise<number>} Number of rows that have been affected.
     */
    async truncate() {
        await this._promise;
        if(!("allowTruncation" in this.#options) || !this.#options.allowTruncation) {
            throw new MyORMOptionsError(`Truncation is disabled on this context. You can enable truncation by passing { allowTruncation: true } into "options" during construction.`);
        }
        const scope = this.#getScope();
        const { cmd, args } = this.#adapter.serialize(scope).forTruncate({ table: this._table });

        try {
            const results = this.#adapter.execute(scope).forTruncate(cmd, args);
            this.#emitter.emitDeleteSuccess({
                cmd,
                args,
                results: [results]
            });
            return results;
        } catch(err) {
            this.#emitter.emitDeleteFail({
                cmd, 
                args,
                err
            });
            throw err;
        }
    }

    /**
     * 
     * @param {string} table 
     * Table to describe. 
     * @returns {Promise<{[fieldName: string]: import('./schema.js').DescribedSchema}>}
    */
    async #describe(table) {
        const { cmd, args } = this.#adapter
            .serialize(this.#getScope())
            .forDescribe(table);
        const schema = await this.#adapter
            .execute(this.#getScope())
            .forDescribe(cmd, args);
        
        for(const k in schema) {
            schema[k].alias = schema[k].field;
            schema[k].table = table;
        }
        return schema;
    }

    /**
     * Alias your table to a different return type.  
     * 
     * This function essentially uses the `modelCallback` you provide to map the results before they are returned back to you.  
     * 
     * __NOTE: Aliasing does **NOT** change how clause building works. Clause building will **ONLY** work on the original column name from the table. Aliasing only takes place when directly
     * interacting with your records (e.g., `.select()`, `.insert()`, `.update()`, and `.delete()`.__
     * 
     * __NOTE: It is assumed that you are aliasing non-null variables, so if you attempt to insert, 
     * then the created command will fail if you do not have these variables present. The same goes for updating/deleting on records without primary keys and no where clause was built.__
     * 
     * @template {import('./types.js').SqlTable} TAliasedType 
     * Aliased type that is derived from the return value of `aliasModelCallback`.
     * @template {{[K in keyof TTableModel]-?: TTableModel[K]}} [TRequiredModel={[K in keyof TTableModel]-?: TTableModel[K]}]
     * @param {((model: TRequiredModel) => TAliasedType)} aliasModelCallback 
     * Callback that should return an object that would represent your desired aliased type.
     * @returns {MyORMContext<TTableModel, TAliasedType>} A new context with the all previously configured clauses and the updated alias type.
     */
    alias(aliasModelCallback) {
        return this.#duplicate((ctx) => {
            // @ts-ignore This is being assigned to this here because it is meant to be transferred to the new context.
            ctx.#state.mapForward = aliasModelCallback;
            const newProxy = (table = "") =>
                new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if(typeof p === "symbol") throw new MyORMInternalError();
                        if (p in ctx._relationships) {
                            if (!table.endsWith(`${String(p)}.`)) {
                                table = `${table}${String(p)}.`;
                            }
                            if (ctx._relationships[p].type === "1:n") {
                                return [newProxy(table)];
                            }
                            return newProxy(table);
                        }
                        return `${table}${String(p)}`;
                    },
                });

            const aliasMap = aliasModelCallback(newProxy());
            const flipd = Object.fromEntries(
                Object.entries(aliasMap)
                    .filter(([k, v]) => typeof v !== "object")
                    .map(([k, v]) => [v, k])
            );
            ctx.#state.mapBack = (x) => {
                /** @type {Partial<TTableModel>} */
                const o = {};
                for (const key in flipd) {
                    // @ts-ignore The key is expected to be part of TTableModel, but TS won't know that, so the error is ignored.
                    o[key] = x[flipd[key]];
                }
                return o;
            };
        });
	}

    map = this.alias;

    /**
     * Upon inserting, give a default value to a column if the respective property does not exist in the record(s).
     * @param {(model: TTableModel) => void} callback 
     * Callback that gives context to the record being inserted. Set the value you wish to default in the cases where the property does not exist.  
     * __NOTE: A proxy protects already set values from being updated to the default value, as well as database identity columns. (e.g., MySQL's AUTO_INCREMENT)
     * You can freely use this function to only set keys if they do not already exist on the record.__  
     * __NOTE: Existing values on `model` will only be of values BEFORE the insert occurs.__
     * @returns {this}
     * @example
     * ```ts
     * interface Foo {
     *   a?: number; // auto increment
     *   b: string;
     *   c?: boolean;
     *   d?: Date; 
     * };
     * 
     * const ctx = new MyORMContext<Foo>(adapter, "Foo");
     * ctx.default(m => {
     *   m.c = false;
     *   m.d = new Date();
     * });
     * 
     * const oneWeekAgo = new Date();
     * oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
     * ctx.insert([
     *   { b: 'test 1' },
     *   { b: 'test 2', c: true },
     *   { b: 'test 3', d: null }
     * ]).then(async results => {
     *   console.log(results); // will show: [dates would be objects.]
     *   // { a: 1, b: 'test 1', c: false, d: "Mon Jun 19 2023 10:45:30 GMT-0500 (Central Daylight Time)" }
     *   // { a: 2, b: 'test 2', c: true, d: "Mon Jun 19 2023 10:45:30 GMT-0500 (Central Daylight Time)" }
     *   // { a: 3, b: 'test 3', c: false, d: null }
     * });
     * ```
     */
    default(callback) {
        this.#identification = callback;
        return this;
    }

    identify = this.default;

    /**
     * Limit the number of rows to retrieve.
     * @param {number} n 
     * Number of rows to retrieve.
     * @returns {MyORMContext<TTableModel, TAliasModel>} A new context with the state of the context this occurred in addition with a new state of a LIMIT clause.
     */
    take(n) {
        return this.#duplicate(ctx => {
            ctx.#state.limit = n;
        });
    }

    limit = this.take;

    /**
     * Skip a number of rows before retrieving.
     * __WARNING: Depending on the adapter being used, you may need to use `.take()` in conjunction with this function.__
     * @param {number} n 
     * Number of rows to skip.
     * @returns {MyORMContext<TTableModel, TAliasModel>} A new context with the state of the context this occurred in addition with a new state of a OFFSET clause.
     */
    skip(n) {
        return this.#duplicate(ctx => {
            ctx.#state.offset = n;
        });
    }

    offset = this.skip;

    /**
     * Filter the query results given a column or columns' comparative qualities to some value or values.  
     * __NOTE: Since JavaScript does not offer operator overloading, you must use the {@link WhereBuilder}'s operator exposed functions.__
     * @param {(model: import('./types.js').ChainObject<TTableModel>) => void} modelCallback 
     * Property reference callback that is used to assist building a WHERE clause.
     * @returns {MyORMContext<TTableModel, TAliasModel>} A new context with the state of the context this occurred in addition with a new state of a WHERE clause.
     */
    where(modelCallback) {
        return this.#duplicate(ctx => {
            const newProxy = (realTableName=ctx._table, table = ctx._table, relationships=ctx._relationships, schema=ctx._schema) => new Proxy({}, {
                get: (t,p,r) => {
                    if (typeof (p) === 'symbol') throw new MyORMInvalidPropertyTypeError(p);
                    if (ctx.#isRelationship(p, relationships)) {
                        return newProxy(relationships[p].table, relationships[p].alias, relationships[p].relationships, relationships[p].schema);
                    }
                    if(!(p in schema)) throw new MyORMColumnDoesNotExistError(p, realTableName);
                    const field = schema[p].field;
                    if(ctx.#state.where) {
                        //@ts-ignore `._append` is marked private so the User does not see the function.
                        return ctx.#state.where._append(field, `AND${ctx.#state.negated ? ' NOT' : ''}`);
                    }
                    return ctx.#state.where = Where(
                        ctx.#adapter.syntax.escapeColumn(field), 
                        ctx.#adapter.syntax.escapeTable(table), 
                        ctx._relationships,
                        ctx._schema,
                        `WHERE${ctx.#state.negated ? ' NOT' : ''}`
                    );
                }
            });

            modelCallback(newProxy());
            this.#state.negated = false;
        });
    }

    get not() {
        this.#state.negated = true;
        return this;
    }

    filter = this.where;

    /**
     * Specify the columns to sort on.  
     * __NOTE: columns used for sorting are done in the order that is specified.__
     * @param {(model: import('./types.js').SortByCallbackModel<TTableModel>) => import('./types.js').MaybeArray<import('./types.js').SortByClauseProperty|import('./types.js').SortByCallbackModelProp>} modelCallback 
     * Property reference callback that is used to determine which column or columns will be used to sort the queried rows
     * @returns {MyORMContext<TTableModel, TAliasModel>} A new context with the state of the context this occurred in addition with a new state of an ORDER BY clause.
     */
    sortBy(modelCallback) {
        return this.#duplicate(ctx => {
            const sorts = modelCallback(this.#newProxyForColumn(undefined, o => ({
                ...o,
                direction: "ASC",
                asc: () => ({ ...o, direction: "ASC" }),
                desc: () => ({ ...o, direction: "DESC" })
            })));

            ctx.#state.sortBy = /** @type {import("./types.js").SortByClauseProperty[]} */ (Array.isArray(sorts) ? sorts : [sorts]);
        });
    }

    sort = this.sortBy;

    /**
     * Specify the columns to group the results on.
     * @template {import('./types.js').GroupedColumnsModel<TTableModel>} TGroupedColumns
     * Used internally for typescript to create a new `TAliasModel` on the returned context, which will change the scope of what the user will see in further function calls.
     * @param {(model: import('./types.js').SpfGroupByCallbackModel<TTableModel>, aggregates: import('./types.js').Aggregates) => import('./types.js').MaybeArray<keyof TGroupedColumns>} modelCallback 
     * Property reference callback that is used to determine which column or columns should be selected and grouped on in future queries.
     * @returns {MyORMContext<import('./types.js').ReconstructSqlTable<TTableModel, TGroupedColumns>, import('./types.js').ReconstructSqlTable<TTableModel, TGroupedColumns>>} 
     * A new context with the state of the context this occurred in addition with a new state of a GROUP BY clause.
     */
    groupBy(modelCallback) {
        return this.#duplicate(ctx => {
            /**
             * 
             * @param {"AVG"|"COUNT"|"MIN"|"MAX"|"SUM"|"TOTAL"} aggr
             * @returns {(col?: any) => any} 
             */
            const getGroupedColProp = (aggr) => {
                return (col) => {
                    if(aggr === "TOTAL") return {
                        table: 'AGGREGATE',
                        column: 'COUNT(*)',
                        alias: `$total`,
                        aggregate: aggr
                    }
                    if(col === undefined) throw new MyORMInternalError();
                    const { table, column, aliasUnescaped } = /** @type {import('./types.js').Column} */ (col);
                    const c = aggr === 'COUNT' 
                        ? `COUNT(DISTINCT ${table}.${column})` 
                        : `${aggr}(${table}.${column})`;
                    return {
                        table: 'AGGREGATE',
                        column: c,
                        alias: this.#adapter.syntax.escapeColumn(`$${aggr.toLowerCase()}_` + aliasUnescaped?.replace("<|", "_")),
                        aggregate: aggr
                    }
                };
            };

            const groups = /** @type {import('./types.js').MaybeArray<import('./types.js').GroupByClauseProperty>} */ (/** @type {unknown} */ (modelCallback(this.#newProxyForColumn(), {
                avg: getGroupedColProp("AVG"),
                count: getGroupedColProp("COUNT"),
                min: getGroupedColProp("MIN"),
                max: getGroupedColProp("MAX"),
                sum: getGroupedColProp("SUM"),
                total: getGroupedColProp("TOTAL")
            })));

            ctx.#state.select = Array.isArray(groups) ? groups : [groups];
            ctx.#state.groupBy = ctx.#state.select.filter(col => !("aggregate" in col));
        });
    }

    group = this.groupBy;

    /**
     * Specify the columns to select from all queries.
     * @template {import('./types.js').SelectedColumnsModel<TTableModel>} TSelectedColumns
     * Used internally for typescript to create a new `TAliasModel` on the returned context, which will change the scope of what the user will see in further function calls.
     * @param {(model: import('./types.js').SpfSelectCallbackModel<TTableModel>) => import('./types.js').MaybeArray<keyof TSelectedColumns>} modelCallback
     * Property reference callback that is used to determine which column or columns should be selected on future queries.
     * @returns {MyORMContext<TTableModel, import('./types.js').ReconstructSqlTable<TTableModel, TSelectedColumns>>} A new context with the all previously configured clauses and the updated groupings.
     */
    choose(modelCallback) {
        if(this.#state.groupBy) throw Error('Cannot choose columns when a GROUP BY clause is present.');

        return this.#duplicate(ctx => {
            const selects = /** @type {import('./types.js').MaybeArray<import('./types.js').SelectClauseProperty>}*/ (/** @type {unknown} */ (modelCallback(this.#newProxyForColumn())));
            ctx.#state.select = Array.isArray(selects) ? selects : [selects];
        });
    }

    /**
     * Specify the columns you would like to select
     * @template {import('./types.js').IncludedColumnsModel<TTableModel>} TIncludedColumn
     * @param {(model: {[K in keyof import("./types.js").OnlySqlTableTypes<TTableModel>]: import('./types.js').ThenIncludeCallback<import("./types.js").OnlySqlTableTypes<TTableModel>[K], K>}) => void} modelCallback
     * @returns {MyORMContext<TTableModel, TAliasModel & {[K in keyof TIncludedColumn as K extends keyof TTableModel ? K : never]: Exclude<TTableModel[K], undefined>}>} A new context with the all previously configured clauses and the updated groupings.
     */
    include(modelCallback) {
        return this.#duplicate(ctx => {
            const newProxy = (table=ctx._table, relationships=ctx._relationships) => new Proxy(/** @type {any} */({}), {
                get: (t,p,r) => {
                    if (typeof(p) === 'symbol') throw new MyORMInvalidPropertyTypeError(p);
                    if (!ctx.#isRelationship(p, relationships)) throw Error(`The specified table, "${p}", does not have a configured relationship with "${table}".`);
                    
                    const pKey = relationships[p].primary;
                    const fKey = relationships[p].foreign;
                    const relatedTableAlias = relationships[p].alias;
                    ctx.#state.from.push({
                        table: ctx.#adapter.syntax.escapeTable(relationships[p].table),
                        alias: ctx.#adapter.syntax.escapeTable(relatedTableAlias),
                        sourceTableKey: {
                            table: ctx.#adapter.syntax.escapeTable(table),
                            column: ctx.#adapter.syntax.escapeColumn(pKey.column),
                            alias: ctx.#adapter.syntax.escapeTable(pKey.alias)
                        },
                        targetTableKey: {
                            table: ctx.#adapter.syntax.escapeTable(relatedTableAlias),
                            column: ctx.#adapter.syntax.escapeColumn(fKey.column),
                            alias: ctx.#adapter.syntax.escapeColumn(fKey.alias)
                        }
                    });
                    ctx.#state.select = ctx.#state.select.concat(Object.values(relationships[p].schema).map(col => ({
                        table: ctx.#adapter.syntax.escapeTable(col.table),
                        column: ctx.#adapter.syntax.escapeColumn(col.field),
                        alias: ctx.#adapter.syntax.escapeColumn(col.alias)
                    })));

                    const thenInclude = {
                        thenInclude: (callback) => {
                            callback(newProxy(relatedTableAlias, relationships[p].relationships));
                            return thenInclude;
                        }
                    };
                    return thenInclude;
                }
            });

            modelCallback(newProxy());
        });
    }

    join = this.include;

    /**
     * Configure a one-to-one relationship between the table represented in this context and related tables.
     * @param {import('./types.js').HasOneCallback<TTableModel>} modelCallback 
     * Property reference callback that is used to configure the relationships.
     * @returns {this} Reference back to this context, so the user can further chain and configure more relationships.
     */
    hasOne(modelCallback) {
        return this.#configureRelationship(modelCallback, "1:1");
    }

    /**
     * Configure a one-to-many relationship between the table represented in this context and related tables.
     * @param {import('./types.js').HasManyCallback<TTableModel>} modelCallback 
     * Property reference callback that is used to configure the relationships.
     * @returns {this} Reference back to this context, so the user can further chain and configure more relationships.
     */
    hasMany(modelCallback) {
        return this.#configureRelationship(modelCallback, "1:n");
    }

    /**
     * Configures a one-to-one or one-to-many relationship (specified by `type`) within the current `table`.
     * @param {import('./types.js').HasOneCallback<TTableModel>|import('./types.js').HasManyCallback<TTableModel>} callback
     * Callback that is of type {@link import('./types.js').HasOneCallback} or {@link import('./types.js').HasManyCallback} which helps the user map the references.
     * @param {"1:1"|"1:n"} type 
     * Specification of whether the relationship configured is a one-to-one (1:1) or one-to-many relationship (1:n).
     * @param {string} table
     * Name of the parent table that is configuring the relationship to.
     * @param {Record<string, import('./types.js').Relationship<TTableModel>>} relationships
     * Relationships belonging to the parent table.
     * @param {string} prependTable
     * String to help create the alias of the related table, which will be used in the command for table references.
     * @param {string} prependColumn
     * String to help create the alias of the related table's columns, which will be used in the command for column references and serialization after querying occurred.
     * @param {import('./types.js').Relationship<TTableModel>?} parentRelationship
     * The relationship information of the parent table.
     * @returns {this} Reference back to this context, so the user can further chain and configure more relationships.
     */
    #configureRelationship(callback, type, table=this._table, relationships=this._relationships, prependTable=`${this._table}_`, prependColumn='', parentRelationship=null) {
        const withKeys = (codeTableName, realTableName, primaryKey, foreignKey) => {
            relationships[codeTableName] = {
                type,
                table: realTableName,
                alias: `__${prependTable}${codeTableName}__`,
                primary: {
                    table,
                    column: primaryKey,
                    alias: `${prependColumn}${primaryKey}`
                },
                foreign: {
                    table: realTableName,
                    column: foreignKey,
                    alias: `${prependColumn}${codeTableName}<|${primaryKey}`
                },
                schema: /** @type {{[K in keyof TTableModel]: import('./schema.js').DescribedSchema}} */ ({}),
                relationships: {},
                constraints: []
            };

            this._promise = this._promise.then(async () => {
                const schema = await this.#describe(realTableName);
                relationships[codeTableName].schema = /** @type {{[K in keyof TTableModel]: import('./schema.js').DescribedSchema}} */ (Object.fromEntries(Object.entries(schema).map(([k,v]) => [v.field, {
                    ...v,
                    table: relationships[codeTableName].alias,
                    alias: `${prependColumn}${codeTableName}<|${v.field}`
                }])));
                
                const scope = this.#getScope();
                const { cmd, args } = this.#adapter.serialize(scope).forConstraints(table);
                const constraints = await this.#adapter.execute(scope).forConstraints(cmd, args);
                if(parentRelationship != null) {
                    parentRelationship.constraints = [...parentRelationship.constraints, ...constraints];
                } else {
                    this._constraints = [...this._constraints, ...constraints];
                }
            });

            const andThat = {
                andThatHasOne: (callback) => {
                    this.#configureRelationship(callback, "1:1", realTableName, relationships[codeTableName].relationships, `${prependTable}${codeTableName}_`, `${prependColumn}${codeTableName}<|`, relationships[codeTableName]);
                    return andThat;
                },
                andThatHasMany: (callback) => {
                    this.#configureRelationship(callback, "1:n", realTableName, relationships[codeTableName].relationships, `${prependTable}${codeTableName}_`, `${prependColumn}${codeTableName}<|`, relationships[codeTableName]);
                    return andThat;
                }
            }
            return andThat;
        };

        const withPrimary = (codeTableName, realTableName, primaryKey) => ({
            withForeign: (foreignKey) => withKeys(codeTableName, realTableName, primaryKey, foreignKey)
        });
        
        const fromTable = (codeTableName, realTableName) => ({
            withPrimary: (primaryKey) => withPrimary(codeTableName, realTableName, primaryKey),
            withKeys: (primaryKey, foreignKey) => withKeys(codeTableName, realTableName, primaryKey, foreignKey)
        });

        const newProxy = () => new Proxy(/** @type {any} */ ({}), {
            get: (t,p,r) => {
                if (typeof(p) === 'symbol') throw new MyORMInvalidPropertyTypeError(p);
                if (p in relationships) throw Error(`A relationship already exists for the table, "${p}"`);
                
                return {
                    fromTable: (realTableName) => fromTable(p, realTableName),
                    withKeys: (primaryKey, foreignKey) => withKeys(p, p, primaryKey, foreignKey),
                    withPrimary: (primaryKey) => withPrimary(p, p, primaryKey)
                }
            }
        });

        callback(newProxy());

        return this;
    }

    /**
     * Create a new proxy to retrieve column data, this covers the behavior when a column is nested within related tables.
     * @param {string=} table 
     * Handled recursively, table (aliased name) that is being checked.
     * @param {((o: import('./types.js').Column) => any)=} callback
     * Callback that can be used to work with the column as it is referenced.
     * @returns {any} Proxy that handles property references on a table.
     */
    #newProxyForColumn(table = this._table, callback=(o) => o, relationships=this._relationships, schema=this._schema, realTableName=this._table){
        if(table === undefined) table = this._table;
        return new Proxy({}, {
            get: (t, p, r) => {
                if (typeof(p) === 'symbol') throw new MyORMInvalidPropertyTypeError(p);
                if (this.#isRelationship(p, relationships)) {
                    return this.#newProxyForColumn(relationships[p].alias, callback, relationships[p].relationships, relationships[p].schema, relationships[p].table);
                }
                if(!(p in schema)) throw new MyORMColumnDoesNotExistError(p, realTableName);
                const { field, alias } = schema[p];
                return callback({
                    table: this.#adapter.syntax.escapeTable(table),
                    column: this.#adapter.syntax.escapeColumn(field),
                    alias: this.#adapter.syntax.escapeColumn(alias),
                    aliasUnescaped: alias
                });
            }
        });
    }

    /**
     * Duplicates this context which would expect to have further updates using the `callback` argument.  
     * 
     * Use this function to maintain a desired state between each context.
     * @param {(ctx: MyORMContext<any, any>) => void} callback 
     * Callback that is used to further configure state after the duplication has occurred.
     * @returns {any}
     * A new context with the altered state.
     */
    #duplicate(callback) {
        /** @type {MyORMContext<any, any>} */
        const ctx = new MyORMContext(this.#adapter, this._table, this.#options);
        ctx._promise = this._promise.then(() => {
            ctx.#emitter = this.#emitter;
            ctx._constraints = this._constraints;
            ctx._schema = this._schema;
            ctx._relationships = this._relationships;
            // state must be deep copied, as the state will be unique to each context created between each clause function
            ctx.#state = deepCopy(this.#state);
            //@ts-ignore `._clone()` is marked private, but is intended to be visible to this class.
            ctx.#state.where = this.#state.where?._clone();
            callback(ctx);
            ctx._schema = this._schema;
        });
        return ctx;
    }

    /**
     * Checks to see if `table` is a relationship with the provided table
     * @param {string} table 
     * Table to check to see if it is a relationship.
     * @param {Record<string, import('./types.js').Relationship<TTableModel>>=} relationships
     * Table to check to see if the argument, `table`, is a relationship with.  
     * If `lastTable` is falsy, or unprovided, then `lastTable` defaults to the main table in this context.
     * @returns {boolean}
     * True if the argument, `lastTable`, with this context has a relationship with `table`, otherwise false.
     */
    #isRelationship(table, relationships = undefined) {
        if (relationships) {
            return table in relationships;
        }
        return table in this._relationships;
    }

    /**
     * 
     * @param {SuccessHandler} callback 
     * @param {EventTypes=} eventType 
     */
    handleSuccess(callback, eventType=undefined) {
        switch(eventType) {
            case EventTypes.DELETE: this.#emitter.onDeleteSuccess(callback); break;
            case EventTypes.INSERT: this.#emitter.onInsertSuccess(callback); break;
            case EventTypes.QUERY: this.#emitter.onQuerySuccess(callback); break;
            case EventTypes.UPDATE: this.#emitter.onUpdateSuccess(callback); break;
            default:
                this.#emitter.onDeleteSuccess(callback);
                this.#emitter.onInsertSuccess(callback);
                this.#emitter.onQuerySuccess(callback);
                this.#emitter.onUpdateSuccess(callback);
        }
        return this;
    }

    onSuccess = this.handleSuccess;

    /**
     * 
     * @param {FailHandler} callback 
     * @param {EventTypes=} eventType 
     */
    handleFail(callback, eventType=undefined) {
        switch(eventType) {
            case EventTypes.DELETE: this.#emitter.onDeleteFail(callback); break;
            case EventTypes.INSERT: this.#emitter.onInsertFail(callback); break;
            case EventTypes.QUERY: this.#emitter.onQueryFail(callback); break;
            case EventTypes.UPDATE: this.#emitter.onUpdateFail(callback); break;
            default:
                this.#emitter.onDeleteFail(callback);
                this.#emitter.onInsertFail(callback);
                this.#emitter.onQueryFail(callback);
                this.#emitter.onUpdateFail(callback);
        }
        return this;
    }

    onFail = this.handleFail;

    /**
     * 
     * @param {WarningHandler} callback 
     */
    handleWarning(callback) {
        this.#emitter.onWarning(callback);
        return this;
    }

    onWarning = this.handleWarning;

    /**
     * Returns a function to be used in a JavaScript `<Array>.map()` function that recursively maps relating records into a single record.
     * @param {any[]} records All records returned from a SQL query.
     * @param {any} record Record that is being worked on (this is handled recursively)
     * @param {string} prepend String to prepend onto the key for the original record's value.
     * @returns {(record: any, n?: number) => TTableModel} Function for use in a JavaScript `<Array>.map()` function for use on an array of the records filtered to only uniques by main primary key.
     */
    #map(records, record=records[0], prepend="", relationships=this._relationships) {
        return (r) => {
            /** @type {any} */
            const mapping = {};
            const processedTables = new Set();
            for(const key in record) {
                if(key.startsWith("$")) {
                    mapping[key] = r[key];
                    continue;
                }
                const [table] = key.split('<|');
                if(processedTables.has(table)) continue;
                processedTables.add(table);
                if(table === key) {
                    if (r[`${prepend}${key}`] != null || prepend == '') {
                        mapping[key] = r[`${prepend}${key}`];
                    }
                } else {
                    const entries = Object.keys(record).map(k => k.startsWith(`${table}<|`) ? [k.replace(`${table}<|`, ""), {}] : [null, null]).filter(([k]) => k != null);
                    const map = this.#map(records, Object.fromEntries(entries), `${prepend}${table}<|`, relationships[table].relationships);
                    if (relationships[table].type === "1:1" || this.#state.groupBy) {
                        const _r = map(r);
                        mapping[table] = Object.keys(_r).length <= 0 ? null : _r;
                    } else {
                        const pKey = relationships[table].primary.alias;
                        const fKey = relationships[table].foreign.alias;
                        mapping[table] = this.#filterForUniqueRelatedRecords(records.filter(_r => r[pKey] === _r[fKey]), table).map(map);
                    }
                }
            }
    
            return mapping;
        }
    }

    /**
     * Serializes a given array of records, `records`, into object notation that a User would expect.
     * @param {any[]} records Records to filter.
     * @returns {TTableModel[]} Records, serialized into objects that a user would expect.
     */
    #serialize(records) {
        if (records.length <= 0) return records;
        const map = this.#map(records);
        // group by is specific where each record returned will be its own result and will not be serialized like normal.
        if(this.#state.groupBy) {
            return records.map(map);
        }
        return this.#filterForUniqueRelatedRecords(records).map(map);
    }

    /**
     * Filters out duplicates of records that have the same primary key.
     * @param {any[]} records Records to filter.
     * @param {string=} table Table to get the primary key from. (default: original table name)
     * @returns {any[]} A new array of records, where duplicates by primary key are filtered out. If no primary key is defined, then `records` is returned, untouched.
     */
    #filterForUniqueRelatedRecords(records, table=this._table) {
        let pKeyInfo = this.#getPrimaryKeyInfo(table);
        if(records === undefined || pKeyInfo.length <= 0) return records;
        const pKeys = pKeyInfo.map(k => k.alias);
        const uniques = new Set();
        return records.filter(r => {
            if(pKeys.filter(k => !(k in r)).length > 0) return true;
            const fullKeyValue = pKeys.map(k => r[k]).join(',');
            if(uniques.has(fullKeyValue)) {
                return false;
            }
            uniques.add(fullKeyValue);
            return true;
        });
    }

    /**
     * 
     * @param {string?} table 
     * @returns {(keyof TTableModel & string)[]}
     */
    #getPrimaryKeys(table=null) {
        return this.#getPrimaryKeyInfo(table).map(col => col.field);
    }

    /**
     * 
     * @param {string?} table 
     * @param {Record<string, import('./types.js').Relationship<TTableModel>>} relationships 
     * @returns {import('./schema.js').DescribedSchema[]}
     */
    #getPrimaryKeyInfo(table = null, relationships = this._relationships) {
        let key = [];
        if (table == null || table === this._table) {
            key = Object.values(this._schema).filter(col => col.isPrimary);
        } else {
            // covers the case where `table` equals the table name as it was declared in related configurations.
            if (table in relationships) {
                return Object.entries(relationships[table].schema).filter(([k,v]) => v.isPrimary).map(([k,v]) => v);
            }
            // covers the case where `table` equals the actual table name as it appears in the database.
            const filtered = Object.values(relationships).filter(o => o.table === table);
            if (filtered.length > 0) {
                return Object.entries(filtered[0].schema).filter(([k,v]) => v.isPrimary).map(([k,v]) => v);
            } else {
                for (const k in relationships) {
                    key = this.#getPrimaryKeyInfo(table, relationships[k].relationships);
                    if(key !== undefined) {
                        return key;
                    }
                }
            }
        }
        return key;
    }

    /**
     * 
     * @param {string?} table 
     * @returns {import('./schema.js').DescribedSchema=}
     */
    #getIdentityKey(table=null) {
        const keys = this.#getPrimaryKeyInfo(table);
        return keys.filter(k => k.isIdentity)[0];
    }

    async #insert(records, table=this._table) {
        const scope = this.#getScope();
        // get an array of all unique columns that are to be inserted.
        const columns = Array.from(new Set(records.flatMap(r => Object.keys(r).filter(k => isPrimitive(r[k])))));
        // map each record so all of them have the same keys, where keys that are not present have a null value.
        const values = records.map(r => Object.values({...Object.fromEntries(columns.map(c => [c,null])), ...Object.fromEntries(Object.entries(r).filter(([k,v]) => isPrimitive(v)))}))
        const { cmd, args }  = this.#adapter.serialize(scope).forInsert({ table, columns, values });

        try {
            const results = await this.#adapter.execute(scope).forInsert(cmd, args);
            this.#emitter.emitInsertSuccess({
                cmd,
                args,
                results
            });

            return results;
        } catch(err) {
            this.#emitter.emitInsertFail({
                cmd,
                args,
                err
            });
            throw err;
        }
    }

    /**
     * 
     * @returns {import("./types.js").AdapterScope}
     */
    #getScope() {
        return { 
            MyORMAdapterError: (msg) => new MyORMAdapterError(msg), 
            Where,
            ErrorTypes: {
                NON_UNIQUE_KEY: () => new MyORMNonUniqueKeyError()
            }
        };
    }

    /**
     * Get the schema of the table. (this will return a promise.)
     */
    get schema() {
        return this._promise.then(() => {
            return this._schema;
        })
    }
}

function isPrimitive(value) {
    return value == null || typeof value !== "object" || value instanceof Date;
}

// Exported types

/** 
 * Callback function on a Connection Pool handled by the emission of when a context sends a command to be executed.
 * @callback SuccessHandler
 * @param {import('./types.js').OnSuccessData} data 
 * Data that was passed from the event emission.
 */

/** 
 * Callback function on a Connection Pool handled by the emission of when a context sends a command and that command fails.
 * @callback FailHandler
 * @param {import('./types.js').OnFailData} data 
 * Data that was passed from the event emission.
 */

/** 
 * Callback function on a Connection Pool handled by the emission of when a context sends a command to be executed.
 * @callback WarningHandler
 * @param {import('./types.js').OnSuccessData} data 
 * Data that was passed from the event emission.
 */