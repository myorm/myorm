//@ts-check
import { MyORMInternalError } from "./exceptions.js";
import { deepCopy } from "./util.js";
import { Where, WhereBuilder } from "./where-builder.js";
import * as Types from "./types.js";

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
 * @prop {[Omit<Omit<Types.FromClauseProperty, "targetTableKey">, "sourceTableKey">, ...Types.FromClauseProperty[]]} from
 * @prop {Types.GroupByClauseProperty[]=} groupBy
 * @prop {Types.SortByClauseProperty[]=} sortBy
 * @prop {number=} limit
 * @prop {number=} offset
 * @prop {WhereBuilder=} where
 * @prop {boolean=} explicit
 * @prop {boolean=} negated
 * @prop {Record<string, Types.Relationship>} relationships
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
    /** @type {Set<Types.DescribedSchema>} */ #schema;
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
            this.#schema = schema;
        })
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
        const results = this.#adapter.execute(scope).forQuery(cmd, args);
        return [];
    }

    /**
     * @returns {Promise<number>}
     */
    async count() {
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
        const result = this.#adapter.execute(scope).forCount(cmd, args);
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
     * @returns {Promise<Set<Types.DescribedSchema>>}
    */
    async #describe(table) {
        const { cmd, args } = this.#adapter
            .serialize({ MyORMAdapterError: () => Error(), Where: {} })
            .forDescribe(table);
        return this.#adapter
            .execute({ MyORMAdapterError: () => Error(), Where: {} })
            .forDescribe(cmd, args);
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
            const newProxy = (table = ctx.#table) => new Proxy({}, {
                get: (t,p,r) => {
                    if (typeof (p) === 'symbol') throw new MyORMInternalError();
                    if (ctx.#isRelationship(p, table)) {
                        return newProxy(p);
                    }
                    if(ctx.#state.where) {
                        //@ts-ignore `._append` is marked private so the User does not see the function.
                        return ctx.#state.where._append(p, `AND${ctx.#state.negated ? ' NOT' : ''}`);
                    }
                    return ctx.#state.where = Where(p, table, ctx.#state.relationships, `WHERE${ctx.#state.negated ? ' NOT' : ''}`);
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
            const sorts = modelCallback(this.#newProxyForColumn(undefined, undefined, o => ({
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
                    const { table, column, alias } = /** @type {Types.Column} */ (col);
                    const c = aggr === 'COUNT' 
                        ? `COUNT(DISTINCT ${column})` 
                        : aggr === 'TOTAL' 
                            ? `COUNT(*)` 
                            : `${aggr}(${column})`;
                    return {
                        table,
                        column: c,
                        alias: alias.replace('<|', '_'),
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

            ctx.#state.groupBy = Array.isArray(groups) ? groups : [groups];
        });
    }

    group = this.groupBy;

    /**
     * Specify the columns you would like to select
     * @template {Types.SelectedColumnsModel<TTableModel>} TSelectedColumns
     * @param {(model: Types.SpfSelectCallbackModel<TTableModel>) => Types.MaybeArray<keyof TSelectedColumns>} modelCallback
     * @returns {MyORMContext<Types.ReconstructAbstractModel<TTableModel, TSelectedColumns>, Types.ReconstructAbstractModel<TTableModel, TSelectedColumns>>} 
     * A new context with the all previously configured clauses and the updated groupings.
     */
    choose(modelCallback) {
        if(this.#state.groupBy) throw Error('Cannot choose columns when a GROUP BY clause is present.');

        return this.#duplicate(ctx => {
            const selects = /** @type {Types.MaybeArray<Types.SelectClauseProperty>}*/ (/** @type {unknown} */ (modelCallback(this.#newProxyForColumn())));
            ctx.#state.select = Array.isArray(selects) ? selects : [selects];
        });
    }

    hasOne(modelCallback) {
        /**
         * @param {string=} table 
         * @param {"1:1"|"1:n"} type 
         * @returns 
         */
        const newProxy = (table = undefined, type = "1:1") => new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => {
                if (typeof (p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
                if (this.#isRelationship(p)) throw Error(`No more than one relationship can exist with the name, "${p}".`);

                this.#describe(p).then(schema => {
                    if (table) {
                        this.#state.relationships[table] = { schema, type };
                    } else {
                        this.#state.relationships[p] = { schema, type };
                    }
                });

                const andThat = {
                    andThatHasOne: (callback) => {
                        callback(newProxy(p, "1:1"));
                        return andThat;
                    },
                    andThatHasMany: (callback) => {
                        callback(newProxy(p, "1:n"));
                        return andThat
                    }
                };
                return andThat;
            }
        });

        modelCallback(newProxy());

        return this;
    }

    hasMany(modelCallback) {
        /**
         * @param {string=} table 
         * @param {"1:1"|"1:n"} type 
         * @returns 
         */
        const newProxy = (table = undefined, type = "1:n") => new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => {
                if (typeof (p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
                if (this.#isRelationship(p)) throw Error(`No more than one relationship can exist with the name, "${p}".`);

                this.#describe(p).then(schema => {
                    if (table) {
                        this.#state.relationships[table] = { schema, type };
                    } else {
                        this.#state.relationships[p] = { schema, type };
                    }
                });

                const andThat = {
                    andThatHasOne: (callback) => {
                        callback(newProxy(p, "1:1"));
                        return andThat;
                    },
                    andThatHasMany: (callback) => {
                        callback(newProxy(p, "1:n"));
                        return andThat
                    }
                };
                return andThat;
            }
        });

        modelCallback(newProxy());

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
            const newProxy = (table=this.#table, prepend="") => new Proxy(/** @type {any} */({}), {
                get: (t,p,r) => {
                    if (typeof(p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
                    if (!ctx.#isRelationship(p, table)) throw Error(`The specified table, "${p}", does not have a configured relationship with "${table}".`);
                    
                    const thisKey = Array.from(ctx.#state.relationships[table].schema).filter(k => k.isPrimary)[0];
                    const thatKey = Array.from(ctx.#state.relationships[p].schema).filter(k => k.isPrimary)[0];
                    this.#state.from.push({
                        table: p,
                        alias: `__${prepend}${table}_${p}__`,
                        sourceTableKey: {
                            table: ctx.#adapter.syntax.escapeTable(table),
                            column: ctx.#adapter.syntax.escapeColumn(thisKey.field),
                            alias: ctx.#adapter.syntax.escapeTable(thisKey.alias)
                        },
                        targetTableKey: {
                            table: ctx.#adapter.syntax.escapeTable(p),
                            column: ctx.#adapter.syntax.escapeColumn(thatKey.field),
                            alias: ctx.#adapter.syntax.escapeTable(thatKey.alias)
                        }
                    });

                    const thenInclude = {
                        thenInclude: (callback) => {
                            callback(newProxy(p, `${prepend}${table}_`));
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
     * @param {string=} prepend 
     * @param {((o: Types.Column) => any)=} callback
     * @returns {any}
     */
    #newProxyForColumn(table = this.#table, prepend='', callback=(o) => o){
        if(table === undefined) table = this.#table;
        if(prepend === undefined) prepend = '';
        return new Proxy({}, {
            get: (t, p, r) => {
                if (typeof(p) === 'symbol') throw new MyORMInternalError(); // @TODO not an internal error, this would be the fault of the User for a reference like `m[Symbol()]`
                if (this.#isRelationship(p, table)) {
                    return this.#newProxyForColumn(p, `${prepend}${table}|>`, callback);
                }

                return callback({
                    table: this.#adapter.syntax.escapeTable(table),
                    column: this.#adapter.syntax.escapeColumn(p),
                    alias: this.#adapter.syntax.escapeColumn(`${prepend}${p}`)
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
     * @param {string=} lastTable
     * Table to check to see if the argument, `table`, is a relationship with.  
     * If `lastTable` is falsy, or unprovided, then `lastTable` defaults to the main table in this context.
     * @returns {boolean}
     * True if the argument, `lastTable`, with this context has a relationship with `table`, otherwise false.
     */
    #isRelationship(table, lastTable = undefined) {
        if (lastTable) {
            return table in this.#state.relationships[lastTable];
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
     * Negate the next WHERE clause.
     * @returns {this}
     */
    get not() {
        this.#state.negated = false;
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
}

/**
 * @param {Types.WhereClausePropertyArray=} conditions
 * @param {string} table
 * @returns {{cmd: string, args: Types.SQLPrimitive[]}}
 */
function handleWhere(conditions, table="") {
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
    const reduce = (a, b) => {
        if(Array.isArray(b)) {
            const [x, ...remainder] = b;
            args.push(x.value);
            return `${a} ${remainder.reduce(reduce, ` ${x.chain} (${x.property} ${x.condition} ?`) + ')'}`;
        }
        args.push(b.value);
        return a + ` ${b.chain} ${b.property} ${b.condition} ?`;
    };
    
    // map the array, filter out undefineds, then reduce the array to get the clause.
    const reduced = conditions.map(mapFilter).filter(x => x !== undefined).reduce(reduce, '');
    return {
        // if a filter took place, then the WHERE statement of the clause may not be there, so we replace.
        cmd: reduced.startsWith(" WHERE") ? reduced : reduced.startsWith(" AND") ? reduced.replace("AND", "WHERE") : reduced.replace("OR", "WHERE"),
        // arguments was built inside the reduce function.
        args
    };
}

// MySQL adapter @TODO move to own repo.

/** @type {Types.InitializeAdapterCallback<{ a: string }>} */
function adapter(config) {
    return {
        options: {

        },
        syntax: {
            escapeColumn: (s) => `\`${s}\``,
            escapeTable: (s) => `\`${s}\``
        },
        execute(scope) {
            return {
                forQuery(cmd, args) {
                    return [];
                },
                forCount(cmd, args) {
                    return 0;
                },
                forInsert(cmd, args) {
                    return [];
                },
                forUpdate(cmd, args) {
                    return 0;
                },
                forDelete(cmd, args) {
                    return 0;
                },
                forDescribe(cmd, args) {
                    return new Set();
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
                    
                    cmd += `SELECT ${select.map(prop => `${prop.table}.${prop.column} AS ${prop.alias}`).join('\n\t\t,')}`;
                    
                    const limitStr = limit != undefined ? `LIMIT ${limit}` : '';
                    const offsetStr = limit != undefined && offset != undefined ? `OFFSET ${offset}` : '';
                    cmd += `FROM ${main.table} AS ${main.alias}`;
                    // if a limit or offset was specified, and an join is expected, then a nested query should take place of the first table.
                    if(limit && from.length > 1) {
                        cmd += `(SELECT * FROM ${main.table} ${handleWhere(where, main.table).cmd} ${limitStr} ${offsetStr}) AS ${from[0].alias}`;
                    }
                    
                    cmd += fromJoins.map(table => `${table.table} AS ${table.alias} ON ${table.sourceTableKey.table}.${table.sourceTableKey.alias} = ${table.targetTableKey.table}.${table.targetTableKey.alias}`).join('\n\t\tLEFT JOIN');
                    cmd += handleWhere(where);
                    // the inverse happens from above. If a limit or offset was specified but only one table is present, then we will add the strings.
                    if(limit && from.length <= 1) {
                        cmd += limitStr;
                        cmd += offsetStr;
                    }

                    if(group_by) {
                        cmd += 'GROUP BY ' + group_by.map(prop => prop.alias).join(',');
                    }

                    if(order_by) {
                        cmd += 'ORDER BY ' + order_by.map(prop => prop.alias).join(',');
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
                    cmd += `FROM ${main.table} AS ${main.alias}`;
                    // if a limit or offset was specified, and an join is expected, then a nested query should take place of the first table.
                    if (limit && from.length > 1) {
                        cmd += `(SELECT * FROM ${main.table} ${handleWhere(where, main.table).cmd} ${limitStr} ${offsetStr}) AS ${from[0].alias}`;
                    }

                    cmd += fromJoins.map(table => `${table.table} AS ${table.alias} ON ${table.sourceTableKey.table}.${table.sourceTableKey.alias} = ${table.targetTableKey.table}.${table.targetTableKey.alias}`).join('\n\t\tLEFT JOIN');
                    cmd += handleWhere(where);
                    // the inverse happens from above. If a limit or offset was specified but only one table is present, then we will add the strings.
                    if (limit && from.length <= 1) {
                        cmd += limitStr;
                        cmd += offsetStr;
                    }

                    if (group_by) {
                        cmd += 'GROUP BY ' + group_by.map(prop => prop.alias).join(',');
                    }

                    if (order_by) {
                        cmd += 'ORDER BY ' + order_by.map(prop => prop.alias).join(',');
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
                forDescribe(data) {
                    return { cmd: "", args: [] };
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

/** @type {MyORMContext<TestModel>} */
const ctx = new MyORMContext(adapter({ a: "" }), "Blah");

ctx.not.where(m => m.x.gt(10)).select().then(r => {
    r[0]
});

ctx.include(m => m.bar).select().then(r => {
    r[0].bar
})