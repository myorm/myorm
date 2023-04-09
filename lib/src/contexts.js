//@ts-check
import { createPool } from "mysql2/promise";
import { MySqlContextDeleteError, MySqlContextInsertError, MySqlContextQueryError, MySqlContextSyntaxError, MySqlContextUpdateError } from './exceptions.js';
import { Where, WhereBuilder } from './where-builder.js';

/** @typedef {import('mysql2/promise').PoolOptions} MySql2PoolOptions */
/** @typedef {import('mysql2/promise').Pool} MySql2Pool */
/** @typedef {import('mysql2/promise').Connection} MySql2Connection */
/** @typedef {import('mysql2/promise').ResultSetHeader} MySql2ResultSetHeader */

/** @template {string} TString1 @template {string} TString2 @typedef {import('./toolbelt.js').AugmentString<TString1, TString2>} AugmentString */
/** @template {AbstractModel} TModel @typedef {import('./toolbelt.js').TableJoinMetadata<TModel>} TableJoinMetadata */
/** @template {AbstractModel} TModel @typedef {import('./toolbelt.js').OrderByBuilderFunction<TModel>} OrderByBuilderFunction */
/** @template {AbstractModel} TModel @typedef {import('./toolbelt.js').GroupByBuilderFunction<TModel>} GroupByBuilderFunction */
/** @template {MyORMContext} TContext @typedef {import('./toolbelt.js').ExtractModel<TContext>} ExtractModel */
/** @typedef {import('./toolbelt.js').SuccessHandler} SuccessHandler */
/** @typedef {import('./toolbelt.js').FailHandler} FailHandler */
/** @typedef {import('./toolbelt.js').TableContextOptions} TableContextOptions */
/** @typedef {import('./toolbelt.js').GroupByAliases} GroupByAliases */
/** @typedef {import('./toolbelt.js').AbstractModel} AbstractModel */
/** @typedef {import('./toolbelt.js').IncludeOnOperatorCallback} IncludeOnOperatorCallback */
/** @template {AbstractModel} T @template {AbstractModel} R @typedef {import('./toolbelt.js').IncludeOnCallback<T, R>} IncludeOnCallback */
/** @template {AbstractModel} T @typedef {import('./toolbelt.js').IncludeCallback<T>} IncludeCallback */
/** @template {AbstractModel} T @typedef {import('./toolbelt.js').AbstractModelKeysToOnCallbacks<T>} AbstractModelKeysToOnCallbacks */
/** @template {AbstractModel} T @template {AbstractModel} R @typedef {import('./toolbelt.js').RelationshipFrom<T, R>} RelationshipFrom */
/** @template {AbstractModel} T @template {AbstractModel} R @typedef {import('./toolbelt.js').RelationshipWith<T, R>} RelationshipWith */
/** @template {AbstractModel} T @typedef {import('./toolbelt.js').RelationshipTo<T>} RelationshipTo */
/** @template {AbstractModel} T @typedef {import('./toolbelt.js').OnlyAbstractModelTypes<T>} OnlyAbstractModelTypes */
/** @template {AbstractModel} T @typedef {import('./toolbelt.js').OnlyAbstractModels<T>} OnlyAbstractModels */
/** @template {AbstractModel} T @typedef {import('./toolbelt.js').OnlyAbstractModelArrays<T>} OnlyAbstractModelArrays */
/** @template {AbstractModel} T @typedef {import('./toolbelt.js').OnlyNonAbstractModels<T>} OnlyNonAbstractModels */

// group by aggregate functions

/**
 * @template {AbstractModel} TModel
 * @typedef {Object} Aggregates
 * @prop {() => number} count
 * @prop {(modelCallback: (model: {[K in keyof TModel]: string}) => string) => number} avg
 * @prop {(modelCallback: (model: {[K in keyof TModel]: string}) => string) => number} sum
 * @prop {(modelCallback: (model: {[K in keyof TModel]: string}) => string) => number} max
 * @prop {(modelCallback: (model: {[K in keyof TModel]: string}) => string) => number} min
 */

// thenInclude types.

/**
 * @template {AbstractModel} T
 * @callback IncludeModelCallback
 * @param {{[K in keyof Required<OnlyAbstractModels<T>>]: IncludeModelCallbackAliasChain<OnlyAbstractModels<T>[K]>}} model
 * @returns {void}
 */

/**
 * @template {AbstractModel} T
 * @callback ThenIncludeModelCallback
 * @param {{[K in keyof Required<T>]: IncludeModelCallbackAliasChain<T[K]>}} includingModel
 * @returns {IncludeModelCallbackAliasChain<T>}
 */

/**
 * @template {AbstractModel} T
 * @typedef {Object} IncludeModelCallbackAliasChain
 * @prop {(alias: string) => IncludeModelCallbackThenIncludeChain<T>} as
 */

/**
 * @template {AbstractModel} T
 * @typedef {Object} IncludeModelCallbackThenIncludeChain
 * @prop {(includingModelCallback: ThenIncludeModelCallback<T>) => IncludeModelCallbackAliasChain<T>} thenInclude
 * @returns {void}
 */

/**
 * Object that holds context to a specific Table in your MySQL database. To ensure type-safety in vanilla JavaScript, use JSDOC typing.
 * @template {AbstractModel} TTableModel Model that represents the Table this Context represents.
 * @template {AbstractModel} [TAliasMap=OnlyNonAbstractModels<TTableModel>] Alias Map, is not intended to be given by the User. This is used to assist with return types from SELECT given aliases.
 */
export class MyORMContext {
    /**  @readonly @private @type {'table-context-query'} Event fired when the Table Context queries. */
    static EVENT_TABLE_CONTEXT_QUERY = 'table-context-query';
    /**  @readonly @private @type {'table-context-query-failed'} Event fired when the Table Context inserts. */
    static EVENT_TABLE_CONTEXT_QUERY_FAILED = 'table-context-query-failed';
    /**  @readonly @private @type {'table-context-insert'} Event fired when the Table Context inserts. */
    static EVENT_TABLE_CONTEXT_INSERT = 'table-context-insert';
    /**  @readonly @private @type {'table-context-insert-failed'} Event fired when the Table Context inserts. */
    static EVENT_TABLE_CONTEXT_INSERT_FAILED = 'table-context-insert-failed';
    /**  @readonly @private @type {'table-context-update'} Event fired when the Table Context updates. */
    static EVENT_TABLE_CONTEXT_UPDATE = 'table-context-update';
    /**  @readonly @private @type {'table-context-update-failed'} Event fired when the Table Context inserts. */
    static EVENT_TABLE_CONTEXT_UPDATE_FAILED = 'table-context-update-failed';
    /**  @readonly @private @type {'table-context-delete'} Event fired when the Table Context deletes. */
    static EVENT_TABLE_CONTEXT_DELETE = 'table-context-delete';
    /**  @readonly @private @type {'table-context-delete-failed'} Event fired when the Table Context inserts. */
    static EVENT_TABLE_CONTEXT_DELETE_FAILED = 'table-context-delete-failed';

    /** @const @protected @type {keyof TTableModel|null} */ _identityKey;
    /** @protected @type {MySql2Pool} */_pool;
    /** @protected @type {string} */ _table;
    /** @protected @type {TableContextOptions} */ _options;
    /** @protected @type {(keyof TTableModel)?} */ _joinKey = null;
    /** @protected @type {Partial<{[K in keyof OnlyAbstractModels<TTableModel>]: { included: boolean, name: string, thisKey: keyof TTableModel, thatKey: string, type: "1:1"|"1:n" }}>} */ includeConfigurations = {};
    /** @protected @type {WhereBuilder<TTableModel>?} */ _where;
    /** @protected @type {AbstractModel=} */ _aliases;
    /** @protected @type {number=} */ _limit;
    /** @protected @type {number=} */ _offset;
    /** @protected @type {{ column: keyof TTableModel, direction: "ASC"|"DESC"}[]} */ _sortByKeys = [];
    /** @protected @type {boolean} */ _grouped = false;

    /**
     * Creates a Connection Pool ready for use inside of multiple MySqlTableContext objects.
     * @param {MySql2PoolOptions} config Configuration to create the pool on.
     * @returns {MySql2Pool} Connection Pool.
     */
    static createPool(config) {
        return createPool({ decimalNumbers: true, bigNumberStrings: true, connectionLimit: 20, ...config });
    }

    /**
     * Execute a stored procedure given a configuration setup or an already instantiated MySql2 Pool.
     * @template {any} [T=any]
     * @param {MySql2Pool|MySql2PoolOptions} configOrPool MySql2 config options to create a Pool object with or an existing Pool.
     * @param {string} procedureName Name of the procedure to execute.
     * @param  {...any} procedureArgs Arguments to pass into the stored procedure
     * @returns {Promise<T[]>} T models that are returned from the 
     */
    static async procedure(configOrPool, procedureName, ...procedureArgs) {
        if ("query" in configOrPool) {
            await configOrPool.query(`CALL ${procedureName} (${procedureArgs.map(_ => '?').join(',')})`, procedureArgs);
            const [result] = await configOrPool.query(`CALL ${procedureName} (${procedureArgs.map(_ => '?').join(',')})`, procedureArgs);
            return /** @type {T[]} */ (result[0]);
        }
        const pool = createPool(configOrPool);
        const [result] = await pool.query(`CALL ${procedureName} (${procedureArgs.map(_ => '?').join(',')})`, procedureArgs);
        await pool.end();
        return /** @type {T[]} */ (result[0]);
    }

    /**
     * Creates a new MySQL table context given the mysql2 config options. The user may also pass in an existing "Pool" object too, 
     * which allows this context to work alongside other contexts.
     * @param {MySql2Pool|MySql2PoolOptions} configOrPool MySql2 config options to create a Pool object with or an existing Pool.
     * @param {string} table Name of the Table this context is connecting to.
     * @param {(keyof TTableModel)?} identityKey Primary key of the table that auto increments. If there is none, then leave null.
     * @param {TableContextOptions} options Context options that enable certain features.
     */
    constructor(configOrPool, table, identityKey=null, options = {}) {
        this._table = table;
        this._identityKey = identityKey;
        if ('query' in configOrPool) {
            this._pool = configOrPool
        } else {
            this._pool = MyORMContext.createPool(configOrPool);
        }
        this._options = { 
            allowTruncation: false, 
            allowUpdateOnAll: false, 
            sortKeys: false, 
            ...options 
        };
    }

    /**
     * Executes a query command against the Table this context represents.
     * @protected
     * @param {string} cmd Command to execute
     * @param {any[]=} args Arguments to pass to avoid sql injections.
     * @returns {Promise<TTableModel[]>} T models that are returned from the 
     */
    async _query(cmd, args = undefined) {
        let cmdRaw = cmd;
        try {
            if (!cmd.startsWith("SELECT")) {
                throw Error("Unrecognized SQL query.");
            }
            args?.forEach(a => cmdRaw = cmdRaw.replace('?', typeof(a) === "string" || a instanceof Date ? `'${a}'` : a));
            const [result] = await this._pool.query(cmd, args);
            this._pool.emit(`${MyORMContext.EVENT_TABLE_CONTEXT_QUERY}-${this._table}`, {
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            });
            return /** @type {TTableModel[]} */ (result);
        } catch(err) {
            this._pool.emit(`${MyORMContext.EVENT_TABLE_CONTEXT_QUERY_FAILED}-${this._table}`, {
                error: err,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            })
            throw new MySqlContextQueryError(`An error occurred when attempting to query from ${`[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`}.`, err);
        }
    }

    /**
     * Executes an insert command against the Table this context represents.
     * @private
     * @param {string} cmd Command to execute
     * @param {any[]=} args Arguments to pass to avoid sql injections.
     * @returns {Promise<number[]>} The insertId of the first item inserted.
     */
    async _insert(cmd, args = undefined) {
        let cmdRaw = cmd;
        try {
            if (!cmd.startsWith("INSERT")) {
                throw Error("Unrecognized SQL insert command.");
            }
            if (args) {
                // Convert UTC Date Strings to MySQL acceptable Date Strings (YYYY-MM-dd HH:mm:ss)
                args = args.map(a => {
                    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(a)) {
                        return a.replace('T', ' ').replace(/\.[0-9]{3}Z/, '');
                    }
                    return a;
                });
            }
            args?.forEach(a => cmdRaw = cmdRaw.replace('?', typeof (a) === "string" || a instanceof Date ? `'${a}'` : a));
            const [result] = /** @type {MySql2ResultSetHeader[]} */ (await this._pool.execute(cmd, args));
            this._pool.emit(`${MyORMContext.EVENT_TABLE_CONTEXT_INSERT}-${this._table}`, {
                affectedRows: result.affectedRows,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args,
            });
            return Array.from(Array(result.affectedRows).keys()).map((_,n) => n + result.insertId);
        } catch(err) {
            this._pool.emit(`${MyORMContext.EVENT_TABLE_CONTEXT_INSERT_FAILED}-${this._table}`, { 
                error: err, 
                dateIso: new Date().toISOString(), 
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host, 
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`, 
                cmdRaw, 
                cmdSanitized: cmd,
                args
            });
            throw new MySqlContextInsertError(`An error occurred when attempting to insert into ${`[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`}.`, err);
        }
    }

    /**
     * Executes an update command against the Table this context represents.
     * @private
     * @param {string} cmd Command to execute
     * @param {any[]=} args Arguments to pass to avoid sql injections.
     * @returns {Promise<number>} Number of rows that were deleted.
     */
    async _update(cmd, args = undefined) {
        let cmdRaw = cmd;
        try {
            if (!cmd.startsWith("UPDATE")) {
                throw Error("Unrecognized SQL update command.");
            }
            if (args) {
                // Convert UTC Date Strings to MySQL acceptable Date Strings (YYYY-MM-dd HH:mm:ss)
                args = args.map(a => {
                    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(a)) {
                        return a.replace('T', ' ').replace(/\.[0-9]{3}Z/, '');
                    }
                    return a;
                });
            }
            args?.forEach(a => cmdRaw = cmdRaw.replace('?', typeof (a) === "string" || a instanceof Date ? `'${a}'` : a));
            const result = /** @type {MySql2ResultSetHeader} */ ((await this._pool.execute(cmd, args))[0]);
            this._pool.emit(`${MyORMContext.EVENT_TABLE_CONTEXT_UPDATE}-${this._table}`, {
                affectedRows: result.affectedRows,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            });
            return result.affectedRows;
        } catch(err) {
            this._pool.emit(`${MyORMContext.EVENT_TABLE_CONTEXT_UPDATE_FAILED}-${this._table}`, {
                error: err,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            });
            throw new MySqlContextUpdateError(`An error occurred when attempting to update ${`[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`}.`, err);
        }
    }

    /**
     * Executes a delete command against the Table this context represents.
     * @private
     * @param {string} cmd Delete command to execute
     * @param {any[]=} args Arguments to pass to avoid sql injections.
     * @returns {Promise<number>} Number of rows that were deleted.
     */
    async _delete(cmd, args = undefined) {
        let cmdRaw = cmd;
        try {
            if (!cmd.startsWith("DELETE") && !cmd.startsWith("TRUNCATE")) {
                throw Error("Unrecognized SQL update command.");
            }
            args?.forEach(a => cmdRaw = cmdRaw.replace('?', typeof(a) === "string" || a instanceof Date ? `'${a}'` : a));
            const result = /** @type {MySql2ResultSetHeader} */ ((await this._pool.execute(cmd, args))[0]);
            this._pool.emit(`${MyORMContext.EVENT_TABLE_CONTEXT_DELETE}-${this._table}`, {
                affectedRows: result.affectedRows,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            });
            return result.affectedRows;
        } catch(err) {
            this._pool.emit(`${MyORMContext.EVENT_TABLE_CONTEXT_DELETE_FAILED}-${this._table}`, {
                error: err,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            })
            throw new MySqlContextDeleteError(`An error occurred when attempting to delete from ${`[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._table}]`}.`, err);
        }
    }

    /**
     * Configures an informal one-to-many relationship between the Model referenced in this context with another Model that is defined as a property in the model type.  
     * @example
     * ```js
     * fooContext.hasMany(m => m.Bars.from("Bar").with("FooId").to("BarId"));
     * // or, if the table is the same name as the property.
     * fooContext.hasMany(m => m.Bar.with("FooId").to("BarId"));
     * ```
     * @param {(m: Required<{[K in keyof OnlyAbstractModelArrays<TTableModel>]: { 
     *      from: RelationshipFrom<TTableModel, OnlyAbstractModelArrays<TTableModel>[K]>, 
     *      with: RelationshipWith<OnlyAbstractModelArrays<TTableModel>[K], TTableModel> 
     * }}>) => void} relationshipCallback Used to configure the keys for the informal foreign relationship.
     */
    hasMany(relationshipCallback) {
        const self = this;
        const $p = new Proxy(/** @type {any} */({}), {
            get(t, p, v) {
                return {
                    /** @type {RelationshipFrom<TTableModel, OnlyAbstractModelArrays<TTableModel>[typeof p]>} */
                    from(realTableName) {
                        return {
                            with(thatColumnName) {
                                return {
                                    to(thisColumnName) {
                                        self.includeConfigurations[p] = { 
                                            name: realTableName, 
                                            thisKey: thisColumnName, 
                                            thatKey: thatColumnName, 
                                            type: "1:n" 
                                        };
                                    }
                                }
                            }
                        }
                    },
                    /** @type {(columnName: string) => { to: (columnName: string) => void}} */
                    with(thatColumnName) {
                        return {
                            to(thisColumnName) {
                                self.includeConfigurations[p] = {
                                    name: p,
                                    thisKey: thisColumnName,
                                    thatKey: thatColumnName,
                                    type: "1:n"
                                };
                            }
                        }
                    }
                }
            }
        });
        relationshipCallback($p);
    }

    /**
     * Configures an informal one-to-one relationship between the Model referenced in this context with another Model that is defined as a property in the model type.  
     * @example
     * ```js
     * fooContext.hasOne(m => m.MyRelatedRecord.from("Bar").with("FooId").to("BarId"));
     * // or, if the table is named after the property
     * fooContext.hasOne(m => m.Bar.with("FooId").to("BarId"));
     * ```
     * @param {(m: Required<{[K in keyof OnlyAbstractModels<TTableModel>]: { 
     *      from: RelationshipFrom<TTableModel, OnlyAbstractModels<TTableModel>[K]>, 
     *      with: RelationshipWith<TTableModel, OnlyAbstractModels<TTableModel>[K]> 
     * }}>) => void} relationshipCallback Used to configure the keys for the informal foreign relationship.
     */
    hasOne(relationshipCallback) {
        const self = this;
        const $p = new Proxy(/** @type {any} */({}), {
            get(t,p) {
                return {
                    /** @type {RelationshipFrom<TTableModel, OnlyAbstractModels<TTableModel>[typeof p]>} */
                    from(realTableName) {
                        return {
                            with(thisColumnName) {
                                return {
                                    to(thatColumnName) {
                                        self.includeConfigurations[p] = { 
                                            name: realTableName, 
                                            thisKey: thisColumnName, 
                                            thatKey: thatColumnName, 
                                            type: "1:1" 
                                        };
                                    }
                                }
                            }
                        }
                    },
                    /** @type {(columnName: string) => { to: (columnName: string) => void}} */
                    with(thisColumnName) {
                        return {
                            to(thatColumnName) {
                                self.includeConfigurations[p] = {
                                    name: p,
                                    thisKey: thisColumnName,
                                    thatKey: thatColumnName,
                                    type: "1:1"
                                };
                            }
                        }
                    }
                }
            }
        });
        relationshipCallback($p);
    }

    /**
     * Add a `WHERE` clause to your command. This helps filter your `.update`, `.delete`, and `.select` functions.
     * @param {(m: {[K in keyof Required<TTableModel>]: WhereBuilder<TTableModel, K>}) => void} whereCallback Builder function to help build a WHERE clause.
     * @returns {MyORMContext<TTableModel, TAliasMap>} A new context that is tailored to the state of the command that was built.
     */
    where(whereCallback) {
        const proxy = new Proxy(/** @type {any} */({}), {
            get: (t,p,r) => {
                if(this._where) {
                    // @ts-ignore This is private, but this is an exception so Views can work appropriately.
                    this._where._current = { property: String(p), chain: "AND" };
                    return this._where;
                }
                this._where = Where(String(p), this._table);
                return this._where;
            }
        });
        whereCallback(proxy);

        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._table, this._identityKey, this._options);
        this._transferToNewContext(ctx);
        
        return ctx;
    }

    /** @template T @typedef {T extends Function ? never : T} NotFunction */

    /** @typedef {{ asc: () => boolean, desc: () => boolean, ascending: () => boolean, descending: () => boolean }} DirectionCallbacks */
    
    /**
     * 
     * @param {(m: {[K in keyof TTableModel]: DirectionCallbacks}) => (DirectionCallbacks|boolean)[]|boolean|DirectionCallbacks } orderByCallback 
     * @returns 
     */
    sortBy(orderByCallback) {
        this._sortByKeys = [];
        const proxy = new Proxy(/** @type {any} */({}), {
            get: (t,p,r) => {
                /** @type {{ column: keyof TTableModel, direction: "ASC"|"DESC"}} */
                const sbk = {
                    column: String(p),
                    direction: "ASC"
                };
                const directions = {
                    asc: () => {
                        sbk.direction = "ASC";
                        return true;
                    },
                    desc: () => {
                        sbk.direction = "DESC";
                        return true;
                    }
                }
                directions.ascending = directions.asc;
                directions.descending = directions.desc;
                this._sortByKeys = [...this._sortByKeys, sbk];
                return directions;
            }
        });
        orderByCallback(proxy);
        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._table, this._identityKey, this._options);
        this._transferToNewContext(ctx);
        return ctx;
    }

    /**
     * Group your 
     * @template {AbstractModel} TGroupedType
     * @template {TAliasMap} [TAugmentedType=TAliasMap] Augmented `TTableModel` type to assist with included model aliases.
     * @param {(m: Required<TAugmentedType>, aggregate: Aggregates<TAliasMap>) => TGroupedType } groupByCallback
     * @returns {MyORMContext<TTableModel, TGroupedType>}
     */
    groupBy(groupByCallback) {
        if (this._aliases) throw new MySqlContextSyntaxError("You can only alias or group a table once at a time.");
        this._grouped = true;
        let includeAliases = {};

        /** @returns {Required<TAliasMap>} */
        const newProxy = () => new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => {
                if (p in this.includeConfigurations) {
                    return newProxy();
                }
                return p;
            }
        });

        const proxy = newProxy();

        // We force a cast to numbers since we need the type defined as number. In this specific scenario, we want the strings for aliasing. 
        /** @type {Aggregates<TAliasMap>} */
        const aggregates = {
            count: () => /** @type {number} */ (/** @type {unknown} */ ("COUNT(*)")),
            avg: (cb) => /** @type {number} */ (/** @type {unknown} */ (`AVG(${cb(proxy)})`)),
            max: (cb) => /** @type {number} */ (/** @type {unknown} */ (`MAX(${cb(proxy)})`)),
            min: (cb) => /** @type {number} */ (/** @type {unknown} */ (`MIN(${cb(proxy)})`)),
            sum: (cb) => /** @type {number} */ (/** @type {unknown} */ (`SUM(${cb(proxy)})`))
        }

        const aliases = groupByCallback(/** @type {any} */(proxy), aggregates);

        for (const alias in includeAliases) {
            const config = this.includeConfigurations[includeAliases[alias]];
            if (config === undefined) throw new MySqlContextSyntaxError(`You must configure a relationship in order to use ".include" on ${includeAliases[alias]}`);
            config.included = true;
            delete this.includeConfigurations[includeAliases[alias]];
            this.includeConfigurations[alias] = config;
        }

        /** @type {MyORMContext<TTableModel, TGroupedType>} */
        const ctx = new MyORMContext(this._pool, this._table);
        this._transferToNewContext(/** @type {any} */(ctx));
        ctx._aliases = aliases;
        return ctx;
    }

    /**
     * Alias your table to a different return type.
     * @template {AbstractModel} TAliasedType Aliased type that is derived from the return value of `aliasModelCallback`.
     * @template {TAliasMap} [TAugmentedType=TAliasMap] Augmented `TTableModel` type to assist with included model aliases.
     * @param {((model: Required<TAugmentedType>) => TAliasedType)} aliasModelCallback Callback that should return an object that would represent your desired aliased type. 
     * (The value to each key/value pair should be the respective column property of the `model` argument provided.)
     * @returns {MyORMContext<TTableModel, TAliasedType>} A new context that is tailored to the state of the command that was built.
     */
    alias(aliasModelCallback) {
        if(this._aliases) throw new MySqlContextSyntaxError("You can only alias or group a table once at a time.");
        /** @returns {Required<TAugmentedType>} */
        const newProxy = () => new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => {
                if (p in this.includeConfigurations) {
                    return newProxy();
                }
                return p;
            }
        });

        const aliases = aliasModelCallback(newProxy());

        /** @type {MyORMContext<TTableModel, TAliasedType>} */
        const ctx = new MyORMContext(this._pool, this._table, this._identityKey, this._options);
        this._transferToNewContext(/** @type {any} */(ctx));
        ctx._aliases = aliases;
        return ctx;
    }

    /**
     * Specifies that your next Query will also pull in the specified related Record from the database.  
     * In order for your related record to be properly included, there needs to be a relationship configured using the `.hasOne` or `.hasMany` function.
     * @example
     * ```js
     * fooContext.hasOne(m => m.Bar.with("FooId").to("BarId"));
     * const myFoos = await fooContext.include(m => m.Bar).getAll();
     * ```
     * param {(model: {[K in keyof Required<OnlyAbstractModels<TTableModel>>]: { 
     * as: (alias: string) => { 
     *      thenInclude: (thenIncludeCallback: (includingModel: Required<OnlyAbstractModels<TTableModel>>[K]) => any) => void 
     * }}}) => void} modelCallback 
     * @template {AbstractModel} TAliasedType
     * @template {OnlyAbstractModelTypes<TTableModel>} [TAugmentedType=OnlyAbstractModelTypes<TTableModel>]
     * @param {(model: Required<TAugmentedType>) => TAliasedType} modelCallback Callback where the argument, `model`, only has properties of non-primitive types to provide clarity to what sub-type (or table) should be included (or joined on).
     * @returns {MyORMContext<TTableModel, TAliasMap & TAliasedType>}
     */
    include(modelCallback) {
        const proxy = new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => p
        })
        const includes = modelCallback(proxy);
        for(const alias in includes) {
            const config = this.includeConfigurations[includes[alias]];
            if(config === undefined) throw new MySqlContextSyntaxError(`You must configure a relationship in order to use ".include" on ${includes[alias]}`);
            config.included = true;
            delete this.includeConfigurations[includes[alias]];
            this.includeConfigurations[/** @type {string} */(alias)] = config;
        }
        /** @type {MyORMContext<TTableModel, TAliasMap & TAliasedType>} */
        const ctx = new MyORMContext(this._pool, this._table, this._identityKey, this._options);
        this._transferToNewContext(ctx);
        return ctx;
    }

    /**
     * Skips a variable amount, `offset`, of records returned from the query by tagging `OFFSET {offset}` to the command.
     * This function is intended to only be used when `.take()` is also used. Otherwise, this will throw an error.
     * @param {number|string} offset Number or number-like string to offset the records your query would return.
     * @returns {MyORMContext<TTableModel, TAliasMap>} A new context that is tailored to the state of the command that was built.
     */
    skip(offset) {
        offset = typeof (offset) === "string" ? parseInt(offset) : offset;
        if (isNaN(offset)) throw new MySqlContextSyntaxError("Must specify a raw number or a parseable number string.");
        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._table, this._identityKey, this._options);
        this._transferToNewContext(ctx);
        ctx._offset = offset;
        return ctx;
    }

    /**
     * Grabs a variable amount, `limit`, of records returned from the query by tagging `LIMIT {limit}` to the command.
     * @param {number|string} limit Number or number-like string to limit the number of records your query should return.
     * @returns {MyORMContext<TTableModel, TAliasMap>} A new context that is tailored to the state of the command that was built.
     */
    take(limit) {
        limit = typeof (limit) === "string" ? parseInt(limit) : limit;
        if (isNaN(limit)) throw new MySqlContextSyntaxError("Must specify a raw number or a parseable number string.");
        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._table, this._identityKey, this._options);
        this._transferToNewContext(ctx);
        ctx._limit = limit;
        return ctx;
    }

    /**
     * Executes a `SELECT` query on the built context.
     * @returns {Promise<(TAliasMap)[]>} List of the returned records from the built query.
     */
    async select() {
        // unwrap aliases so they appear as { root: ..., include1: ..., include2: ..., and so on }
        let unwrapped;
        if(this._aliases) {
            unwrapped = unwrap(this._aliases);
            const aliasList = Object.keys(unwrapped).flatMap(k => Object.keys(unwrapped[k]));
            const filteredAliasList = aliasList.filter((a,n) => aliasList.indexOf(a) == n);
            if (aliasList.length != filteredAliasList.length) {
                throw new MySqlContextSyntaxError(`You cannot have a single alias to multiple columns. (Invalid aliases: ${filteredAliasList.map(i => `"${i}"`).join(',')})`);
            }
        }
        if (this._offset && !this._limit) {
            throw new MySqlContextSyntaxError(`.skip() must be used in conjunction with .take().`);
        }


        let groups = [];
        
        let select = "*";
        if (this._aliases) {
            /** 
             * Mapping to catch group by aggregates and remap to their appropriate SQL syntax.
             * @param {string} table
             * @param {[string,string]} alias
             * @returns {string}
             */
            const mapAliasesCallback = (table, alias) => {
                if (alias[1].startsWith("COUNT(")
                    || alias[1].startsWith("AVG(")
                    || alias[1].startsWith("MAX(")
                    || alias[1].startsWith("MIN(")
                    || alias[1].startsWith("SUM(")) {
                    return `${alias[1]} AS ${alias[0]}`;
                }
                groups = [...groups, `\`${table}\`.\`${alias[1]}\``];
                return `\`${table}\`.\`${alias[1]}\` AS \`${alias[0]}\``;
            }
            // if distincts, remap alias[0] to position 1 and alias[1] to position 0, then index into distincts and remap back to aliases.
            let includedTableSelects = [];
            let thisTableSelects = [];
            for(const key in unwrapped) {
                // Key is a column part of the main table.
                if(key === "root") {
                    thisTableSelects = Object.entries(unwrapped.root).map(alias => mapAliasesCallback(this._table, alias));
                }
                // Key is a column part of an included table.
                if(key in this.includeConfigurations) {
                    includedTableSelects = [
                        ...includedTableSelects, 
                        ...Object.entries(unwrapped[key]).map(alias => mapAliasesCallback(this.includeConfigurations[key].name, alias))
                    ];
                }
            }
            select = [...thisTableSelects, ...includedTableSelects].join('\n\t\t,');
        }

        const from = [`\`${this._table}\``, ...Object.values(this.includeConfigurations).filter(ic => ic.included).map(ic => `\`${ic.name}\` ON \`${this._table}\`.\`${ic.thisKey}\`=\`${ic.name}\`.\`${ic.thatKey}\``)].join('\n\t\tJOIN ');
        const where = this._where != null ? this._where.toString() : "";
        const groupBy = groups.length > 0 ? `\n\tGROUP BY ${groups.join('\n\t\t,')}`: "";
        const orderBy = this._sortByKeys.length > 0 ? `\n\tORDER BY ${this._sortByKeys.map(o => `${String(o.column)} ${o.direction}`).join('\n\t\t,')}` : "";
        const limit = this._limit != null ? "\n\tLIMIT ?" : "";
        const offset = this._offset != null ? "\n\tOFFSET ?" : "";
        const cmd = `SELECT ${select}`
            +`\n\tFROM ${from}`
            + ` ${where}`
            + ` ${groupBy}`
            + ` ${orderBy}`
            + ` ${limit}`
            + ` ${offset}`;
        let args = [...this._where != null ? this._where.getArgs() : []];
        if(this._limit) {
            args = [...args, this._limit];
        }
        if(this._offset) {
            args = [...args, this._offset]
        }
        let ts = await this._query(cmd, args);

        // If there were any includes, then we need to remap the aliases
        if(this._aliases && Object.values(this.includeConfigurations).map(ic => ic.included).filter(included => included).length > 0) {
            ts = ts.map(t => mapResultToAlias(t, this._aliases, augmentNestedObject(unwrapped)));
        }

        return /** @type {any} */ (ts);
    }

    /**
     * Gets the total number of records that are stored in the Table this context represents.
     * @returns {Promise<number>} Number specifying the total count of all records that were queried from this command.
     */
    async count() {
        const from = [`\`${this._table}\``, ...Object.values(this.includeConfigurations).filter(ic => ic.included).map(ic => `\`${ic.name}\` ON \`${this._table}\`.\`${ic.thisKey}\`=\`${ic.name}\`.\`${ic.thatKey}\``)].join('\n\t\tJOIN ');
        const where = this._where != null ? this._where.toString() : "";
        const cmd = `SELECT COUNT(*) AS \`$$count\``
            + `\n\tFROM ${from}`
            + ` ${where}`;
        let args = [...this._where != null ? this._where.getArgs() : []];
        let ts = await this._query(cmd, args);

        return ts[0].$$count;
    }

    /**
     * Insert a single TTableModel model object into the Table this context represents. 
     * @param {TTableModel} record A list of TTableModel model objects to insert into the Table.
     * @returns {Promise<TTableModel>} TTableModel model object that was inserted.
     * If an Auto Increment Primary Key was specified, the Insert ID will be updated.
     */
    async insertOne(record) {
        return (await this.insertMany([record]))[0];
    }

    /**
     * Insert a multiple TTableModel model objects into the Table this context represents. 
     * @param {TTableModel[]} records A list of TTableModel model objects to insert into the Table.
     * @returns {Promise<TTableModel[]>} List of the TTableModel model objects that were inserted. 
     * If an Auto Increment Primary Key was specified, the Insert ID for each object will be updated appropriately.
     */
    async insertMany(records) {
        // This is a semi-complex function, so comments are tagged above most lines of code to help any users interpret the functionality.
        if (!Array.isArray(records) || records.length <= 0) return [];
        if(this._identityKey != null) {
            records.forEach(r => {
                // @ts-ignore
                delete r[this._identityKey];
            })
        }
        // Copy the records.
        /** @type {(records: TTableModel[]) => TTableModel[]} */
        const clone = (recs) => JSON.parse(JSON.stringify(recs));
        // Get all unique keys from all of the records. (also remove the column representing the incrementing key, if it was specified and exists)
        const allKeys = clone(records).flatMap(rec => Object.keys(rec)).filter((rec,n,self) => self.indexOf(rec) == n);
        const keysFiltered = allKeys.filter(col => this._identityKey == null || col != this._identityKey).filter(col => records[0][col] instanceof Date || typeof(records[0][col]) !== "object");

        // sort, so the keys don't get mangled to the wrong values.
        if(this._options.sortKeys) {
            keysFiltered.sort();
        }
        // Use the keys to create our INTO (...columns) part.
        const cols = keysFiltered.map(col => `\`${col}\``).join(', ');
        // Create an array of (?[,...?]) strings that represent each record to insert.
        const vals = Array.from(Array(records.length).keys()).map(_ => `(${Array.from(Array(keysFiltered.length).keys()).map(_ => '?').join(',')})`).join(',');
        // Create an array of all of the arguments. (any records that do not have the column that was being inserted just has null get inserted EXPLICITLY)
        const args = records.flatMap(rec => keysFiltered.map(k => k in rec ? rec[k] : null));
        
        const cmd = `INSERT INTO \`${this._table}\` (${cols}) VALUES ${vals}`;
        const insertIds = await this._insert(cmd, args);

        if(this._identityKey != null) {
            // Map "items" so their Id reflects the database.
            return records.map((rec,n) => {
                //@ts-ignore
                rec[this._identityKey] = insertIds[n];
                return rec;
            });
        }
        return records;
    }

    /**
     * Update many existing TTableModel model objects in the Table this context represents.
     * @param {Partial<Omit<Omit<TTableModel, keyof OnlyAbstractModels<TTableModel>>, keyof OnlyAbstractModelArrays<TTableModel>>>} record List of TTableModel model objects to insert into the Table.
     * @returns {Promise<number>} Number of affected rows.
     */
    async update(record) {
        if (Object.keys(record).length <= 0) throw Error('The record passed has no keys to represent the column(s) to update.');
        if (this._where == null || this._where.getArgs().length <= 0) {
            throw Error('No WHERE clause was built, possibly resulting in all records in the table being updated.'
                + '\n\tIf you are sure you know what you are doing, then use the "updateAll" function.');
        }

        // Serialize the value sets, removing the AUTO_INCREMENT key if it exists in the record.
        const sets = Object.keys(record).filter(key => this._identityKey == null || key != this._identityKey).map(key => `\`${key}\`=?`).join(', ');
        const args = Object.entries(record).filter(([k, _]) => this._identityKey == null || k != this._identityKey).map(([_,v]) => v);

        const cmd = `UPDATE \`${this._table}\` SET ${sets} ${this._where.toString()}`;
        const numRowsAffected = this._update(cmd, [...args, ...this._where.getArgs()]);
        return numRowsAffected;
    }

    /**
     * Update all records in the Table this context represents.
     * WARNING: This function will update all records in the table. 
     * To avoid accidental calls to this function, an Error will be thrown warning the developer prompting them to set "allowUpdateOnAll" to true in the options.
     * @param {Partial<Omit<Omit<TTableModel, keyof OnlyAbstractModels<TTableModel>>, keyof OnlyAbstractModelArrays<TTableModel>>>} record TTableModel model object to use to update all the records.
     * @returns {Promise<number>} Number of affected rows.
     */
    async updateAll(record) {
        if (Object.keys(record).length <= 0) throw Error('The record passed has no keys to represent the column(s) to update.');
        if(!this._options.allowUpdateOnAll) {
            throw Error('You are trying to update all records in the table with no filter.'
                + '\n\tIf you are trying to update select records, see "updateMany".'
                + '\n\tIf you know what you are doing, then pass into the "options" parameter in the constructor, "allowUpdateOnAll: true"');
        }

        // Serialize the value sets, removing the AUTO_INCREMENT key if it exists in the record.
        const sets = Object.keys(record).filter(key => this._identityKey != null && key != this._identityKey).map(key => `\`${key}\`=?`).join(', ');
        const args = Object.entries(record).filter(([k, _]) => this._identityKey != null && k != this._identityKey).map(([_, v]) => v);

        const cmd = `UPDATE \`${this._table}\` SET ${sets}`;
        const numRowsAffected = this._update(cmd, args);
        return numRowsAffected;
    }

    /**
     * Delete many records from the table this context represents.
     * @returns {Promise<number>} Number of deleted rows.
     */
    async delete() {
        if (this._where == null || this._where.getArgs().length <= 0) {
            throw Error('No WHERE clause was built, possibly resulting in all records in the table being deleted.'
                + '\n\tIf you are sure you know what you are doing, then use the "truncate" function.');
        }
        const cmd = `DELETE FROM \`${this._table}\`${this._where.toString()}`;
        const ts = await this._delete(cmd, this._where.getArgs());
        return ts;
    }

    /**
     * Truncate the table this context represents.
     * WARNING: This function will delete all records in the table. 
     * To avoid accidental calls to this function, an Error will be thrown warning the developer prompting them to set "allowTruncation" to true in the options.
     * @returns {Promise<number>} Number of deleted rows.
     */
    async truncate() {
        if (!this._options.allowTruncation) {
            throw Error('You are trying to delete all records in the table. '
                + '\n\tIf you are trying to delete select records, see "deleteMany". '
                + '\n\tIf you know what you are doing, then pass into the "options" parameter in the constructor, "allowTruncation: true"');
        }
        const cmd = `TRUNCATE TABLE \`${this._table}\``;
        const ts = await this._delete(cmd);
        return ts;
    }

    /**
     * Adds a listener event to the Connection Pool associated with this Table Context whenever ANY command is successfully executed on the pool.
     * @param {SuccessHandler} callback Function that executes when a command is sucessfully executed on this context.
     */
    onSuccess(callback) {
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_QUERY}-${this._table}`, callback);
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_INSERT}-${this._table}`, callback);
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_UPDATE}-${this._table}`, callback);
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_DELETE}-${this._table}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this Table Context whenever ANY command fails execution on the pool.
     * @param {FailHandler} callback Function that executes when a command has been executed and has failed on this context.
     */
    onFail(callback) {
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_QUERY_FAILED}-${this._table}`, callback);
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_INSERT_FAILED}-${this._table}`, callback);
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_UPDATE_FAILED}-${this._table}`, callback);
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_DELETE_FAILED}-${this._table}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this Table Context 
     * whenever a Query command is successfully executed on the pool.
     * @param {SuccessHandler} success Function that executes when a query command is executed on this context.
     */
    onQuerySuccess(success) {
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_QUERY}-${this._table}`, success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this Table Context 
     * whenever an Insert command is successfully executed on the pool.
     * @param {SuccessHandler} success Function that executes when an insert command is executed on this context.
     */
    onInsertSuccess(success) {
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_INSERT}-${this._table}`, success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this Table Context 
     * whenever an Update command is successfully executed on the pool.
     * @param {SuccessHandler} success Function that executes when an update command is executed on this context.
     */
    onUpdateSuccess(success) {
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_UPDATE}-${this._table}`, success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this Table Context 
     * whenever a Delete command is successfully executed on the pool.
     * @param {SuccessHandler} success Function that executes when a delete command is executed on this context.
     */
    onDeleteSuccess(success) {
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_DELETE}-${this._table}`, success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this Table Context 
     * whenever a Query command has been executed and has failed on the pool.
     * @param {FailHandler} fail Function that executes when a query command is fails execution on this context.
     */
    onQueryFail(fail) {
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_QUERY}-${this._table}`, fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this Table Context 
     * whenever an Insert command has been executed and has failed on the pool.
     * @param {FailHandler} fail Function that executes when an insert command is fails execution on this context.
     */
    onInsertFail(fail) {
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_INSERT}-${this._table}`, fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this Table Context 
     * whenever an Update command has been executed and has failed on the pool.
     * @param {FailHandler} fail Function that executes when an update command is fails execution on this context.
     */
    onUpdateFail(fail) {
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_UPDATE}-${this._table}`, fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this Table Context 
     * whenever a Delete command has been executed and has failed on the pool.
     * @param {FailHandler} fail Function that executes when a delete command is fails execution on this context.
     */
    onDeleteFail(fail) {
        this._pool.addListener(`${MyORMContext.EVENT_TABLE_CONTEXT_DELETE}-${this._table}`, fail);
    }

    /**
     * @template {TAliasMap} NewTAliasType
     * @param {MyORMContext<TTableModel, NewTAliasType>} ctx 
     */
    _transferToNewContext(ctx) {
        ctx._where = this._where;
        ctx._aliases = this._aliases;
        ctx._offset = this._offset;
        ctx._limit = this._limit;
        ctx._sortByKeys = this._sortByKeys;
        ctx._grouped = this._grouped;
        ctx.includeConfigurations = JSON.parse(JSON.stringify(this.includeConfigurations));

        this._where = null;
        this._aliases = undefined;
        this._limit = undefined;
        this._offset = undefined;
        this._grouped = false;
        this._sortByKeys = [];
        Object.keys(this.includeConfigurations).map(ic => this.includeConfigurations[ic].included = false);
    }
}

/**
 * Gets the keys that intersect of all objects in a given array.
 * @param {any[]} os
 * @param {any} o1
 * @param {any} o2
 * @returns {any[]}
 */
function intersect(os, o1=undefined, o2=undefined) {
    if (!o1) return intersect(os.slice(1), o2, os[0]);
    if(!o2) return [];
    const intersected = Object.keys(o1).filter(k => k in o2);
    if(os.length > 0) {
        return [...intersected, intersect(os.slice(1), o2, os[0])];
    }
    return intersected;
}

/**
 * Unwraps an object of nested objects to be a key/value pair where key will be `root` if it was in the root of the original object
 * or {key} if the respective value to {key} was an object.  
 * If any key/value pairs having conflicting keys, the last key/value pair will be exist, while the others will not exist.
 * @param {*} o 
 * @returns 
 */
function unwrap(o) {
    if (!o) return o;
    let dict = { root: {} };
    for (const key in o) {
        if (typeof (o[key]) === "object") {
            dict[key] = unwrap(o[key]).root;
        } else {
            dict.root[key] = o[key];
        }
    }
    return dict;
}

/**
 * Turns a finite nested object into a single object with all subkeys of each object.
 * @param {any} obj 
 * @returns {any}
 */
function augmentNestedObject(obj) {
    return Object.assign({}, ...function _flatten(o) { 
        return [].concat(...Object.keys(o).map(k => typeof o[k] === 'object' ? _flatten(o[k]) : ({ [k]: o[k] }))) 
    }(obj));
}

/**
 * Maps the result of a query with an alias map that has included tables.
 * @param {any} object 
 * @param {any} aliasMap 
 * @param {any} unwrappedAliases
 * @returns {any}
 */
function mapResultToAlias(object, aliasMap, unwrappedAliases) {
    let o = {};
    for(const aliasKey in aliasMap) {
        if(typeof(aliasMap[aliasKey]) === "object") {
            o[aliasKey] = mapResultToAlias(object, aliasMap[aliasKey], unwrappedAliases);
        } else {
            o[aliasKey] = object[aliasKey];
        }
    }
    return o;
}