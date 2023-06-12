//@ts-check
import { MyORMInternalError } from "./exceptions.js";
import { deepCopy } from "./util.js";
import { Where, WhereBuilder } from "./where-builder.js";
import * as Types from "./types.js";
import { createPool } from "mysql2/promise";

/**
 * @typedef {object} MyORMOptions
 * @prop {boolean=} allowTruncation
 * Disable protective measures to prevent an accidental truncation of your table through the `.truncate()` function. (default: false)
 * @prop {boolean=} allowUpdateAll
 * Disable protective measures to prevent an accidental update of all records on your table. (default: false)
 */

/**
 * @typedef {object} ContextState
 * @prop {Types.SelectClauseProperty[]} select
 * Columns to retrieve from the database.
 * @prop {[Omit<Omit<Types.FromClauseProperty, "targetTableKey">, "sourceTableKey">, ...Types.FromClauseProperty[]]} from
 * Tables to retrieve columns from in the database. (The first time will always be the main table of the context.)
 * @prop {Types.GroupByClauseProperty[]=} groupBy
 * Columns to group by.
 * @prop {Types.SortByClauseProperty[]=} sortBy
 * Columns to sort by.
 * @prop {number=} limit
 * Number of rows to retrieve.
 * @prop {number=} offset
 * Number of rows to skip before retrieving.
 * @prop {WhereBuilder=} where
 * Builder representing state of the WHERE clause.
 * @prop {boolean=} explicit
 * True if the next update/delete operation should be explicit. False otherwise.
 * @prop {boolean=} negated
 * True if the next `.where()` call should result in a negated condition in the command.
 * @prop {Record<string, Types.Relationship>} relationships
 * Direct relationships from this table.
 */

/**
 * @enum {0|1|2|3|4}
 */
export const EventTypes = {
    QUERY: /** @type {0} */ (0),
    INSERT: /** @type {1} */ (1),
    UPDATE: /** @type {2} */ (2),
    DELETE: /** @type {3} */ (3),
    DESCRIBE: /** @type {4} */ (4)
};

/**
 * @template {Types.AbstractModel} TTableModel
 * @template {Types.AbstractModel} [TAliasModel=Types.OnlyNonAbstractModels<TTableModel>]
 */
export class MyORMContext {
    /** @type {string} */ #table;
    /** @type {{[fieldName: string]: Types.DescribedSchema}} */ #schema;
    /** @type {ContextState} */ #state;
    /** @type {Types.MyORMAdapter<any>} */ #adapter;
    /** @type {MyORMOptions} */ #options;
    /** @type {Promise} */ #promise;

    /**
     * 
     * @param {Types.MyORMAdapter<any>} adapter 
     * @param {string} table 
     * @param {MyORMOptions=} tableOptions 
     */
    constructor(adapter, table, tableOptions={}) {
        this.#adapter = adapter;
        this.#table = table;
        this.#options = {
            allowTruncation: false,
            allowUpdateAll: false,
            ...tableOptions
        };
        this.#state = {
            select: [],
            from: [{
                table,
                alias: table
            }],
            relationships: {}
        }

        this.#promise = this.#describe(table).then(schema => {
            this.#state.select = Object.values(schema).map(f => ({
                column: this.#adapter.syntax.escapeColumn(f.field),
                table: this.#adapter.syntax.escapeTable(f.table),
                alias: this.#adapter.syntax.escapeColumn(f.alias)
            }))
            this.#schema = Object.fromEntries(Object.entries(schema).map(([k,v]) => [v.field, v]));
        });
    }

    /**
     * @template {Types.SelectedColumnsModel<TTableModel>|TAliasModel} [TSelectedColumns=TAliasModel]
     * **Used internally**  
     * Assists with reconstructing the final return type.
     * @param {((model: Types.SpfSelectCallbackModel<TTableModel>) => Types.MaybeArray<keyof TSelectedColumns>)=} modelCallback
     * Used to choose which columns to retrieve from the query.  
     * If nothing is specified, the original aliased representation will be returned.  
     * If a GROUP BY clause has been specified, an error will be thrown.
     * @returns {Promise<(TSelectedColumns extends TAliasModel ? TAliasModel : Types.ReconstructAbstractModel<TTableModel, TSelectedColumns>)[]>}
     */
    async select(modelCallback=undefined) {
        await this.#promise;
        if(modelCallback) {
            if(this.#state.groupBy) throw Error('Cannot choose columns when a GROUP BY clause is present.');
            const selects = /** @type {Types.MaybeArray<Types.SelectClauseProperty>}*/ (/** @type {unknown} */ (modelCallback(this.#newProxyForColumn())));
            this.#state.select = Array.isArray(selects) ? selects : [selects];
        }

        const scope = { MyORMAdapterError: () => Error(), Where };
        const { cmd, args } = this.#adapter.serialize(scope).forQuery({
            select: this.#state.select,
            from: this.#state.from,
            //@ts-ignore `._getConditions` is marked private so the User does not see the function.
            where: this.#state.where?._getConditions(),
            group_by: this.#state.groupBy,
            order_by: this.#state.sortBy,
            limit: this.#state.limit,
            offset: this.#state.offset
        });
        const results = await this.#adapter.execute(scope).forQuery(cmd, args);
        return this.#serialize(results);
    }

    /**
     * @returns {Promise<number>}
     */
    async count() {
        await this.#promise;
        const scope = { MyORMAdapterError: () => Error(), Where };
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
        const result = await this.#adapter.execute(scope).forCount(cmd, args);
        return result;
    }

    async insert(records) {

    }

    async update(records) {

    }

    async delete(records) {

    }

    /**
     * 
     * @param {string} table 
     * Table to describe. 
     * @returns {Promise<{[fieldName: string]: Types.DescribedSchema}>}
    */
    async #describe(table) {
        const { cmd, args } = this.#adapter
            .serialize({ MyORMAdapterError: () => Error(), Where: {} })
            .forDescribe(table);
        const schema = await this.#adapter
            .execute({ MyORMAdapterError: () => Error(), Where: {} })
            .forDescribe(cmd, args);
        
        for(const k in schema) {
            schema[k].alias = schema[k].field;
            schema[k].table = table;
        }
        return schema;
    }

    /**
     * 
     * @param {number} n 
     * @returns {MyORMContext<TTableModel, TAliasModel>}
     */
    take(n) {
        return this.#duplicate(ctx => {
            ctx.#state.limit = n;
        });
    }

    limit = this.take;

    /**
     * 
     * @param {number} n 
     * @returns {MyORMContext<TTableModel, TAliasModel>}
     */
    skip(n) {
        return this.#duplicate(ctx => {
            ctx.#state.offset = n;
        });
    }

    offset = this.skip;

    /**
     * 
     * @param {(model: Types.ChainObject<TTableModel>) => void} modelCallback 
     * @returns {MyORMContext<TTableModel, TAliasModel>}
     */
    where(modelCallback) {
        return this.#duplicate(ctx => {
            const newProxy = (table = ctx.#table, relationships=ctx.#state.relationships, schema=ctx.#schema) => new Proxy({}, {
                get: (t,p,r) => {
                    if (typeof (p) === 'symbol') throw new MyORMInternalError();
                    if (ctx.#isRelationship(p, relationships)) {
                        return newProxy(relationships[p].alias, relationships[p].relationships, relationships[p].schema);
                    }
                    const field = schema[p].field;
                    if(ctx.#state.where) {
                        //@ts-ignore `._append` is marked private so the User does not see the function.
                        return ctx.#state.where._append(field, `AND${ctx.#state.negated ? ' NOT' : ''}`);
                    }

                    relationships
                    return ctx.#state.where = Where(
                        this.#adapter.syntax.escapeColumn(field), 
                        this.#adapter.syntax.escapeTable(table), 
                        ctx.#state.relationships, 
                        `WHERE${ctx.#state.negated ? ' NOT' : ''}`
                    );
                }
            });

            modelCallback(newProxy());
            this.#state.negated = false;
        });
    }

    filter = this.where;

    /**
     * 
     * @param {(model: Types.SortByCallbackModel<TTableModel>) => Types.MaybeArray<Types.SortByClauseProperty>} modelCallback 
     * @returns {MyORMContext<TTableModel, TAliasModel>}
     */
    sortBy(modelCallback) {
        return this.#duplicate(ctx => {
            const sorts = modelCallback(this.#newProxyForColumn(undefined, o => ({
                ...o,
                direction: "ASC",
                asc: () => ({ ...o, direction: "ASC" }),
                desc: () => ({ ...o, direction: "DESC" })
            })));

            ctx.#state.sortBy = Array.isArray(sorts) ? sorts : [sorts];
        });
    }

    sort = this.sortBy;

    /**
     * @template {Types.GroupedColumnsModel<TTableModel>} TGroupedColumns
     * @param {(model: Types.SpfGroupByCallbackModel<TTableModel>, aggregates: Types.Aggregates) => Types.MaybeArray<keyof TGroupedColumns>} modelCallback 
     * @returns {MyORMContext<Types.ReconstructAbstractModel<TTableModel, TGroupedColumns>, Types.ReconstructAbstractModel<TTableModel, TGroupedColumns>>} 
     * A new context with the all previously configured clauses and the updated groupings.
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
                    if(col === undefined) throw new MyORMInternalError();
                    const { table, column, aliasUnescaped } = /** @type {Types.Column} */ (col);
                    const c = aggr === 'COUNT' 
                        ? `COUNT(DISTINCT ${table}.${column})` 
                        : aggr === 'TOTAL' 
                            ? `COUNT(*)` 
                            : `${aggr}(${table}.${column})`;
                    return {
                        table: 'AGGREGATE',
                        column: c,
                        alias: `$${aggr.toLowerCase()}_` + aliasUnescaped,
                        aggregate: aggr
                    }
                };
            };

            const groups = /** @type {Types.MaybeArray<Types.GroupByClauseProperty>} */ (/** @type {unknown} */ (modelCallback(this.#newProxyForColumn(), {
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
     * Specify the columns you would like to select
     * @template {Types.SelectedColumnsModel<TTableModel>} TSelectedColumns
     * @param {(model: Types.SpfSelectCallbackModel<TTableModel>) => Types.MaybeArray<keyof TSelectedColumns>} modelCallback
     * @returns {MyORMContext<TTableModel, Types.ReconstructAbstractModel<TTableModel, TSelectedColumns>>} 
     * A new context with the all previously configured clauses and the updated groupings.
     */
    choose(modelCallback) {
        if(this.#state.groupBy) throw Error('Cannot choose columns when a GROUP BY clause is present.');

        return this.#duplicate(ctx => {
            const selects = /** @type {Types.MaybeArray<Types.SelectClauseProperty>}*/ (/** @type {unknown} */ (modelCallback(this.#newProxyForColumn())));
            ctx.#state.select = Array.isArray(selects) ? selects : [selects];
        });
    }

    /**
     * 
     * @param {Types.HasOneCallback<TTableModel>} modelCallback 
     * @returns {this}
     */
    hasOne(modelCallback) {
        return this.#configureRelationship(modelCallback, "1:1");
    }

    /**
     * 
     * @param {Types.HasManyCallback<TTableModel>} modelCallback 
     * @returns {this}
     */
    hasMany(modelCallback) {
        return this.#configureRelationship(modelCallback, "1:n");
    }

    /**
     * @param {Types.HasOneCallback<TTableModel>|Types.HasManyCallback<TTableModel>} callback
     * @param {"1:1"|"1:n"} type 
     * @param {string} table
     * @param {Record<string, Types.Relationship>} relationships
     * @param {string} prependTable
     * @param {string} prependColumn
     */
    #configureRelationship(callback, type, table=this.#table, relationships=this.#state.relationships, prependTable=`${this.#table}_`, prependColumn='') {
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
                    alias: `${prependColumn}${realTableName}<|${primaryKey}`
                },
                schema: {},
                relationships: {}
            };

            this.#promise = this.#promise.then(async () => {
                const schema = await this.#describe(realTableName);
                relationships[codeTableName].schema = Object.fromEntries(Object.entries(schema).map(([k,v]) => [v.field, {
                    ...v,
                    table: relationships[codeTableName].alias,
                    alias: `${prependColumn}${codeTableName}<|${v.field}`
                }]));
            });

            return {
                andThatHasOne: (callback) => this.#configureRelationship(callback, "1:1", realTableName, relationships[codeTableName].relationships, `${prependTable}${codeTableName}_`, `${prependColumn}${codeTableName}<|`),
                andThatHasMany: (callback) => this.#configureRelationship(callback, "1:n", realTableName, relationships[codeTableName].relationships, `${prependTable}${codeTableName}_`, `${prependColumn}${codeTableName}<|`)
            }
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
                if (typeof(p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
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
     * 
     * Specify the columns you would like to select
     * @template {Types.IncludedColumnsModel<TTableModel>} TIncludedColumn
     * @param {(model: {[K in keyof import("./types.js").OnlyAbstractModelTypes<TTableModel>]: Types.ThenIncludeCallback<import("./types.js").OnlyAbstractModelTypes<TTableModel>[K], K>}) => void} modelCallback
     * @returns {MyORMContext<TTableModel, TAliasModel & {[K in keyof TIncludedColumn as K extends keyof TTableModel ? K : never]: Exclude<TTableModel[K], undefined>}>} 
     * A new context with the all previously configured clauses and the updated groupings.
     */
    include(modelCallback) {
        return this.#duplicate(ctx => {
            const newProxy = (table=ctx.#table, relationships=ctx.#state.relationships) => new Proxy(/** @type {any} */({}), {
                get: (t,p,r) => {
                    if (typeof(p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
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
                        table: col.table,
                        column: ctx.#adapter.syntax.escapeColumn(col.field),
                        alias: col.alias
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
     * @param {string=} table 
     * @param {((o: Types.Column) => any)=} callback
     * @returns {any}
     */
    #newProxyForColumn(table = this.#table, callback=(o) => o, relationships=this.#state.relationships, schema=this.#schema){
        if(table === undefined) table = this.#table;
        return new Proxy({}, {
            get: (t, p, r) => {
                if (typeof(p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
                if (this.#isRelationship(p, relationships)) {
                    return this.#newProxyForColumn(relationships[p].alias, callback, relationships[p].relationships, relationships[p].schema);
                }
                if(!(p in schema)) throw Error(`${p} is not a field in the table, ${table}.`);
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
        const ctx = new MyORMContext(this.#adapter, this.#table, this.#options);
        ctx.#promise = this.#promise.then(() => {
            ctx.#state = { ...this.#state };
            ctx.#state.relationships = deepCopy(this.#state.relationships);
            callback(ctx);
            ctx.#schema = this.#schema;
            ctx.#state = { ...this.#state, ...ctx.#state };
        });
        return ctx;
    }

    /**
     * Checks to see if `table` is a relationship with the provided table
     * @param {string} table 
     * Table to check to see if it is a relationship.
     * @param {Record<string, Types.Relationship>=} relationships
     * Table to check to see if the argument, `table`, is a relationship with.  
     * If `lastTable` is falsy, or unprovided, then `lastTable` defaults to the main table in this context.
     * @returns {boolean}
     * True if the argument, `lastTable`, with this context has a relationship with `table`, otherwise false.
     */
    #isRelationship(table, relationships = undefined) {
        if (relationships) {
            return table in relationships;
        }
        return table in this.#state.relationships;
    }
    
    /**
     * Set the context to explicitly update or delete using manually built clauses.
     * @returns {this}
     */
    get explicitly() {
        this.#state.explicit = true;
        return this;
    }

    /**
     * Set the context to implicitly update or delete using primary keys defined on the table.
     * @returns {this}
     */
    get implicitly() {
        this.#state.explicit = false;
        return this;
    }

    /**
     * 
     * @param {*} callback 
     * @param {EventTypes} eventType 
     */
    handleSuccess(callback, eventType) {
        
    }

    /**
     * 
     * @param {*} callback 
     * @param {EventTypes} eventType 
     */
    handleFail(callback, eventType) {

    }

    /**
     * 
     * @param {*} callback 
     * @param {EventTypes} eventType 
     */
    handleWarning(callback, eventType) {

    }

    /**
     * Returns a function to be used in a JavaScript `<Array>.map()` function that recursively maps relating records into a single record.
     * @param {any[]} records All records returned from a SQL query.
     * @param {any} record Record that is being worked on (this is handled recursively)
     * @param {string} prepend String to prepend onto the key for the original record's value.
     * @returns {(record: any, n?: number) => TTableModel} Function for use in a JavaScript `<Array>.map()` function for use on an array of the records filtered to only uniques by main primary key.
     */
    #map(records, record=records[0], prepend="", relationships=this.#state.relationships) {
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
                        mapping[table] = this.#filterForUniqueRelatedRecords(records.filter(_r => r[`${prepend}${pKey}`] === _r[`${prepend}${table}<|${fKey}`]), table, `${prepend}${table}<|`).map(map);
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
     * @param {string=} prepend String to prepend onto the primary key when referencing a record in the array of records (default: '') 
     * @returns {any[]} A new array of records, where duplicates by primary key are filtered out. If no primary key is defined, then `records` is returned, untouched.
     */
    #filterForUniqueRelatedRecords(records, table=this.#table, prepend='') {
        let pKey = this.#getPrimaryKey(table);
        if(records === undefined || pKey === undefined) return records;
        pKey = prepend + pKey;
        const uniques = new Set();
        return records.filter(r => {
            if(pKey === undefined || !(pKey in r)) return true;
            if(uniques.has(r[pKey])) {
                return false;
            }
            uniques.add(r[pKey]);
            return true;
        });
    }

    #getPrimaryKey(table, relationships=this.#state.relationships) {
        let key = undefined;
        if(table == null || table === this.#table) {
            for(const k in this.#schema) {
                const col = this.#schema[k];
                if(col.isPrimary) {
                    key = col.field;
                }
            }
        } else {
            for (const col in relationships) {
                if(relationships[col].table !== table) {
                    const key = this.#getPrimaryKey(relationships[col].table, relationships[col].relationships);
                    if(key) {
                        break;
                    }
                }
            }
        }
        return key;
    }
}

/**
 * Reduces all of the conditions built in `MyORM` to a single clause.
 * @param {Types.WhereClausePropertyArray=} conditions
 * Conditions to reduce to a clause.
 * @param {string} table
 * If specified, will only reduce conditions that belong to the specified table. (default: empty string or all conditions)
 * @param {(n: number) => string} sanitize
 * Function used to convert values to sanitized strings. (default: (n) => `?`.)
 * @returns {{cmd: string, args: Types.SQLPrimitive[]}}
 * string and array of SQL primitives to be concatenated onto the full query string and arguments.
 */
export function handleWhere(conditions, table="", sanitize=(n) => `?`) {
    if(!conditions) return { cmd: '', args: [] };
    let args = [];

    // function to filter out conditions that do not belong to table.
    const mapFilter = (x) => {
        if(Array.isArray(x)) {
            const filtered = x.map(mapFilter).filter(x => x !== undefined);
            return filtered.length > 0 ? filtered : undefined;
        }
        if(x.property.includes(table)) {
            return x;
        }
        return undefined;
    }

    // function to reduce each condition to one appropriate clause string.
    const reduce = (a, b, depth=0) => {
        const tabs = Array.from(Array(depth + 2).keys()).map(_ => `\t`).join('');
        if(Array.isArray(b)) {
            const [x, ...remainder] = b;
            args.push(x.value);
            return `${a} ${remainder.reduce((a,b) => reduce(a,b,depth+1), `${x.chain} (${x.table}.${x.property} ${x.operator} ${sanitize(args.length)}`) + `)\n${tabs}`}`;
        }
        args.push(b.value);
        return a + `${b.chain} ${b.table}.${b.property} ${b.operator} ${sanitize(args.length)}\n${tabs}`;
    };
    
    // map the array, filter out undefineds, then reduce the array to get the clause.
    /** @type {string} */
    const reduced = conditions.map(mapFilter).filter(x => x !== undefined).reduce(reduce, '');
    return {
        // if a filter took place, then the WHERE statement of the clause may not be there, so we replace.
        cmd: reduced.startsWith("WHERE") 
            ? reduced.trimEnd()
            : reduced.startsWith("AND") 
                ? reduced.replace("AND", "WHERE").trimEnd() 
                : reduced.replace("OR", "WHERE").trimEnd(),
        // arguments was built inside the reduce function.
        args
    };
}

// MySQL adapter @TODO move to own repo.

/** @type {Types.InitializeAdapterCallback<import('mysql2/promise.js').Pool>} */
function adapter(config) {
    return {
        options: { },
        syntax: {
            escapeColumn: (s) => `\`${s}\``,
            escapeTable: (s) => `\`${s}\``
        },
        execute(scope) {
            return {
                async forQuery(cmd, args) {
                    console.log(cmd, args);
                    const [results] = await config.query(cmd, args);
                    console.log({results});
                    return /** @type {any} */ (results);
                },
                async forCount(cmd, args) {
                    console.log(cmd, args);
                    const [results] = await config.query(cmd, args);
                    return /** @type {any} */ (results[0].$$count);
                },
                async forInsert(cmd, args) {
                    return [];
                },
                async forUpdate(cmd, args) {
                    return 0;
                },
                async forDelete(cmd, args) {
                    return 0;
                },
                async forDescribe(cmd, args) {
                    const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await config.execute(cmd, args));
                    /** @type {{[fieldName: string]: import("./types.js").DescribedSchema}} */
                    let set = {}
                    for(const field in result) {
                        set[field] = {
                            field: result[field].Field,
                            table: "",
                            alias: "",
                            isPrimary: result[field].Key === "PRI",
                            isIdentity: result[field].Extra === "auto_increment",
                            defaultValue: result[field].Default
                        };
                    }
                    return set;
                }
            }
        },
        serialize() {
            return {
                forQuery(data) {
                    let cmd = '';
                    let args = [];
                    let { where, group_by, order_by, limit, offset, select, from } = data;
                    const [main, ...fromJoins] = from;
                    
                    cmd += `SELECT ${select.map(prop => `${"aggregate" in prop ? "" : prop.table}${"aggregate" in prop ? "" : "."}${prop.column} AS ${prop.alias}`).join('\n\t\t,')}`;
                    
                    const limitStr = limit != undefined ? `LIMIT ${limit}` : '';
                    const offsetStr = limit != undefined && offset != undefined ? `OFFSET ${offset}` : '';
                    cmd += `\n\tFROM ${main.table} AS ${main.alias}`;
                    // if a limit or offset was specified, and an join is expected, then a nested query should take place of the first table.
                    if(limit && from.length > 1) {
                        const whereInfo = handleWhere(where, main.table);
                        cmd += `\n\t\tLEFT JOIN (SELECT * FROM ${main.table} ${whereInfo.cmd} ${limitStr} ${offsetStr}) AS ${from[0].alias}`;
                        args = [...args, ...whereInfo.args];
                    }
                    
                    cmd += `\n\t\tLEFT JOIN ` + fromJoins.map(table => `${table.table} AS ${table.alias}\n\t\t\tON ${table.sourceTableKey.table}.${table.sourceTableKey.column} = ${table.targetTableKey.table}.${table.targetTableKey.column}`)
                        .join('\n\t\tLEFT JOIN ');
                    const whereInfo = handleWhere(where);
                    cmd += `\n\t${whereInfo.cmd}`;
                    args = [...args, ...whereInfo.args];
                    // the inverse happens from above. If a limit or offset was specified but only one table is present, then we will add the strings.
                    if(limit && from.length <= 1) {
                        cmd += limitStr;
                        cmd += offsetStr;
                    }

                    if(group_by) {
                        cmd += '\n\tGROUP BY ' + group_by.map(prop => prop.alias).join('\n\t\t,');
                    }

                    if(order_by) {
                        cmd += '\n\tORDER BY ' + order_by.map(prop => prop.alias).join('\n\t\t,');
                    }

                    return { cmd, args };
                },
                forCount(data) {
                    let cmd = '';
                    let args = [];
                    let { where, group_by, order_by, limit, offset, select, from } = data;
                    const [main, ...fromJoins] = from;
                    
                    cmd += `SELECT COUNT(*) AS $$count`;
                    
                    const limitStr = limit != undefined ? `LIMIT ${limit}` : '';
                    const offsetStr = limit != undefined && offset != undefined ? `OFFSET ${offset}` : '';
                    // if a limit or offset was specified, and an join is expected, then a nested query should occur in place of the first table.
                    if(limit && from.length > 1) {
                        const whereInfo = handleWhere(where, main.table);
                        cmd += `\n\t\tFROM (SELECT * FROM ${main.table} ${whereInfo.cmd} ${limitStr} ${offsetStr}) AS ${main.alias}`;
                        args = [...args, ...whereInfo.args];
                    } else {
                        cmd += `\n\tFROM ${main.table} AS ${main.alias}`;
                    }
                    
                    if(fromJoins && fromJoins.length > 0) {
                        cmd += `\n\t\tLEFT JOIN ` + fromJoins.map(table => `${table.table} AS ${table.alias}\n\t\t\tON ${table.sourceTableKey.table}.${table.sourceTableKey.column} = ${table.targetTableKey.table}.${table.targetTableKey.column}`)
                            .join('\n\t\tLEFT JOIN ');
                    }
                    const whereInfo = handleWhere(where);
                    cmd += `\n\t${whereInfo.cmd}`;
                    args = [...args, ...whereInfo.args];
                    // the inverse happens from above. If a limit or offset was specified but only one table is present, then we will add the strings.
                    if(limit && from.length <= 1) {
                        cmd += limitStr;
                        cmd += offsetStr;
                    }

                    if(group_by) {
                        cmd += '\n\tGROUP BY ' + group_by.map(prop => prop.alias).join('\n\t\t,');
                    }

                    if(order_by) {
                        cmd += '\n\tORDER BY ' + order_by.map(prop => prop.alias).join('\n\t\t,');
                    }

                    return { cmd, args };
                },
                forInsert(data) {
                    return { cmd: "", args: [] };
                },
                forUpdate(data) {
                    return { cmd: "", args: [] };
                },
                forDelete(data) {
                    return { cmd: "", args: [] };
                },
                forDescribe(table) {
                    return { cmd: `DESCRIBE ${table};`, args: [] };
                }
            }
        }
    }
}

/**
 * @typedef {object} TestModel
 * @prop {number} x
 * @prop {string} y
 * @prop {boolean} z
 * @prop {Foo=} foo
 * @prop {Bar=} bar
 */

/**
 * @typedef {object} Foo
 * @prop {number} a
 * @prop {string} b
 * @prop {boolean} c
 * @prop {Bar=} bar
 */

/**
 * @typedef {object} Bar
 * @prop {number} d
 * @prop {string} e
 * @prop {boolean} f
 * @prop {Biz=} biz
 */

/**
 * @typedef {object} Biz
 * @prop {number} g
 */

const pool = createPool({
    database: 'chinook',
    host: 'localhost',
    user: 'root',
    password: 'root',
    port: 3306
});

/**
 * @typedef {object} Track
 * @prop {number} TrackId
 * @prop {string} Name
 * @prop {number} AlbumId
 * @prop {import("../../../.github/chinook-setup/chinook-types.js").Album=} Album
 * @prop {number} MediaTypeId
 * @prop {import("../../../.github/chinook-setup/chinook-types.js").MediaType=} MediaType
 * @prop {number} GenreId
 * @prop {import("../../../.github/chinook-setup/chinook-types.js").Genre=} Genre
 * @prop {string=} Composer
 * @prop {import("../../../.github/chinook-setup/chinook-types.js").Artist=} Artist
 * @prop {number} Milliseconds
 * @prop {number} Bytes
 * @prop {number} UnitPrice
 */

/** @type {MyORMContext<Track>} */
const ctx = new MyORMContext(adapter(pool), "Track");

ctx.hasOne(m => m.Album.withKeys("AlbumId", "AlbumId")
        .andThatHasOne(m => m.Artist.withKeys("ArtistId", "ArtistId")))
    .hasOne(m => m.Genre.withKeys("GenreId", "GenreId"));

ctx.include(m => m.Album
        .thenInclude(m => m.Artist))
    .include(m => m.Genre)
    .choose(m => [m.TrackId, m.Name, m.Genre.Name])
    .where(m => m.Album.Artist.Name.equals("AC/DC"))
    .select().then(m => {
        console.log(JSON.stringify(m, undefined, 2));
    });