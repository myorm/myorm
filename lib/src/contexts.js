//@ts-check
import { createPool } from "mysql2/promise";
import { MySqlContextDeleteError, MySqlContextInsertError, MySqlContextQueryError, MySqlContextSyntaxError, MySqlContextUpdateError } from './exceptions.js';
import { Where, WhereBuilder } from './where-builder.js';

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
 * @template {AbstractModel} TTableModel
 * @typedef {object} ViewConfig
 * @prop {WhereBuilder<TTableModel>?} where 
 * @prop {AbstractModel=} aliases 
 * @prop {number=} limit 
 * @prop {number=} offset
 * @prop {{column: keyof TTableModel, direction: "ASC"|"DESC"}[]} sortBy
 * @prop {boolean} isGrouped 
 * @prop {Partial<{[K in keyof OnlyAbstractModels<TTableModel>]: { included: boolean, name: string, thisKey: keyof TTableModel, thatKey: string, type: "1:1"|"1:n" }}>=} includes
*/

/**
 * @template {AbstractModel} T
 * @typedef {object} SortByKeyConfig
 * @prop {keyof T} column
 * @prop {"ASC"|"DESC"} direction
 */

/**
 * @template {AbstractModel} T
 * @typedef {object} DirectionCallbacks
 * @prop {() => SortByKeyConfig<T>} asc
 * @prop {() => SortByKeyConfig<T>} ascending
 * @prop {() => SortByKeyConfig<T>} desc
 * @prop {() => SortByKeyConfig<T>} descending
 */

/** 
 * Object that holds context to a specific Table in your MySQL database. To ensure type-safety in vanilla JavaScript, use JSDOC typing.
 * @template {AbstractModel} TTableModel Model that represents the Table this Context represents.
 * @template {AbstractModel} [TAliasMap=OnlyNonAbstractModels<TTableModel>] Alias Map, is not intended to be given by the User. This is used to assist with return types from SELECT given aliases.
 */
export class MyORMContext {
    /** 
     * Some key from the table that represents the Identity primary key. (if applicable)
     * @protected 
     * @type {keyof TTableModel|null} 
     */ 
    _identityKey;

    /** 
     * Pool this context is pulling connections from.
     * @protected 
     * @type {import('mysql2/promise').Pool} 
     */
    _pool;

    /** 
     * Name of the table as it appears in the database
     * @protected 
     * @type {string} 
     */ 
    _realTableName;

    /** 
     * MyORMContext specific options for various behavior across the table.
     * @protected 
     * @type {TableContextOptions} 
     */ 
    _options;

    /** 
     * Configurations for (informal) foreign relationships for use with `.include()` (or otherwise joining tables.)
     * @protected 
     * @type {Partial<{[K in keyof OnlyAbstractModels<TTableModel>]: { included: boolean, name: string, thisKey: keyof TTableModel, thatKey: string, type: "1:1"|"1:n" }}>} 
     */ 
    _includeConfigurations = {};

    // All of the below private variables are used for generation of commands and transferring to view created contexts.

    /** @protected @type {WhereBuilder<TTableModel>?} */ _where;
    /** @protected @type {AbstractModel=} */ _aliases;
    /** @protected @type {number=} */ _limit;
    /** @protected @type {number=} */ _offset;
    /** @protected @type {{ column: keyof TTableModel, direction: "ASC"|"DESC"}[]} */ _sortByKeys = [];
    /** @protected @type {boolean} */ _grouped = false;
    /** @protected @type {ViewConfig<TTableModel>} */ 
    _view = {
        where: null,
        aliases: undefined,
        limit: 0,
        offset: 0,
        sortBy: [],
        isGrouped: false,
        includes: undefined
    };
    /** @protected @type {boolean} */ _isView = false;

    /**
     * Creates a Connection Pool ready for use inside of multiple MySqlTableContext objects.
     * @param {import('mysql2/promise').PoolOptions} config Configuration to create the pool on.
     * @returns {import('mysql2/promise').Pool} Connection Pool.
     */
    static createPool(config) {
        return createPool({ decimalNumbers: true, bigNumberStrings: true, connectionLimit: 20, ...config });
    }

    /**
     * Execute a stored procedure given a configuration setup or an already instantiated MySql2 Pool.
     * @template {any} [T=any]
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolOptions} configOrPool MySql2 config options to create a Pool object with or an existing Pool.
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
        return /** @type {T[]} */ (result[0]);
    }

    /**
     * Creates a new MyORMContext object given the `mysql2` config options or an already created `mysql2` pool.
     * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolOptions} configOrPool `mysql2` config options to create a Pool object with or an existing Pool.
     * @param {string} realTableName Name of the table in your MySQL database this context is connecting to.
     * @param {(keyof TTableModel)?} identityKey Primary key of the table that is an `AUTO_INCREMENT` key, or otherwise an Identity key. If there is no key, then leave this null or undefined.
     * @param {TableContextOptions} options Context options that enable certain features, such as truncation, updating all, or sorting query result keys.
     */
    constructor(configOrPool, realTableName, identityKey=null, options = {}) {
        this._realTableName = realTableName;
        this._identityKey = identityKey;
        if ('query' in configOrPool) {
            this._pool = configOrPool
        } else {
            this._pool = createPool(configOrPool);
        }
        this._options = { 
            allowTruncation: false, 
            allowUpdateOnAll: false, 
            sortKeys: false, 
            ...options 
        };
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
                                        self._includeConfigurations[p] = { 
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
                                self._includeConfigurations[p] = {
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
                                        self._includeConfigurations[p] = { 
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
                                self._includeConfigurations[p] = {
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
                this._where = Where(String(p), this._realTableName);
                return this._where;
            }
        });
        whereCallback(proxy);

        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options);
        this._transferToNewContext(ctx);
        
        return ctx;
    }

    /** @template T @typedef {T extends Function ? never : T} NotFunction */

    /**
     * <
     * @param {(m: {[K in keyof TTableModel]: SortByKeyConfig<TTableModel> & DirectionCallbacks<TTableModel>}) => SortByKeyConfig<TTableModel>|SortByKeyConfig<TTableModel>[] } orderByCallback 
     * @returns 
     */
    sortBy(orderByCallback) {
        this._sortByKeys = [];
        const proxy = new Proxy(/** @type {any} */({}), {
            get: (t,p,r) => {
                /** @type {SortByKeyConfig<TTableModel> & DirectionCallbacks<TTableModel>} */
                const sbk = {
                    column: String(p),
                    direction: "ASC",
                    asc: () => {
                        sbk.direction = "ASC";
                        return sbk;
                    },
                    desc: () => {
                        sbk.direction = "DESC";
                        return sbk;
                    },
                    ascending: () => {
                        sbk.direction = "ASC";
                        return sbk;
                    },
                    descending: () => {
                        sbk.direction = "DESC";
                        return sbk;
                    }
                };
                return sbk;
            }
        });
        const sbKeys = orderByCallback(proxy);
        this._sortByKeys = Array.isArray(sbKeys) ? sbKeys : [sbKeys];
        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options);
        this._transferToNewContext(ctx);
        return ctx;
    }

    /**
     * Group your 
     * @template {AbstractModel} TGroupedType
     * @template {TAliasMap} [TAugmentedType=TAliasMap] Augmented `TTableModel` type to assist with included model aliases.
     * @param {(m: TAugmentedType, aggregate: Aggregates<TAliasMap>) => TGroupedType } groupByCallback
     * @returns {MyORMContext<TTableModel, TGroupedType>}
     */
    groupBy(groupByCallback) {
        if (this._aliases) throw new MySqlContextSyntaxError("You can only alias or group a table once at a time.");
        this._grouped = true;
        let includeAliases = [];

        /** @returns {Required<TAugmentedType>} */
        const newProxy = (isInclude = false) => new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => {
                if (p in this._includeConfigurations) {
                    if (includeAliases[includeAliases.length - 1] != p) {
                        includeAliases = [...includeAliases, p];
                    }
                    return newProxy(true);
                }
                if (!isInclude) {
                    includeAliases = [...includeAliases, null];
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

        let aliases = groupByCallback(/** @type {any} */(proxy), aggregates);
        // turn one-to-many (array) aliased keys to the original object.
        for (const key in aliases) {
            aliases[key] = Array.isArray(aliases[key]) ? aliases[key][0] : aliases[key];
        }
        const entries = Object.entries(aliases);
        let toDelete = [];
        for (let i = 0; i < includeAliases.length; ++i) {
            const ia = includeAliases[i];
            if (ia == null) continue;
            const config = this._includeConfigurations[ia];
            if (config === undefined) throw new MySqlContextSyntaxError(`You must configure a relationship in order to use ".include" on ${ia}`);
            config.included = true;
            toDelete = [...toDelete, ia];
            this._includeConfigurations[entries[i][0]] = config;
        }

        for (const del of toDelete) {
            delete this._includeConfigurations[del];
        }

        /** @type {MyORMContext<TTableModel, TGroupedType>} */
        const ctx = new MyORMContext(this._pool, this._realTableName);
        this._transferToNewContext(/** @type {any} */(ctx));
        ctx._aliases = aliases;
        return ctx;
    }

    /**
     * Alias your table to a different return type.
     * @template {AbstractModel} TAliasedType Aliased type that is derived from the return value of `aliasModelCallback`.
     * @template {TAliasMap} [TAugmentedType=TAliasMap] Augmented `TTableModel` type to assist with included model aliases.
     * @param {((model: TAugmentedType) => TAliasedType)} aliasModelCallback Callback that should return an object that would represent your desired aliased type. 
     * (The value to each key/value pair should be the respective column property of the `model` argument provided.)
     * @returns {MyORMContext<TTableModel, Partial<TAliasedType> & Pick<TAliasedType, keyof {[K in keyof TAliasedType as undefined extends TAliasedType[K] ? never : K]}>>} A new context that is tailored to the state of the command that was built.
     */
    alias(aliasModelCallback) {
        if(this._aliases) throw new MySqlContextSyntaxError("You can only alias or group a table once at a time.");
        let includedAliases = [];
        /** @returns {Required<TAugmentedType>} */
        const newProxy = (isInclude=false) => new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => {
                if (p in this._includeConfigurations) {
                    if(includedAliases[includedAliases.length -1] != p) {
                        includedAliases = [...includedAliases, p];
                    }
                    return newProxy(true);
                }
                if(!isInclude) {
                    includedAliases = [...includedAliases, null];
                }
                return p;
            }
        });

        let aliases = aliasModelCallback(newProxy());
        // turn one-to-many (array) aliased keys to the original object.
        for(const key in aliases) {
            aliases[key] = Array.isArray(aliases[key]) ? aliases[key][0] : aliases[key];
        }
        const entries = Object.entries(aliases);
        let toDelete = [];
        for(let i = 0; i < includedAliases.length; ++i) {
            const ia = includedAliases[i];
            if(ia == null) continue;
            const config = this._includeConfigurations[ia];
            if(config === undefined) throw new MySqlContextSyntaxError(`You must configure a relationship in order to use ".include" on ${ia}`);
            config.included = true;
            toDelete = [...toDelete, ia];
            this._includeConfigurations[entries[i][0]] = config;
        }

        for(const del of toDelete) {
            delete this._includeConfigurations[del];
        }

        /** @type {MyORMContext<TTableModel, TAliasedType>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options);
        this._transferToNewContext(/** @type {any} */(ctx));
        ctx._aliases = aliases;
        return ctx;
    }

    map = this.alias;

    /** @template T @template U @typedef {T extends U[] ? U : T } PullTypeFromArrayIfArray */

    /**
     * Specifies that your next Query will also pull in the specified related Record from the database.  
     * In order for your related record to be properly included, there needs to be a relationship configured using the `.hasOne` or `.hasMany` function.
     * @template {keyof OnlyAbstractModelTypes<TTableModel>} TSelectedKey
     * @template {OnlyAbstractModelTypes<TTableModel>} [TAugmentedType=OnlyAbstractModelTypes<TTableModel>]
     * @template {{[K in keyof Required<TAugmentedType>]: K}} [T={[K in keyof Required<TAugmentedType>]: K}] 
     * @param {(model: T) => TSelectedKey|(TSelectedKey[])} modelCallback Callback where the argument, `model`, only has properties of non-primitive types to provide clarity to what sub-type (or table) should be included (or joined on).
     * @returns {MyORMContext<TTableModel, TAliasMap & Pick<Required<TAugmentedType>, TSelectedKey>>}
     */
    include(modelCallback) {
        const proxy = new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => p
        })
        const include = modelCallback(proxy);
        const includes = Array.isArray(include) ? include : [include];
        for(const inc of includes) {
            // @ts-ignore TypeScript says `TSelectedKey cannot be used to index...`, (which just don't make sense)
            const config = this._includeConfigurations[inc];
            if(config === undefined) throw new MySqlContextSyntaxError(`You must configure a relationship in order to use ".include" on ${String(inc)}`);
            config.included = true;
            // @ts-ignore TypeScript says `TSelectedKey cannot be used to index...`, (which just don't make sense)
            delete this._includeConfigurations[inc];
            this._includeConfigurations[/** @type {string} */(inc)] = config;
        }
        /** @type {MyORMContext<TTableModel, TAliasMap & Required<TAugmentedType>>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options);
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
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options);
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
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options);
        this._transferToNewContext(ctx);
        ctx._limit = limit;
        return ctx;
    }

    /**
     * Turns this context into a view, so all of the previously built aliases and clauses will remain.
     * @returns {this}
     */
    view() {
        this._isView = true;
        this._view = {
            where: this._where,
            aliases: this._aliases,
            sortBy: this._sortByKeys,
            isGrouped: this._grouped,
            limit: this._limit,
            offset: this._offset,
            includes: JSON.parse(JSON.stringify(this._includeConfigurations))
        };
        return this;
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
            const filteredAliasList = aliasList.filter((a,n,self) => self.indexOf(a) != n);
            if (filteredAliasList.length > 0) {
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
                if(this._grouped) {
                    groups = [...groups, `\`${table}\`.\`${alias[1]}\``];
                }
                return `\`${table}\`.\`${alias[1]}\` AS \`${alias[0]}\``;
            }
            // if distincts, remap alias[0] to position 1 and alias[1] to position 0, then index into distincts and remap back to aliases.
            let includedTableSelects = [];
            let thisTableSelects = [];
            for(const key in unwrapped) {
                console.log(key, this._includeConfigurations);
                // Key is a column part of the main table.
                if(key === "root") {
                    thisTableSelects = Object.entries(unwrapped.root).map(alias => mapAliasesCallback(this._realTableName, alias));
                }
                // Key is a column part of an included table.
                if(key in this._includeConfigurations) {
                    includedTableSelects = [
                        ...includedTableSelects, 
                        ...Object.entries(unwrapped[key]).map(alias => mapAliasesCallback(this._includeConfigurations[key].name, alias))
                    ];
                }
            }
            select = [...thisTableSelects, ...includedTableSelects].join('\n\t\t,');
        }

        const where = this._where != null ? this._where.toString() : "";
        const groupBy = groups.length > 0 ? `\n\tGROUP BY ${groups.join('\n\t\t,')}`: "";
        const orderBy = this._sortByKeys.length > 0 ? `\n\tORDER BY ${this._sortByKeys.map(o => `${String(o.column)} ${o.direction}`).join('\n\t\t,')}` : "";
        let limit = this._limit != null ? "\n\tLIMIT ?" : "";
        let offset = this._offset != null ? "\n\tOFFSET ?" : "";

        let thisTable = `\`${this._realTableName}\``;
        if(Object.values(this._includeConfigurations).map(v => v.included && v.type == "1:n")) {
            thisTable = `(SELECT * FROM ${thisTable} ${limit} ${offset}) AS ${thisTable}`;
            limit = offset = "";
        }
        const from = [thisTable, ...Object.values(this._includeConfigurations).filter(ic => ic.included).map(ic => `\`${ic.name}\` ON \`${this._realTableName}\`.\`${ic.thisKey}\`=\`${ic.name}\`.\`${ic.thatKey}\``)].join('\n\t\tLEFT JOIN ');
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

        let returning = [];

        // THIS NEXT SECTION IS COMPLEX.
        // What happens next is we remap aliases to included tables.
        // For 1:1 relationships, this is easy, where we just rely on `mapResultToAlias`.
        // However, for 1:n relationships, we need to take the results, serialize them into one object where
        // the main table's keys are alike, and then use the results to create an array on the many include.

        // If there were any includes, then we need to remap the aliases
        if(Object.values(this._includeConfigurations).map(ic => ic.included).filter(included => included).length > 0) {
            if(!this._aliases) throw new MySqlContextSyntaxError("You must alias your context if you intend to include related tables.");
            ts = ts.map(t => mapResultToAlias(t, this._aliases, augmentNestedObject(unwrapped)));
            // All one to many keys that were included in this query.
            let oneToManyKeys = Object.keys(this._includeConfigurations).filter(k => this._includeConfigurations[k].included && this._includeConfigurations[k].type == "1:n");
            // for one to many relationships
            if(oneToManyKeys.length > 0) {
                // Filter out duplicate objects by all keys being equal. (one-to-many keys are ignored)
                const tsFiltered = ts.filter((t,n) => {
                    return n == ts.findIndex(item => {
                        let isEqual = true;
                        for (const key in t) {
                            if(oneToManyKeys.includes(key)) continue;
                            isEqual = item[key] == t[key];
                            if (!isEqual) break;
                        }
                        return isEqual;
                    });
                });

                // Remap each object 
                for(const t of tsFiltered) {
                    // Get all objects that relate to `t` by all keys being equal. (one-to-many keys are ignored)
                    const tsForT = ts.filter((ot) => {
                        let isEqual = true;
                        for(const key in ot) {
                            if(oneToManyKeys.includes(key)) continue;
                            isEqual = t[key] == ot[key];
                            if(!isEqual) break;
                        }
                        return isEqual;
                    });

                    // Remap all one to many keys into an array.
                    if(tsForT.length > 0) {
                        let remapped = tsForT[0];
                        for(const key of oneToManyKeys) {
                            // if the key isn't in remapped, then it was never aliased.
                            if(!(key in remapped)) continue;
                            //@ts-ignore
                            remapped[key] = [remapped[key]];
                            for(let i = 1; i < tsForT.length; ++i) {
                                if(tsForT[i]) {
                                    //@ts-ignore
                                    remapped[key] = [...remapped[key], tsForT[i][key]];
                                }
                            }

                            // since the operation is a LEFT JOIN, we want to change all included keys to an empty array if the nested included table are all null prop/values
                            // @ts-ignore
                            remapped[key] = remapped[key].filter(o => Object.values(o).filter(v => v != null).length > 0);
                        }
                        returning = [...returning, remapped];
                    }
                }
                
            } else {
                returning = ts;
            }
        } else {
            returning = ts;
        }

        return /** @type {any} */ (returning);
    }

    /**
     * Gets the total number of records that are stored in the Table this context represents.
     * @returns {Promise<number>} Number specifying the total count of all records that were queried from this command.
     */
    async count() {
        const from = [`\`${this._realTableName}\``, ...Object.values(this._includeConfigurations).filter(ic => ic.included).map(ic => `\`${ic.name}\` ON \`${this._realTableName}\`.\`${ic.thisKey}\`=\`${ic.name}\`.\`${ic.thatKey}\``)].join('\n\t\tJOIN ');
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
     * @param {TAliasMap} record A list of TTableModel model objects to insert into the Table.
     * @returns {Promise<TAliasMap>} TTableModel model object that was inserted.
     * If an Auto Increment Primary Key was specified, the Insert ID will be updated.
     */
    async insertOne(record) {
        return (await this.insertMany([record]))[0];
    }

    /**
     * Insert a multiple TTableModel model objects into the Table this context represents. 
     * @param {TAliasMap[]} records A list of TTableModel model objects to insert into the Table.
     * @returns {Promise<TAliasMap[]>} List of the TTableModel model objects that were inserted. 
     * If an Auto Increment Primary Key was specified, the Insert ID for each object will be updated appropriately.
     */
    async insertMany(records) {
        
        let aliasesSwapped;
        if(this._aliases) {
            aliasesSwapped = Object.fromEntries(Object.entries(this._aliases).map(([col, alias]) => [alias, col]));
        }
        // This is a semi-complex function, so comments are tagged above most lines of code to help any users interpret the functionality.
        if (!Array.isArray(records) || records.length <= 0) return [];
        if(this._identityKey != null) {
            records.forEach(r => {
                delete r[this._aliases ? aliasesSwapped[this._identityKey] : this._identityKey];
            })
        }
        // Get all unique keys from all of the records. (also remove the column representing the incrementing key, if it was specified and exists)
        const allKeys = records.flatMap(rec => Object.keys(rec)).filter((rec,n,self) => self.indexOf(rec) == n);

        // Filter keys so non SQL types are removed.
        const keysFiltered = allKeys.filter(col => this._identityKey == null || col != this._identityKey).filter(col => records[0][col] instanceof Date || typeof(records[0][col]) !== "object");

        // sort, so the keys don't get mangled to the wrong values.
        if(this._options.sortKeys) {
            keysFiltered.sort();
        }

        // Use the keys to create our INTO (...columns) part. If there was an alias, then we need to remap.
        let cols = keysFiltered.map(col => {
            if(this._aliases != undefined) {
                if (col in this._aliases) {
                    return `\`${this._realTableName}\`.\`${this._aliases[col]}\``;
                } else {
                    throw new MySqlContextSyntaxError("Cannot insert an unrecognized alias.");
                }
            }
            return `\`${this._realTableName}\`.\`${col}\``;
        }).join('\n\t\t, ');

        // Create an array of (?[,...?]) strings that represent each record to insert.
        const vals = Array.from(Array(records.length).keys()).map(_ => `(${Array.from(Array(keysFiltered.length).keys()).map(_ => '?').join(',')})`).join('\n\t\t,');
        // Create an array of all of the arguments. (any records that do not have the column that was being inserted just has null get inserted EXPLICITLY)
        const args = records.flatMap(rec => keysFiltered.map(k => k in rec ? rec[k] : null));
        
        const cmd = `INSERT INTO \`${this._realTableName}\`\n\t(${cols})\n\tVALUES ${vals}`;
        const insertIds = await this._insert(cmd, args);

        if(this._identityKey != null) {
            // Map "items" so their Id reflects the database.
            return records.map((rec,n) => {
                //@ts-ignore
                rec[this._aliases && this._identityKey in aliasesSwapped ? aliasesSwapped[this._identityKey] : this._identityKey] = insertIds[n];
                return rec;
            });
        }
        return records;
    }

    /**
     * Update a single existing TTableModel model object in the Table this context represents.
     * @param {Partial<TAliasMap>} record TTableModel object to insert
     * @returns {Promise<number>} Number of affected rows.
     */
    async update(record) {
        if (Object.keys(record).length <= 0) throw new MySqlContextSyntaxError('The record passed has no keys to represent the column(s) to update.');
        if (this._where == null || this._where.getArgs().length <= 0) {
            throw Error('No WHERE clause was built, possibly resulting in all records in the table being updated.'
                + '\n\tIf you are sure you know what you are doing, then use the "updateAll" function.');
        }
        // Serialize the value sets, removing the AUTO_INCREMENT key if it exists in the record.
        const sets = Object.keys(record).filter(key => this._identityKey == null || key != this._identityKey).map(key => {
            if(this._aliases) {
                if(!(key in this._aliases)) {
                    throw new MySqlContextSyntaxError(`The attempted key, "${key}", to update is not properly aliased."`);
                }
                return `\`${this._aliases[key]}\` = ?`;
            }
            return `\`${key}\` = ?`;
        }).join('\n\t\t,');
        const args = Object.entries(record).filter(([k, _]) => this._identityKey == null || k != this._identityKey).map(([_,v]) => v);

        const cmd = `UPDATE \`${this._realTableName}\`\n\tSET ${sets} ${this._where.toString()}`;
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
        if (Object.keys(record).length <= 0) throw new MySqlContextSyntaxError('The record passed has no keys to represent the column(s) to update.');
        if(!this._options.allowUpdateOnAll) {
            throw Error('You are trying to update all records in the table with no filter.'
                + '\n\tIf you are trying to update select records, see "updateMany".'
                + '\n\tIf you know what you are doing, then pass into the "options" parameter in the constructor, "allowUpdateOnAll: true"');
        }

        // Serialize the value sets, removing the AUTO_INCREMENT key if it exists in the record.
        const sets = Object.keys(record).filter(key => this._identityKey == null || key != this._identityKey).map(key => {
            if (this._aliases) {
                if (!(key in this._aliases)) {
                    throw new MySqlContextSyntaxError(`The attempted key, "${key}", to update is not properly aliased."`);
                }
                return `\`${this._aliases[key]}\` = ?`;
            }
            return `\`${key}\` = ?`;
        }).join('\n\t\t,');
        const args = Object.entries(record).filter(([k, _]) => this._identityKey != null && k != this._identityKey).map(([_, v]) => v);

        const cmd = `UPDATE \`${this._realTableName}\`\n\tSET ${sets} ${this._where != null ? this._where.toString() : ""}`;
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
        const cmd = `DELETE FROM \`${this._realTableName}\`${this._where.toString()}`;
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
        const cmd = `TRUNCATE TABLE \`${this._realTableName}\``;
        const ts = await this._delete(cmd);
        return ts;
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context whenever ANY command is successfully executed on the pool.
     * @param {SuccessHandler} callback Function that executes when a command is sucessfully executed on this context.
     */
    onSuccess(callback) {
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_QUERY}-${this._realTableName}`, callback);
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_INSERT}-${this._realTableName}`, callback);
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_UPDATE}-${this._realTableName}`, callback);
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_DELETE}-${this._realTableName}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context whenever ANY command fails execution on the pool.
     * @param {FailHandler} callback Function that executes when a command has been executed and has failed on this context.
     */
    onFail(callback) {
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_QUERY_FAILED}-${this._realTableName}`, callback);
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_INSERT_FAILED}-${this._realTableName}`, callback);
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_UPDATE_FAILED}-${this._realTableName}`, callback);
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_DELETE_FAILED}-${this._realTableName}`, callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command is successfully executed on the pool.
     * @param {SuccessHandler} success Function that executes when a query command is executed on this context.
     */
    onQuerySuccess(success) {
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_QUERY}-${this._realTableName}`, success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Insert command is successfully executed on the pool.
     * @param {SuccessHandler} success Function that executes when an insert command is executed on this context.
     */
    onInsertSuccess(success) {
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_INSERT}-${this._realTableName}`, success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Update command is successfully executed on the pool.
     * @param {SuccessHandler} success Function that executes when an update command is executed on this context.
     */
    onUpdateSuccess(success) {
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_UPDATE}-${this._realTableName}`, success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Delete command is successfully executed on the pool.
     * @param {SuccessHandler} success Function that executes when a delete command is executed on this context.
     */
    onDeleteSuccess(success) {
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_DELETE}-${this._realTableName}`, success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command has been executed and has failed on the pool.
     * @param {FailHandler} fail Function that executes when a query command is fails execution on this context.
     */
    onQueryFail(fail) {
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_QUERY}-${this._realTableName}`, fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Insert command has been executed and has failed on the pool.
     * @param {FailHandler} fail Function that executes when an insert command is fails execution on this context.
     */
    onInsertFail(fail) {
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_INSERT}-${this._realTableName}`, fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Update command has been executed and has failed on the pool.
     * @param {FailHandler} fail Function that executes when an update command is fails execution on this context.
     */
    onUpdateFail(fail) {
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_UPDATE}-${this._realTableName}`, fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Delete command has been executed and has failed on the pool.
     * @param {FailHandler} fail Function that executes when a delete command is fails execution on this context.
     */
    onDeleteFail(fail) {
        this._pool.addListener(`${EVENT_TABLE_CONTEXT_DELETE}-${this._realTableName}`, fail);
    }

    /**
     * Transfers details from this context to another context.
     * @private
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
        ctx._includeConfigurations = JSON.parse(JSON.stringify(this._includeConfigurations));

        this._where = null;
        this._aliases = undefined;
        this._limit = undefined;
        this._offset = undefined;
        this._grouped = false;
        this._sortByKeys = [];
        Object.keys(this._includeConfigurations).map(ic => this._includeConfigurations[ic].included = false);

        if(this._isView) {
            this._where = this._view.where;
            this._aliases = this._view.aliases;
            this._limit = this._view.limit;
            this._offset = this._view.offset;
            this._grouped = this._view.isGrouped;
            this._sortByKeys = this._view.sortBy;
            this.includeConfigurations = JSON.parse(JSON.stringify(this._view.includes));
        }
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
                throw Error("Unrecognized SQL query command.");
            }
            args?.forEach(a => cmdRaw = cmdRaw.replace('?', typeof (a) === "string" || a instanceof Date ? `'${a}'` : a));
            const [result] = await this._pool.query(cmd, args);
            this._pool.emit(`${EVENT_TABLE_CONTEXT_QUERY}-${this._realTableName}`, {
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            });
            return /** @type {TTableModel[]} */ (result);
        } catch (err) {
            this._pool.emit(`${EVENT_TABLE_CONTEXT_QUERY_FAILED}-${this._realTableName}`, {
                error: err,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            })
            throw new MySqlContextQueryError(`An error occurred when attempting to query from ${`[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`}.`, err);
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
            const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await this._pool.execute(cmd, args));
            this._pool.emit(`${EVENT_TABLE_CONTEXT_INSERT}-${this._realTableName}`, {
                affectedRows: result.affectedRows,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args,
            });
            return Array.from(Array(result.affectedRows).keys()).map((_, n) => n + result.insertId);
        } catch (err) {
            this._pool.emit(`${EVENT_TABLE_CONTEXT_INSERT_FAILED}-${this._realTableName}`, {
                error: err,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            });
            throw new MySqlContextInsertError(`An error occurred when attempting to insert into ${`[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`}.`, err);
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
            const result = /** @type {import('mysql2/promise').ResultSetHeader} */ ((await this._pool.execute(cmd, args))[0]);
            this._pool.emit(`${EVENT_TABLE_CONTEXT_UPDATE}-${this._realTableName}`, {
                affectedRows: result.affectedRows,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            });
            return result.affectedRows;
        } catch (err) {
            this._pool.emit(`${EVENT_TABLE_CONTEXT_UPDATE_FAILED}-${this._realTableName}`, {
                error: err,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            });
            throw new MySqlContextUpdateError(`An error occurred when attempting to update ${`[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`}.`, err);
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
                throw Error("Unrecognized SQL delete command.");
            }
            args?.forEach(a => cmdRaw = cmdRaw.replace('?', typeof (a) === "string" || a instanceof Date ? `'${a}'` : a));
            const result = /** @type {import('mysql2/promise').ResultSetHeader} */ ((await this._pool.execute(cmd, args))[0]);
            this._pool.emit(`${EVENT_TABLE_CONTEXT_DELETE}-${this._realTableName}`, {
                affectedRows: result.affectedRows,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            });
            return result.affectedRows;
        } catch (err) {
            this._pool.emit(`${EVENT_TABLE_CONTEXT_DELETE_FAILED}-${this._realTableName}`, {
                error: err,
                dateIso: new Date().toISOString(),
                host: (/** @type {any} */(this._pool.pool.config)).connectionConfig.host,
                schema: `[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`,
                cmdRaw,
                cmdSanitized: cmd,
                args
            })
            throw new MySqlContextDeleteError(`An error occurred when attempting to delete from ${`[${(/** @type {any} */(this._pool.pool.config)).connectionConfig.database}].[dbo].[${this._realTableName}]`}.`, err);
        }
    }
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

// TYPES

/** @typedef {import('mysql2').QueryError} MySql2QueryError */

/** @typedef {{[key: string]: any}} AbstractModel */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel`s.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof T as T[K] extends AbstractModel|undefined ? K : never]: T[K]}} OnlyAbstractModels
 */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel` arrays.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof T as T[K] extends AbstractModel[]|undefined ? K : never]: 
 *      T[K] extends (infer R extends AbstractModel)[]|undefined ? R : never}} OnlyAbstractModelArrays
 */

/** 
 * Filters out an object model type to only have keys that are valued with `AbstractModel` or `AbstractModel` arrays.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof (OnlyAbstractModels<T> & OnlyAbstractModelArrays<T>)]: (OnlyAbstractModels<T> & OnlyAbstractModelArrays<T>)[K]}} OnlyAbstractModelTypes
 */

/**
 * @template {AbstractModel} T
 * @typedef {{[K in keyof T as T[K] extends AbstractModel|undefined ? T[K] extends Date|undefined ? K : never : K]: T[K]}} OnlyNonAbstractModels
 */

/**
 * Callback definition for the `from` function to help configure the Table name for an informal foreign relationship between two tables using `.include()`.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipFrom
 * @param {string} realTableName The real table name for the foreign table being configured.
 * @returns {{with: RelationshipWith<TFrom, TTo>}} Chaining function `with` to further configure the relationship.
 */

/**
 * Callback definition for the `with` function to help configure the foreign key for the `TFrom` table.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipWith
 * @param {keyof TFrom} thisColumnName Some column from `TFrom` that represents the informal foreign relationship to `TTo`.
 * @returns {{to: RelationshipTo<TTo>}} Chaining function `to` to further configure the relationship.
 */

/**
 * Callback definition for the `to` function to help configure the foreign key for the `TTo` table.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipTo
 * @param {TTo extends undefined ? never : keyof TTo} thatColumnName Some column from `TTo` that represents the informal foreign key pair to the previous `.with` function.
 */

/**
 * All of the options available to pass into the "options" argument in the constructor for MySqlTableContext.
 * @typedef {Object} TableContextOptions
 * @property {boolean=} allowUpdateOnAll Permit updating to all records in the Table.
 * @property {boolean=} allowTruncation Permit truncation of the Table.
 * @property {boolean=} sortKeys Sort keys before being inserted. This can possibly prevent any mangling of key/value pairs.
 */

/**
 * @typedef OnSuccessData
 * @property {number?} affectedRows Number of affected rows
 * @property {string} dateIso Date in ISO string format
 * @property {string} host Host of the MySQL server
 * @property {string} schema Schema of database and table in format of [database].[dbo].[table]
 * @property {string} cmdRaw Command in its raw format, including arguments.
 * @property {string} cmdSanitized Command in its sanitized format.
 * @property {any[]} args Arguments that were passed in with the sanitized format.
 */

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command to be executed.
 * @callback SuccessHandler
 * @param {OnSuccessData} data Data that was passed from the event emission.
 */

/**
 * @typedef OnFailData
 * @property {MySql2QueryError} error Error thrown by mysql2
 * @property {string} dateIso Date in ISO string format
 * @property {string} host Host of the MySQL server
 * @property {string} schema Schema of database and table in format of [database].[dbo].[table]
 * @property {string} cmdRaw Command in its raw format, including arguments.
 * @property {string} cmdSanitized Command in its sanitized format.
 * @property {string} cmd Command in its sanitized format.
 * @property {any[]} args Arguments that were passed in with the sanitized format.
 */

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command and that command fails.
 * @callback FailHandler
 * @param {OnFailData} data Data that was passed from the event emission.
 */

const EVENT_TABLE_CONTEXT_QUERY = 'table-context-query';
const EVENT_TABLE_CONTEXT_QUERY_FAILED = 'table-context-query-failed';
const EVENT_TABLE_CONTEXT_INSERT = 'table-context-insert';
const EVENT_TABLE_CONTEXT_INSERT_FAILED = 'table-context-insert-failed';
const EVENT_TABLE_CONTEXT_UPDATE = 'table-context-update';
const EVENT_TABLE_CONTEXT_UPDATE_FAILED = 'table-context-update-failed';
const EVENT_TABLE_CONTEXT_DELETE = 'table-context-delete';
const EVENT_TABLE_CONTEXT_DELETE_FAILED = 'table-context-delete-failed';