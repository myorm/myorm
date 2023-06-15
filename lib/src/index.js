//@ts-check
import { MyORMInternalError, MyORMSyntaxError } from "./exceptions.js";
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
 * @template {SqlTable} T 
 * Model representing the raw table in SQL.
 * @template {SqlTable} U 
 * Model representing the table how it is worked on in `MyORM`.
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
 * @prop {Record<string, Types.Relationship<T>>} relationships
 * Direct relationships from this table.
 * @prop {((t: U) => T)=} mapBack 
 * Mapping function used to map aliased records to the raw table models.
 * @prop {((t: T) => U)=} mapForward 
 * Mapping function used to map raw table records to the aliased version.
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
 * @template {Types.SqlTable} TTableModel
 * @template {Types.SqlTable} [TAliasModel=Types.OnlyNonSqlTables<TTableModel>]
 */
export class MyORMContext {
    /** @type {string} */ #table;
    /** @type {{[K in keyof TTableModel]: Types.DescribedSchema}} */ #schema;
    /** @type {Types.ConstraintData[]} */ #constraints;
    /** @type {ContextState<TTableModel, TAliasModel>} */ #state;
    /** @type {MyORMAdapter<any>} */ #adapter;
    /** @type {MyORMOptions} */ #options;
    /** @type {Promise} */ #promise;
    /** @type {(model: Types.OnlyNonSqlTables<TTableModel>) => any} */ #identification;

    /**
     * 
     * @param {MyORMAdapter<any>} adapter 
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
            relationships: {},
        }

        this.#promise = this.#describe(table).then(async schema => {
            this.#state.select = Object.values(schema).map(f => ({
                column: this.#adapter.syntax.escapeColumn(f.field),
                table: this.#adapter.syntax.escapeTable(f.table),
                alias: this.#adapter.syntax.escapeColumn(f.alias)
            }));
            this.#schema = /** @type {{[K in keyof TTableModel]: Types.DescribedSchema}} */ (Object.fromEntries(Object.entries(schema).map(([k,v]) => [v.field, v])));
            const scope = { MyORMAdapterError: Error, Where };
            const { cmd, args } = this.#adapter.serialize(scope).forConstraints(table);
            this.#constraints = await this.#adapter.execute(scope).forConstraints(cmd, args);
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
     * @returns {Promise<(TSelectedColumns extends TAliasModel ? TAliasModel : Types.ReconstructSqlTable<TTableModel, TSelectedColumns>)[]>}
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
        return /** @type {any} */ (this.#serialize(results));
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

    /**
     * 
     * @param {Types.MaybeArray<TTableModel>} records
     * @returns {Promise<TTableModel[]>}
     */
    async insert(records) {
        if (records === undefined) return [];
        records = Array.isArray(records) ? records : [records];
        if (records.length <= 0) return [];
        // Map the records back to their original Table representation, just so MyORM can correctly work with it.
        await this.#promise;
        const pKey = this.#getPrimaryKey();
        if(pKey !== undefined && this.#identification != null) {
            records.forEach(r => {
                r[pKey] = this.#identification(r);
            });
        }
        const order = this.#getOrderOfInsertion();
        const prepared = this.#deserialize(records);
        // if cascading is false, then delete all keys from prepared where the table is not `this.#table`.
        for(const table of order) {
            if(table in prepared) {
                const insertIds = await this.#insert(prepared[table], table);
                const pKey = this.#getPrimaryKey(table);
                prepared[table].forEach((r, n) => {
                    if(pKey !== undefined && this.#isIdentityKey(pKey)) {
                        r[pKey] = insertIds[n];
                    }
                });
                console.log(JSON.stringify(prepared, undefined, 2));
            }
        }
        return records;
    }

    /**
     * Get the order of insertion where cascading is involved.
     * @param {Set<string>} processedConstraints 
     * Constraints that have already been processed. (this works throughout the entire recursive process)
     * @param {string} table 
     * Table that is being checked for constraints.
     * @param {Record<string, Types.Relationship<TTableModel>>} relationships 
     * All relationships belonging to `table`.
     * @param {Types.ConstraintData[]} constraints
     * All constraints belonging to `table`. 
     * @returns {string[]} Array of strings in the order of how insertion should occur. Each string represents the table that should be inserted on. (real table name as it shows in the database)
     */
    #getOrderOfInsertion(processedConstraints=new Set(), table=this.#table, relationships=this.#state.relationships, constraints=this.#constraints) {
        let order = [];
        processedConstraints.add(table);
        for(const constraint of constraints) {
            if(processedConstraints.has(constraint.refTable)) {
                order.push(constraint.refTable);
                continue;
            }
            if(constraint.refTable in relationships) {
                order = order.concat(this.#getOrderOfInsertion(processedConstraints, 
                    constraint.refTable, 
                    relationships[constraint.refTable].relationships, 
                    relationships[constraint.refTable].constraints)
                );
            }
        }
        for(const key in relationships) { 
            const relationship = relationships[key];
            if(processedConstraints.has(relationship.table)) {
                continue;
            }
            order = order.concat(this.#getOrderOfInsertion(processedConstraints,
                relationship.table,
                relationship.relationships,
                relationship.constraints)
            );
        }
        order.push(table);
        return order.filter((v,n,self) => self.indexOf(v) === n);
    }

    /**
     * Deserialize `records` into an array of records for only the specified table.
     * @param {TTableModel[]} records 
     * @param {string} table
     * @returns {Record<string, Types.SqlTable[]>} Object containing table names as the properties to an array of records prepared for inserting into database.
     */
    #deserialize(records, table=this.#table, relationships=this.#state.relationships, schema=this.#schema) {
        if(records == undefined || records.length <= 0) return {};
        /** @type {Record<string, Types.SqlTable[]>} */
        let tables = { [table]: records.map(r => {
            /** @type {any} */
            let o = {};
            for(const key in r) {
                if(key in schema) {
                    o[key] = r[key];
                }
            }
            return o;
        })};
        const allDistinctKeys = Array.from(new Set(records.flatMap(r => Object.keys(r))));
        for(const key of allDistinctKeys) {
            if(key in relationships) {
                if(relationships[key].type === "1:1") {
                    tables = { 
                        ...this.#deserialize(records.map(r => r[key]).filter(o => o != undefined), 
                            relationships[key].table, 
                            relationships[key].relationships, 
                            relationships[key].schema), 
                        ...tables 
                    };
                } else {
                    tables = { 
                        ...this.#deserialize(records.flatMap(r => r[key]).filter(o => o != undefined), 
                            relationships[key].table, 
                            relationships[key].relationships, 
                            relationships[key].schema), 
                        ...tables 
                    };
                }
            }
        }
        return tables;
    }

    async #insert(records, table=this.#table) {
        const scope = { MyORMAdapterError: () => Error(), Where };
        // get an array of all unique columns that are to be inserted.
        const columns = Array.from(new Set(records.flatMap(r => Object.keys(r).filter(k => r[k] == null || typeof r[k] !== "object" || r[k] instanceof Date))));
        // map each record so all of them have the same keys, where keys that are not present have a null value.
        const values = records.map(r => Object.values({ ...Object.fromEntries(columns.map(c => [c,null])), ...r }));
        const { cmd, args } = this.#adapter.serialize(scope).forInsert({ table, columns, values });
        return await this.#adapter.execute(scope).forInsert(cmd, args);
    }

    /**
     * Update an array of records
     * @param {Types.MaybeArray<TTableModel>|((m: TTableModel) => Partial<TTableModel>|undefined)} records  
     * 
     * @returns {Promise<number>}
     */
    async update(records) {
        if(records === undefined) return 0;
        await this.#promise;
        const scope = { MyORMAdapterError: () => Error(), Where };
        const pKey = this.#getPrimaryKey();
        // the user is explicitly telling MyORM what columns/values to set.
        if (typeof records === 'function') {
            if (this.#state.where === undefined) {
                throw new MyORMSyntaxError("No WHERE clause was provided, possibly resulting in an update to all records.");
            }
            let columns = [];
            let values = [];
            // user can either do value sets (e.g., `m.Column = 12`) or return an object. If an object is returned, then `o` takes precedence.
            const newProxy = () => new Proxy(/** @type {any} */({}), {
                set: (t,p,v) => {
                    // Ignore changes to primary keys.
                    if(pKey === p) return false;
                    // Only change columns that are within the schema.
                    if(!(p in this.#schema)) return false;
                    columns.push(p);
                    values.push(v);
                    return true;
                }
            });
            let o = records(newProxy());
            // sets through returned object.
            if(o !== undefined) {
                o = /** @type {Partial<TTableModel>} */ (Object.fromEntries(Object.entries(o).filter(([k,v]) => k !== pKey))); 
                columns = Object.keys(o);
                values = Object.values(o);
            }

            //@ts-ignore ._getConditions is marked private, but is available for use within this context.
            const whereConditions = this.#state.where._getConditions();
            // sets through explicit set values from proxy. 
            const { cmd, args } = this.#adapter.serialize(scope).forUpdate({
                table: this.#table,
                columns,
                where: whereConditions,
                explicit: {
                    values
                }
            });
            return await this.#adapter.execute(scope).forUpdate(cmd, args);
        }
        // Otherwise, user passed in a record or an array of records that are to be updated via their primary key.
        records = Array.isArray(records) ? records : [records];
        if(records.length <= 0) return 0;
        if (pKey === undefined) {
            throw new MyORMSyntaxError(`No primary key exists on ${this.#table}. Use the explicit version of this update by passing a callback instead.`);
        }
        if (records.filter(r => pKey in r).length != records.length) {
            throw new MyORMSyntaxError(`One or more records do not have a primary key to update off of. You can turn this warning off in the options object in the constructor.`);
        }
        
        // get the columns that are to be updated.
        const columns = records
            .flatMap(r => Object.keys(r)
                .filter((k) => r[k] == null || typeof r[k] !== "object" || r[k] instanceof Date))
                .filter((k, n, self) => self.indexOf(k) === n)
            .filter(k => k !== pKey); // ignore primary key changes.
        
        // add a WHERE statement so the number of rows affected returned matches the actual rows affected, otherwise it will "affect" all rows.
        const where = Where(pKey, this.#table, this.#state.relationships);
        where.in(records.map(r => r[pKey]));
        //@ts-ignore ._getConditions is marked private, but is available for use within this context.
        const whereConditions = where._getConditions();

        const { cmd, args } = this.#adapter.serialize(scope).forUpdate({
            table: this.#table,
            columns,
            where: whereConditions,
            implicit: {
                primaryKey: pKey,
                objects: records
            }
        });
        return await this.#adapter.execute(scope).forUpdate(cmd, args);
    }

    /**
     * Update 
     * @param {Types.MaybeArray<TAliasModel>=} records 
     * @returns {Promise<number>}
     */
    async delete(records=undefined) {
        await this.#promise;
        const scope = { MyORMAdapterError: () => Error(), Where };
        if (records === undefined) {
            if (this.#state.where === undefined) {
                throw new MyORMSyntaxError("No WHERE clause was provided, possibly resulting in an update to all records.");
            }
            //@ts-ignore ._getConditions is marked private, but is available for use within this context.
            const whereConditions = this.#state.where._getConditions();
            const { cmd, args } = this.#adapter.serialize(scope).forDelete({
                table: this.#table,
                where: whereConditions
            });
            return await this.#adapter.execute(scope).forDelete(cmd, args);
        }
        const pKey = this.#getPrimaryKey();
        records = Array.isArray(records) ? records : [records];
        if (records.length <= 0) return 0;
        if (pKey === undefined) {
            throw new MyORMSyntaxError(`No primary key exists on ${this.#table}. Use the explicit version of this update by passing a callback instead.`);
        }
        if (records.filter(r => pKey in r).length != records.length) {
            throw new MyORMSyntaxError(`One or more records do not have a primary key to update off of. You can turn this warning off in the options object in the constructor.`);
        }

        // add a WHERE statement so the number of rows affected returned matches the actual rows affected, otherwise it will "affect" all rows.
        const where = Where(pKey, this.#table, this.#state.relationships);
        where.in(records.map(r => r[pKey]));
        //@ts-ignore ._getConditions is marked private, but is available for use within this context.
        const whereConditions = where._getConditions();

        const { cmd, args } = this.#adapter.serialize(scope).forDelete({
            table: this.#table,
            where: whereConditions
        });
        return await this.#adapter.execute(scope).forDelete(cmd, args);
    }

    async truncate() {
        await this.#promise;
        const scope = { MyORMAdapterError: () => Error(), Where };
        const { cmd, args } = this.#adapter.serialize(scope).forTruncate({ table: this.#table });
        return this.#adapter.execute(scope).forTruncate(cmd, args);
    }

    /**
     * 
     * @param {string} table 
     * Table to describe. 
     * @returns {Promise<{[fieldName: string]: Types.DescribedSchema}>}
    */
    async #describe(table) {
        const { cmd, args } = this.#adapter
            .serialize({ MyORMAdapterError: () => Error(), Where })
            .forDescribe(table);
        const schema = await this.#adapter
            .execute({ MyORMAdapterError: () => Error(), Where })
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
     * Synonym: `.map()`
     * 
     * This function essentially uses the `modelCallback` you provide to map the results before they are returned back to you.  
     * 
     * __NOTE: Aliasing does **NOT** make change how clause building works. Clause building will **ONLY** work on the original column name from the table. Aliasing only takes place when directly
     * interacting with your records (e.g., `.select()`, `.insert()`, `.update()`, and `.delete()`.__
     * 
     * __NOTE: It is assumed that you are aliasing non-null variables, so if you attempt to insert, 
     * then the created command will fail if you do not have these variables present. The same goes for updating/deleting on records without primary keys and no where clause was built.__
     * 
     * See https://github.com/traviszuleger/myorm#aliasing for more documentation
     * @template {Types.SqlTable} TAliasedType 
     * Aliased type that is derived from the return value of `aliasModelCallback`.
     * @template {{[K in keyof TTableModel]-?: TTableModel[K]}} [TRequiredModel={[K in keyof TTableModel]-?: TTableModel[K]}]
     * @param {((model: TRequiredModel) => TAliasedType)} aliasModelCallback 
     * Callback that should return an object that would represent your desired aliased type.
     * @returns {MyORMContext<TTableModel, TAliasedType>} 
     * A new context with the all previously configured clauses and the updated alias type.
     */
    alias(aliasModelCallback) {
        return this.#duplicate((ctx) => {
            // @ts-ignore This is being assigned to this here because it is meant to be transferred to the new context.
            ctx.#state.mapForward = aliasModelCallback;
            const newProxy = (table = "") =>
                new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if(typeof p === "symbol") throw new MyORMInternalError();
                        if (p in ctx.#state.relationships) {
                            if (!table.endsWith(`${String(p)}.`)) {
                                table = `${table}${String(p)}.`;
                            }
                            if (ctx.#state.relationships[p].type === "1:n") {
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

    /**
     * 
     * @param {(model: Types.OnlyNonSqlTables<TTableModel>) => SQLPrimitive} callback 
     * @returns {this}
     */
    identify(callback) {
        this.#identification = callback;
        return this;
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
     * @param {(model: Types.SortByCallbackModel<TTableModel>) => Types.MaybeArray<Types.SortByClauseProperty|Types.SortByCallbackModelProp>} modelCallback 
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

            ctx.#state.sortBy = /** @type {import("./types.js").SortByClauseProperty[]} */ (Array.isArray(sorts) ? sorts : [sorts]);
        });
    }

    sort = this.sortBy;

    /**
     * @template {Types.GroupedColumnsModel<TTableModel>} TGroupedColumns
     * @param {(model: Types.SpfGroupByCallbackModel<TTableModel>, aggregates: Types.Aggregates) => Types.MaybeArray<keyof TGroupedColumns>} modelCallback 
     * @returns {MyORMContext<Types.ReconstructSqlTable<TTableModel, TGroupedColumns>, Types.ReconstructSqlTable<TTableModel, TGroupedColumns>>} 
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
                    if(aggr === "TOTAL") return {
                        table: 'AGGREGATE',
                        column: 'COUNT(*)',
                        alias: `$total`,
                        aggregate: aggr
                    }
                    if(col === undefined) throw new MyORMInternalError();
                    const { table, column, aliasUnescaped } = /** @type {Types.Column} */ (col);
                    const c = aggr === 'COUNT' 
                        ? `COUNT(DISTINCT ${table}.${column})` 
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
     * @returns {MyORMContext<TTableModel, Types.ReconstructSqlTable<TTableModel, TSelectedColumns>>} 
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
     * @param {Record<string, Types.Relationship<TTableModel>>} relationships
     * @param {string} prependTable
     * @param {string} prependColumn
     * @param {Types.Relationship<TTableModel>?} parentRelationship
     */
    #configureRelationship(callback, type, table=this.#table, relationships=this.#state.relationships, prependTable=`${this.#table}_`, prependColumn='', parentRelationship=null) {
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
                schema: /** @type {{[K in keyof TTableModel]: Types.DescribedSchema}} */ ({}),
                relationships: {},
                constraints: []
            };

            this.#promise = this.#promise.then(async () => {
                const schema = await this.#describe(realTableName);
                relationships[codeTableName].schema = /** @type {{[K in keyof TTableModel]: Types.DescribedSchema}} */ (Object.fromEntries(Object.entries(schema).map(([k,v]) => [v.field, {
                    ...v,
                    table: relationships[codeTableName].alias,
                    alias: this.#adapter.syntax.escapeColumn(`${prependColumn}${codeTableName}<|${v.field}`)
                }])));
                
                const scope = { MyORMAdapterError: Error, Where };
                const { cmd, args } = this.#adapter.serialize(scope).forConstraints(table);
                const constraints = await this.#adapter.execute(scope).forConstraints(cmd, args);
                if(parentRelationship != null) {
                    parentRelationship.constraints = [...parentRelationship.constraints, ...constraints];
                } else {
                    this.#constraints = [...this.#constraints, ...constraints];
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
     * @param {(model: {[K in keyof import("./types.js").OnlySqlTableTypes<TTableModel>]: Types.ThenIncludeCallback<import("./types.js").OnlySqlTableTypes<TTableModel>[K], K>}) => void} modelCallback
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
            ctx.#schema = this.#schema;
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
     * @param {Record<string, Types.Relationship<TTableModel>>=} relationships
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
     * @param {Types.SuccessHandler} callback 
     * @param {EventTypes} eventType 
     */
    handleSuccess(callback, eventType) {
        
    }

    /**
     * 
     * @param {Types.FailHandler} callback 
     * @param {EventTypes} eventType 
     */
    handleFail(callback, eventType) {

    }

    /**
     * 
     * @param {Types.WarningHandler} callback 
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
                        mapping[table] = this.#filterForUniqueRelatedRecords(records.filter(_r => r[pKey] === _r[fKey]), table, `${prepend}${table}<|`).map(map);
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

    /**
     * 
     * @param {string?} table 
     * @param {Record<string, Types.Relationship<TTableModel>>} relationships 
     * @returns {(keyof TTableModel & string)=}
     */
    #getPrimaryKey(table=null, relationships=this.#state.relationships) {
        let key = undefined;
        if(table == null || table === this.#table) {
            for(const k in this.#schema) {
                const col = this.#schema[k];
                if(col.isPrimary) {
                    key = col.field;
                }
            }
        } else {
            if(table in relationships) {
                return Object.keys(relationships[table].schema).filter(k => relationships[table].schema[k].isPrimary)[0];
            } 
            const filtered = Object.values(relationships).filter(o => o.table === table);
            if(filtered.length > 0) {
                return Object.keys(filtered[0].schema).filter(k => filtered[0].schema[k].isPrimary)[0];
            } else {
                for(const k in relationships) {
                    key = this.#getPrimaryKey(table, relationships[k].relationships);
                }
            }
        }
        return key;
    }

    /**
     * 
     * @param {(keyof TTableModel)=} key 
     * @param {{[K in keyof TTableModel]: import("./types.js").DescribedSchema}} schema 
     * @returns 
     */
    #isIdentityKey(key, schema=this.#schema) {
        return key !== undefined && key in schema && schema[key].isIdentity;
    }
}

// Exported types

/** SQLPrimitive  
 * 
 * All typescript types that are associated with SQL primitive types.
 * @typedef {boolean|string|number|Date|bigint} SQLPrimitive
 */

/** SqlTable  
 * 
 * Object type that represents an expected
 * @typedef {{[key: string]: object|SQLPrimitive|SqlTable|SqlTable[]}} SqlTable
 */

/*****************************ADAPTER******************************/

/** SerializationQueryHandlerData  
 * 
 * Data passed for the scope of the custom adapter to help serialize a query command.
 * @typedef {object} SerializationQueryHandlerData
 * @prop {Types.WhereClausePropertyArray=} where
 * Recursively nested array of objects where each object represents a condition.  
 * If the element is an array, then that means the condition is nested with the last element from that array.  
 * If undefined, then no `WHERE` clause was given.
 * @prop {number=} limit
 * Number representing the number of records to grab.  
 * If undefined, then no `LIMIT` clause was given.
 * @prop {number=} offset
 * Number representing the number of records to skip before grabbing.  
 * If undefined, then no `OFFSET` clause was given.
 * @prop {Types.SortByClauseProperty[]=} order_by
 * Array of objects where each object represents a column to order by.  
 * If undefined, then no `ORDER BY` clause was given.
 * @prop {Types.GroupByClauseProperty[]=} group_by
 * Array of objects where each object represents a column to group by.  
 * If undefined, then no `GROUP BY` clause was given.
 * @prop {Types.SelectClauseProperty[]} select
 * Array of objects where each object represents a column to select.
 * @prop {[Omit<Omit<Types.FromClauseProperty, "targetTableKey">, "sourceTableKey">, ...Types.FromClauseProperty[]]} from
 * Array of objects where each object represents a table to join on.  
 * The first object will represent the main table the context is connected to. 
 */

/** SerializationInsertHandlerData  
 * 
 * Data passed for the scope of the custom adapter to help serialize an insert command.
 * @typedef {object} SerializationInsertHandlerData
 * @prop {string} table
 * @prop {string[]} columns
 * @prop {SQLPrimitive[][]} values
 */

/** SerializationUpdateHandlerExplicitData  
 * 
 * Object model type for data used in explicit update transactions.
 * @typedef {object} SerializationUpdateHandlerExplicitData
 * @prop {SqlTable} values Used in an `explicit transaction`.  
 * Object representing what columns will be updated from the command.  
 * If this is undefined, then `objects` should be used.
 */

/** SerializationUpdateHandlerImplicitData  
 * 
 * Object model type for data used in implicit update transactions.
 * @typedef {object} SerializationUpdateHandlerImplicitData
 * @prop {SqlTable[]} objects Used in an `implicit transaction`.  
 * Array of objects that represent the table in the context that should be updated from the command.
 * If this is undefined, then `updateObject` should be used.  
 * __NOTE: If the table has an identity key, then the primary key will be stripped out before being passed into the execution handler function.__
 * @prop {string} primaryKey
 * Primary key of the table.
 */

/** SerializationUpdateHandlerData  
 * 
 * Data passed for the scope of the custom adapter to help serialize an update command.
 * @typedef {object} SerializationUpdateHandlerData
 * @prop {string} table
 * Table the update is occurring on.
 * @prop {string[]} columns
 * Columns to be updated.  
 * @prop {Types.WhereClausePropertyArray} where
 * Recursively nested array of objects where each object represents a condition.  
 * If the element is an array, then that means the condition is nested with the last element from that array.
 * @prop {SerializationUpdateHandlerExplicitData=} explicit
 * @prop {SerializationUpdateHandlerImplicitData=} implicit
 */

/** SerializationDeleteHandlerData  
 * 
 * Data passed for the scope of the custom adapter to help serialize a delete command.
 * @typedef {object} SerializationDeleteHandlerData
 * @prop {string} table
 * Table the delete is occurring on.
 * @prop {Types.WhereClausePropertyArray=} where
 * Recursively nested array of objects where each object represents a condition.  
 * If the element is an array, then that means the condition is nested with the last element from that array.
 */

/** SerializationTruncateHandlerData  
 * 
 * Data passed for the scope of the custom adapter to help serialize a delete command.
 * @typedef {object} SerializationTruncateHandlerData
 * @prop {string} table
 * Recursively nested array of objects where each object represents a condition.  
 * If the element is an array, then that means the condition is nested with the last element from that array.
 */

/** SerializationHandlers  
 * 
 * Various handlers for the `MyORMAdapter` to handle serialization of `MyORM` built data into appropriate command strings.
 * @typedef {object} SerializationHandlers
 * @prop {(data: SerializationQueryHandlerData) => { cmd: string, args: Types.ExecutionArgument[] }} forQuery
 * Handles serialization of a query command and its arguments so it appropriately works for the given database connector.
 * @prop {(data: SerializationQueryHandlerData) => { cmd: string, args: Types.ExecutionArgument[] }} forCount
 * Handles serialization of a query command for `COUNT` and its arguments so it appropriately works for the given database connector.
 * @prop {(data: SerializationInsertHandlerData) => { cmd: string, args: Types.ExecutionArgument[] }} forInsert
 * Handles serialization of a insert command and its arguments so it appropriately works for the given database connector.
 * @prop {(data: SerializationUpdateHandlerData) => { cmd: string, args: Types.ExecutionArgument[] }} forUpdate
 * Handles serialization of a update command and its arguments so it appropriately works for the given database connector.
 * @prop {(data: SerializationDeleteHandlerData) => { cmd: string, args: Types.ExecutionArgument[] }} forDelete
 * Handles serialization of a delete command and its arguments so it appropriately works for the given database connector.
 * @prop {(data: SerializationTruncateHandlerData) => { cmd: string, args: Types.ExecutionArgument[] }} forTruncate
 * Handles serialization of a truncate command and its arguments so it appropriately works for the given database connector.
 * @prop {(table: string) => { cmd: string, args: Types.ExecutionArgument[] }} forDescribe
 * Handles serialization of a describe command and its arguments so it appropriately works for the given database connector.
 * @prop {(table: string) => { cmd: string, args: Types.ExecutionArgument[] }} forConstraints
 * Handles serialization of a command that gets information about a table's constraints to other tables.
 */

/** ExecutionHandlers  
 * 
 * Various handlers for the `MyORMAdapter` to handle execution of a command and the command's corresponding arguments.
 * @typedef {object} ExecutionHandlers
 * @prop {(cmd: string, args: Types.ExecutionArgument[]) => Types.MaybePromise<any[]>} forQuery
 * Handles execution of a query command, given the command string and respective arguments for the command string.  
 * This should return an array of objects where each object represents the row returned from the query.
 * @prop {(cmd: string, args: Types.ExecutionArgument[]) => Types.MaybePromise<number>} forCount
 * Handles the execution of a query for `COUNT` command, given the command string and respective arguments for the command string.  
 * This should return a number representing the total number of rows retrieved from the command.
 * @prop {(cmd: string, args: Types.ExecutionArgument[]) => Types.MaybePromise<number[]>} forInsert
 * Handles execution of an insert command, given the command string and respective arguments for the command string.  
 * This should return an array of numbers, where each number represents a table's primary key's auto incremented number (if applicable)  
 * This array should be parallel with the array of records that were serialized in the `serialize(...).forInsert()` function.
 * @prop {(cmd: string, args: Types.ExecutionArgument[]) => Types.MaybePromise<number>} forUpdate
 * Handles execution of an update command, given the command string and respective arguments for the command string.  
 * This should return a number representing the total number of rows affected from the command.
 * @prop {(cmd: string, args: Types.ExecutionArgument[]) => Types.MaybePromise<number>} forDelete
 * Handles execution of a delete command, given the command string and respective arguments for the command string.  
 * This should return a number representing the total number of rows affected from the command.
 * @prop {(cmd: string, args: Types.ExecutionArgument[]) => Types.MaybePromise<number>} forTruncate
 * Handles execution of a truncate command, given the command string and respective arguments for the command string.  
 * This should return a number representing the total number of rows affected from the command.
 * @prop {(cmd: string, args: Types.ExecutionArgument[]) => Types.MaybePromise<{[fieldName: string]: Types.DescribedSchema}>} forDescribe
 * Handles execution of a describe command, given the command string and respective arguments for the command string.
 * This should return an object containing {@link Types.DescribedSchema} objects. 
 * __NOTE: `table` and `alias` can be left as empty strings, as they are handled internally in MyORM anyways.__
 * @prop {(cmd: string, args: Types.ExecutionArgument[]) => Types.MaybePromise<Types.ConstraintData[]>} forConstraints
 * Handles execution of a command that retrieves constraint data about a table, given the command string and respective arguments for the command string.
 * This should return an array containing {@link Types.ConstraintData} objects.
 */

/** AdapterScope  
 * 
 * Scope passed into the Adapter for usage within any of the serialize/execute functions.
 * @typedef {object} AdapterScope
 * @prop {() => Error} MyORMAdapterError  
 * Throw an error if it occurs within the MyORMAdapter.
 * @prop {typeof Where} Where
 * Situationally create new WHERE clause conditions.
 */

/** AdapterOptions  
 * 
 * Additional options that can be restricted specifically for the adapter's use.
 * @typedef {object} AdapterOptions
 * @prop {boolean=} allowTruncation
 * Allow the user to truncate the table.
 * @prop {boolean=} allowUpdateAll
 * Allow the user to update all records in the table.
 * @prop {boolean=} eventHandling 
 * Allow the user to attach event handlers to the table.
 */

/** AdapterSyntax  
 * 
 * Tools to assist with the adapter's syntax of how commands should be serialized.
 * @typedef {object} AdapterSyntax
 * @prop {(s: string) => string} escapeTable
 * Escapes a table in the command to protect against SQL injections.
 * `s` is the table to escape.
 * @prop {(s: string) => string} escapeColumn
 * Escapes a column in the command to protect against SQL injections.  
 * `s` is the column to escape.
 */

/** MyORMAdapter  
 * 
 * Object model type representing the requirements for an adapter to work with `MyORM`.
 * @template T
 * Type of the expected argument that needs to be passed into the `adapter()` function that represents the connection to the source.
 * @typedef {object} MyORMAdapter
 * @prop {AdapterOptions} options
 * Additional options that are automatically set over `MyORM`'s defaults.
 * @prop {AdapterSyntax} syntax
 * Required functions in order to provide safe SQL serialization.
 * @prop {(scope: AdapterScope) => ExecutionHandlers} execute
 * Function that provides the {@link AdapterScope} `scope` and returns an object of various functions for {@link ExecutionHandlers}.
 * @prop {(scope: AdapterScope) => SerializationHandlers} serialize
 * Function that provides the {@link AdapterScope} `scope` and returns an object of various functions for {@link SerializationHandlers}.
 */

/** InitializeAdapterCallback  
 * 
 * 
 * @template T
 * Type of the expected argument that needs to be passed into the `adapter()` function that represents the connection to the source.
 * @callback InitializeAdapterCallback
 * @param {T} config
 * @returns {MyORMAdapter<T>}
 */

