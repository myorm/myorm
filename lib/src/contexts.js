//@ts-check
import { createPool } from "mysql2/promise";
import { MySqlContextDeleteError, MySqlContextInsertError, MySqlContextQueryError, MySqlContextSyntaxError, MySqlContextUpdateError } from './exceptions.js';
import { Where, WhereBuilder } from './where-builder.js';

/** 
 * Object that holds context to a specific Table in your MySQL database. To ensure type-safety in vanilla JavaScript, use JSDOC typing.
 * @template {import("./typings/contexts.js").AbstractModel} TTableModel Model that represents the Table this Context represents.
 * @template {import("./typings/contexts.js").AbstractModel} [TAliasMap=import("./typings/contexts.js").OnlyNonAbstractModels<TTableModel>] 
 * Alias Map, is not intended to be given by the User. This is used to assist with return types from SELECT given aliases.
 */
export class MyORMContext {
    /** 
     * Some key from the table that represents the Identity primary key.  
     * If the table has an "auto_increment" key, then this is automatically detected on construction and set.
     * @protected @type {keyof TTableModel|null} 
     */ 
    _identityKey;

    /** 
     * Pool this context is pulling connections from.
     * @protected @type {import('mysql2/promise').Pool} 
     */
    _pool;

    /** 
     * Name of the table as it appears in the database
     * @protected @type {string} 
     */ 
    _realTableName;

    /** 
     * MyORMContext specific options for various behavior across the table.
     * @protected @type {import("./typings/contexts.js").TableContextOptions} 
     */ 
    _options;

    /** 
     * Configurations for (informal) foreign relationships for use with `.include()` (or otherwise joining tables.)
     * @protected @type {Partial<{[K in keyof import("./typings/contexts.js").OnlyAbstractModels<TTableModel>]: { included: boolean, name: string, primaryKey: keyof TTableModel, foreignKey: string, type: "1:1"|"1:n" }}>} 
     */ 
    _relationships = {};

    // All of the below private variables are used for generation of commands and transferring to view created contexts.

    /** 
     * Stores the WhereBuilder that is used to build the WHERE clause.
     * @protected @type {WhereBuilder<TTableModel>?} 
     */ 
    _where;

    /**
     * Maps an aliased type back to its original representation of the table.
     * @protected @type {((x: TAliasMap|Partial<TAliasMap>) => Partial<TTableModel>)?}
     */
    _mapBack = null;

    /** 
     * Stores the number that is used to build the LIMIT clause.
     * @protected @type {number=} 
     */ 
    _limit;

    /** 
     * Stores the number that is used to build the OFFSET clause.
     * @protected @type {number=} 
     */ 
    _offset;

    /** 
     * Stores all of the key configs that are used to build the ORDER BY clause.
     * @protected @type {import("./typings/contexts.js").SortByKeyConfig[]} 
     */ 
    _sortByKeys = [];

    /** 
     * Used to keep track of whether this current context state is grouped.
     * @protected @type {string[]|null} 
     */ 
    _groupBy = null;

    /** 
     * Stores all of the previously built clauses, so the current state of this context will revert back to the state of when the User added `.asView()`.
     * @protected @type {import("./typings/contexts.js").ViewConfig<TTableModel>} 
     */ 
    _view = {
        where: null,
        limit: 0,
        offset: 0,
        sortBy: [],
        groupBy: [],
        includes: undefined,
        mapBack: null,
        aliasCallback: undefined,
    };

    /** 
     * Used to keep track of whether this current context state is a View, and should maintain all of the data from _view upon further clause building.
     * @protected @type {boolean} 
     */ 
    _isView = false;

    /** 
     * Table's schema as described by MySQL's `DESCRIBE` command.
     * @protected @type {{ [key: string]: { Field: string; Type: string; Null: string; Key: string; Default: string; Extra: string; Alias: string; } }} 
     */
    _schema;

    /** 
     * Used to map resulting records to any aliased type the User wants.
     * @protected @type {((model: any) => TAliasMap)=} 
     */
    _aliasCallback;

    /** 
     * When first instantiating the table, and any relationship configurations are made, asynchronous tasks must be submitted.  
     * 
     * In order for no race conditions to be done, we store each asynchronous task in this variable, and await all of the promises before doing anything that
     * relys on any information that is set within these tasks.
     * @protected @type {Promise[]} 
     */
    _promises = [];

    /**
     * Creates a Connection Pool ready for use inside of multiple `MyORMContext` class objects.
     * @param {import('mysql2/promise').PoolOptions} config Configuration to create the pool on.
     * @returns {import('mysql2/promise').Pool} Connection Pool.
     */
    static createPool(config) {
        return createPool({ decimalNumbers: true, bigNumberStrings: true, connectionLimit: 20, ...config });
    }

    /**
     * Execute a stored procedure given a configuration setup or an already instantiated MySql2 Pool.
     * @template {any} [T=any] Type that the stored procedure should return, if it should return anything.
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
     * @param {import("./typings/contexts.js").TableContextOptions} options Context options that enable certain features, such as truncation, updating all, or sorting query result keys.
     * @param {{ [key: string]: { Field: string; Type: string; Null: string; Key: string; Default: string; Extra: string; Alias: string; } }=} schema Schema as described when first initializing this object. This is only meant for internal use.
     */
    constructor(configOrPool, realTableName, options = {}, schema = undefined) {
        this._realTableName = realTableName;
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

        // get the schema from the database.
        if(schema) {
            this._schema = schema;
        } else {
            this._promises = [...this._promises, this._describe(realTableName, schema => {
                this._schema = schema;
                this._identityKey = Object.values(schema).filter(v => v.Extra === "auto_increment")[0]?.Field;
            })];
        }
    }

    /**
     * Configure a one-to-many relationship on the table, so it is readily available for use with the `.include()` function.  
     * 
     * Once a property is specified, you must specify the primary and foreign keys, as well as the original table name (if it is different from the property name)  
     * To configure a different table name, chain `.fromTable(realTableName)`.  
     * 
     * To configure primary and foreign keys, chain `.withPrimary(primaryColumnName)` and further chain `.withForeign(foreignColumnName)`, or use `.withKeys(primaryColumnName, foreignColumnName)`.  
     * 
     * You can further configure relationships from that related table by chaining `.andThatHasOne()` or `.andThatHasMany()` onto the respective properties.
     * @param {import("./typings/contexts.js").HasManyCallback<TTableModel>} relationshipCallback Used to configure the keys for the informal foreign relationship.
     * @example
     * ```js
     * const pool = MyORMContext.createPool({ host: "localhost", database: "test", user: "root", password: "root" });
     * const userContext = new MyORMContext(pool, "User");
     * // example of configuring 1 one-to-many relationship.
     * userContext.hasMany(m => m.UserRoles
     *      .fromTable("UserRole")
     *      .withPrimary("Id")
     *      .withForeign("UserId"));
     * // example of configuring a one to one relationship on top of a one-to-many relationship
     * userContext.hasMany(m => m.UserRoles
     *      .fromTable("UserRole")
     *      .withPrimary("Id")
     *      .withForeign("UserId")
     *      .andThatHasOne(m => m.Role
     *          .withKeys("RoleId", "Id")));
     * ```
     */
    hasMany(relationshipCallback) {
        this._configureRelationship(relationshipCallback, "1:n");
        return this;
    }

    /**
     * Configure a one-to-one relationship on the table, so it is readily available for use with the `.include()` function.  
     * 
     * Once a property is specified, you must specify the primary and foreign keys, as well as the original table name (if it is different from the property name)  
     * To configure a different table name, chain `.fromTable(realTableName)`.  
     * 
     * To configure primary and foreign keys, chain `.withPrimary(primaryColumnName)` and further chain `.withForeign(foreignColumnName)`, or use `.withKeys(primaryColumnName, foreignColumnName)`.  
     * 
     * You can further configure relationships from that related table by chaining `.andThatHasOne()` or `.andThatHasMany()` onto the respective properties.
     * @param {import("./typings/contexts.js").HasOneCallback<TTableModel>} relationshipCallback Used to configure the keys for the informal foreign relationship.
     * @example
     * ```js
     * const pool = MyORMContext.createPool({ host: "localhost", database: "test", user: "root", password: "root" });
     * const userContext = new MyORMContext(pool, "User");
     * // example of configuring 1 one-to-many relationship.
     * userContext.hasOne(m => m.Credential
     *      .fromTable("Credential") // not necessary, since property name is the same, but used here as an example.
     *      .withPrimary("Id")
     *      .withForeign("UserId"));
     * // example of configuring a one to one relationship on top of a one-to-many relationship
     * userContext.hasOne(m => m.Credential
     *      .fromTable("Credential")
     *      .withPrimary("Id")
     *      .withForeign("UserId")
     *      .andThatHasOne(m => m.Provider
     *          .withKeys("ProviderId", "Id")));
     * ```
     */
    hasOne(relationshipCallback) {
        this._configureRelationship(relationshipCallback, "1:1");
        return this;
    }

    /**
     * Specifies that your next Query will also pull in the specified related Record from the database.  
     * 
     * If you would like to further include nested relationships, then you can chain the property being included with `.thenInclude()`.
     * 
     * __NOTE: In order for your related record to be properly included, there needs to be a relationship configured using the `.hasOne` or `.hasMany` function.__  
     * @template {import("./typings/contexts.js").OnlyAbstractModelTypes<TTableModel>} [TAugmentedType=import("./typings/contexts.js").OnlyAbstractModelTypes<TTableModel>] TTableModel augmented so it only displays Abstract Model types. This will be inferred.
     * @param {import("./typings/contexts.js").ThenIncludeCallbackConfig<TTableModel>} modelCallback 
     * Callback where the argument, `model`, only has properties of non-primitive types to provide clarity to what sub-type (or table) should be included (or joined on).
     * @returns {MyORMContext<TTableModel, TAliasMap & Required<TAugmentedType>>} A new context with the all previously configured clauses and the updated inclusions.
     * @example
     * ```js
     * const pool = MyORMContext.createPool({ host: "localhost", database: "test", user: "root", password: "root" });
     * const userContext = new MyORMContext(pool, "User");
     * userContext.hasOne(m => m.Credential
     *      .withKeys("Id", "UserId")
     *      .andThatHasOne(m => m.Provider
     *          .withKeys("ProviderId", "Id")));
     * // example of getting all Users and their respective Credential objects.
     * let users = await userContext
     *      .include(m => m.Credential)
     *      .select();
     * // example of getting all Users and their respective Credential objects, as well as Credential's respective Provider objects.
     * users = await userContext
     *      .include(m => m.Credential
     *          .thenInclude(m => m.Provider))
     *      .select();
     * ```
     */
    include(modelCallback) {
        const newProxy = () => new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => {
                if(p in this._relationships) {
                    this._relationships[p].included = true;
                } else {
                    throw new MySqlContextSyntaxError(`${String(p)} is not an existing relationship on this table. Did you configure a relationship using .hasOne() or .hasMany()?`);
                }
                return {
                    thenInclude: (modelCallback) => {
                        return modelCallback(newProxy());
                    } 
                };
            }
        });
        modelCallback(newProxy());
        /** @type {MyORMContext<TTableModel, TAliasMap & Required<TAugmentedType>>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._options, this._schema);
        this._transferToNewContext(ctx);
        return ctx;
    }

    /**
     * Filter a query to return a specific set of records.  
     * 
     * You can use the following functions to create conditions:  
     *  - `.equals()` or `.eq()`
     *  - `.greaterThan()` or `.gt()`
     *  - `.lessThan()` or `.lt()`
     *  - `.greaterThanOrEqualTo()` or `.gteq()`
     *  - `.lessThanOrEqualTo()` or `.lteq()`
     *  - `.in()`
     *  - `.like()`
     *  - `.contains()`
     * 
     * Additionally, after you use the function, you will find that the return value is an object that contains the functions `.and()` and `.or()`, which you can use to further
     * chain your condition. If you chain a `.and()` or `.or()` onto a conditional property, it will nest, if you chain `.and()` or `.or()` onto itself, then it will chain.
     *  
     * __NOTE: This also works on keys from included tables, including one-to-many relationships, just reference the included model further until you reach the property desired.__
     * @param {(m: import("./where-builder.js").ChainObject<TTableModel>) => void} whereCallback Builder function to help build a WHERE clause.
     * @returns {MyORMContext<TTableModel, TAliasMap>} A new context with the all previously configured clauses and the updated filter.
     * @example
     * ```js
     * const pool = MyORMContext.createPool({ host: "localhost", database: "test", user: "root", password: "root" });
     * const userContext = new MyORMContext(pool, "User");
     * // example of filtering on User's username being equal to 'johndoe12'
     * await userContext
     *      .where(m => m.Username.equals("johndoe12"))
     *      .select();
     * // example of filtering on User's username being equal to 'johndoe12' or their email contains the string, 'doe'.
     * await userContext
     *      .where(m => m.Username.equals("johndoe12")
     *          .or(m => m.Email.contains("doe")))
     *      .select();
     * // example of filtering on User's username being equal to 'johndoe12', or their email contains both 'doe' and 'john'.
     * await userContext
     *      .where(m => m.Username.equals("johndoe12")
     *          .or(m => m.Email.contains("doe")
     *              .and(m => m.Email.contains("john"))))
     *      .select();
     * ```
     */
    where(whereCallback) {
        this._promises = [Promise.all(this._promises).then(() => {
            const newProxy = (table) => new Proxy(/** @type {any} */({}), {
                get: (t,p,r) => {
                    if(p in this._relationships) {
                        return newProxy(this._relationships[p].thatTable);
                    }
                    if(this._where) {
                        // @ts-ignore This is private, but this is an exception so Views can work appropriately.
                        this._where._current = { property: `${table}.${String(p)}`, chain: "AND" };
                        return this._where;
                    }
                    this._where = Where(String(p), table, this._relationships, "WHERE");
                    return this._where;
                }
            });
            whereCallback(newProxy(this._realTableName));
        })];
        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._options, this._schema);
        this._transferToNewContext(ctx);
        
        return ctx;
    }

    /**
     * Sorts the records in the order specified by the keys being presented in the callback. 
     * 
     * Specify the direction by chaining onto the property ".asc()" or ".desc()". If no function is specified, then ascending is default.  
     * 
     * If you'd like to sort by multiple keys, specify them in an array.  
     * 
     * __NOTE: This also works on keys from included tables, including one-to-many relationships, just reference the included model further until you reach the property desired.__
     * @param {import("./typings/contexts.js").SortByCallback<TTableModel>} orderByCallback Callback to help present the keys you'd like to sort on.
     * @returns {MyORMContext<TTableModel, TAliasMap>} A new context with the all previously configured clauses and the updated sorting configuration.
     * @example
     * ```js
     * const pool = MyORMContext.createPool({ host: "localhost", database: "test", user: "root", password: "root" });
     * const userContext = new MyORMContext(pool, "User");
     * // sort by one key.
     * let users = await userContext
     *      .sortBy(m => m.Username)
     *      .select();
     * // sort by multiple keys.
     * users = await userContext
     *      .sortBy(m => [m.Username, m.Email])
     *      .select();
     * // sort by multiple keys in varying directions.
     * users = await userContext
     *      .sortBy(m => [m.Username.desc(), m.Email])
     *      .select();
     * ```
     */
    sortBy(orderByCallback) {
        this._promises = [Promise.all(this._promises).then(() => {
            this._sortByKeys = [];
            const newProxy = (table=`\`${this._realTableName}\`.`) => new Proxy(/** @type {any} */ ({}), {
                get: (t,p) => {
                    if(p in this._relationships) {
                        return newProxy(`\`${this._relationships[p].thatTable}\`.`);
                    }
                    /** @type {import("./typings/contexts.js").SortByKeyConfig & import("./typings/contexts.js").DirectionCallbacks} */
                    const sbk = {
                        column: `${table}\`${String(p)}\``,
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
            const sbKeys = orderByCallback(newProxy());
            this._sortByKeys = Array.isArray(sbKeys) ? sbKeys : [sbKeys];
        })]
        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._options, this._schema);
        this._transferToNewContext(ctx);
        return ctx;
    }

    /**
     * @template {import("./typings/contexts.js").AbstractModel} TTableModel
     * @typedef {{[K in keyof TTableModel]: TTableModel[K] extends import("./typings/contexts.js").AbstractModel|undefined ? GroupByCallbackModel<TTableModel[K]> : string}} GroupByCallbackModel
     */

    /**
     * Aggregates the results into groups specified by the keys given.  
     * 
     * Unlike all other model callbacks provided for clause building, the model callback for grouping provides an additional parameter, `aggregate`, which is an object
     * that provides MySQL aggregate functions to use. The following functions provided by `aggregate` are:
     *   - `.count()`: Get the total count of that group. (If nothing else is specified, then this just returns the total count of all records)
     *   - `.max(modelCallback)`: Get the maximum value for the column referenced in `modelCallback` stored in that group.
     *   - `.min(modelCallback)`: Get the minimum value for the column referenced in `modelCallback` stored in that group.
     *   - `.sum(modelCallback)`: Get the total sum of all values for the column referenced in `modelCallback` stored in that group.
     *   - `.avg(modelCallback)`: Get the average of all values for the column referenced in `modelCallback` stored in that group.  
     * 
     * __NOTE: This also works on keys from included tables, including one-to-many relationships, just reference the included model further until you reach the property desired.__
     * @param {(model: GroupByCallbackModel<import("./typings/contexts.js").AllKeysRequired<TTableModel>>, aggregates: import("./typings/contexts.js").Aggregates<TTableModel>) => string|string[]} groupByCallback
     * @returns {MyORMContext<TTableModel, TAliasMap>} A new context with the all previously configured clauses and the updated groupings.
     */
    groupBy(groupByCallback) {
        this._promises = [Promise.all(this._promises).then(() => {
            /** @returns {Required<TTableModel>} */
            const newProxy = (table="") => new Proxy(/** @type {any} */({}), {
                get: (t, p, r) => {
                    if (p in this._relationships) {
                        if (this._relationships[p].included) {
                            return newProxy(`\`${this._relationships[p].thatTable}\`.`);
                        } else {
                            throw new MySqlContextSyntaxError(`Cannot group a property from a related table that hasn't been included. (table: ${String(p)})`);
                        }
                    }
                    return `${table}\`${String(p)}\``;
                }
            });
    
            const proxy = newProxy();
    
            // We force a cast to numbers since we need the type defined as number. In this specific scenario, we want the strings for aliasing. 
            /** @type {import("./typings/contexts.js").Aggregates<TAliasMap>} */
            const aggregates = {
                count: () => "COUNT(*) AS count",
                avg: (col) => (`AVG(${col}) AS \`avg${col.replace(/`/g, "").slice(0,1).toUpperCase()}${col.replace(/`/g, "").slice(1, col.length)}\``),
                max: (col) => (`MAX(${col}) AS \`max${col.replace(/`/g, "").slice(0,1).toUpperCase()}${col.replace(/`/g, "").slice(1, col.length)}\``),
                min: (col) => (`MIN(${col}) AS \`min${col.replace(/`/g, "").slice(0,1).toUpperCase()}${col.replace(/`/g, "").slice(1, col.length)}\``),
                sum: (col) => (`SUM(${col}) AS \`sum${col.replace(/`/g, "").slice(0,1).toUpperCase()}${col.replace(/`/g, "").slice(1, col.length)}\``)
            }
    
             const groups = groupByCallback(proxy, aggregates);
             this._groupBy = Array.isArray(groups) ? groups : [groups];
        })];

        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._realTableName);
        this._transferToNewContext(/** @type {any} */(ctx));
        return ctx;
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
     * @template {import("./typings/contexts.js").AbstractModel} TAliasedType Aliased type that is derived from the return value of `aliasModelCallback`.
     * @template {import("./typings/contexts.js").AllKeysRequired<TTableModel>} [TRequiredModel=import("./typings/contexts.js").AllKeysRequired<TTableModel>]
     * @param {((model: TRequiredModel) => TAliasedType)} aliasModelCallback Callback that should return an object that would represent your desired aliased type.
     * @returns {MyORMContext<TTableModel, import("./typings/contexts.js").UndefinedAsOptional<TAliasedType>>} 
     * A new context with the all previously configured clauses and the updated alias type.
     * @example
     * ```js
     * const pool = MyORMContext.createPool({ host: "localhost", database: "test", user: "root", password: "root" });
     * const userContext = new MyORMContext(pool, "User");
     * userContext.hasOne(m => m.Credential
     *      .withKeys("Id", "UserId"));
     * userContext.hasMany(m => m.UserRoles
     *      .fromTable("UserRole")
     *      .withKeys("Id", "UserId")
     *          .andThatHasOne(m => m.Role
     *              .withKeys("RoleId", "Id")));
     * // example of aliasing Users for only username and email
     * let users = await userContext
     *      .alias(m => ({
     *          username: m.Username,
     *          email: m.Email
     *      }))
     *      .select();
     * // example of aliasing Users including some Role information
     * users = await userContext
     *      .include(m => m.Credential)
     *      .include(m => m.UserRoles
     *          .thenInclude(m => m.Role))
     *      .alias(m => ({
     *          id: m.Id,
     *          username: m.Username,
     *          email: m.Email,
     *          password: m.Credential.Passchecksum,
     *          roles: m.UserRoles.map(m => ({
     *              title: m.Role.Title,
     *              description: m.Role.Description
     *          }))
     *      }))
     *      .select();
     * ```
     */
    alias(aliasModelCallback) {
        this._promises = [Promise.all(this._promises).then(() => {
            // @ts-ignore This is being assigned to this here because it is meant to be transferred to the new context.
            this._aliasCallback = aliasModelCallback;
            const newProxy = (table = "") => new Proxy(/** @type {any} */ ({}), {
                get: (t,p,r) => {
                    if (p in this._relationships && this._relationships[p].included) {
                        if(!table.endsWith(`${String(p)}.`)) {
                            table = `${table}${String(p)}.`;
                        }
                        if(this._relationships[p].type === "1:n") {
                            return [newProxy(table)];
                        }
                        return newProxy(table);
                    }
                    return `${table}${String(p)}`;
                }
            });
    
            const aliasMap = aliasModelCallback(newProxy());
            const flipd = Object.fromEntries(Object.entries(aliasMap).map(([k,v]) => [v,k]));
            this._mapBack = (x) => {
                /** @type {Partial<TTableModel>} */
                const o = {};
                for(const key in flipd) {
                    // @ts-ignore The key is expected to be part of TTableModel, but TS won't know that, so the error is ignored.
                    o[key] = x[flipd[key]];
                }
                return o;
            };
        })];

        /** @type {MyORMContext<TTableModel, import("./typings/contexts.js").UndefinedAsOptional<TAliasedType>>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._options, this._schema);
        this._transferToNewContext(/** @type {any} */(ctx));
        return ctx;
    }

    /**
     * Skips a given amount of records in the query.
     * @param {number|string} offset Number or number-like string to offset the records your query would return.
     * @returns {MyORMContext<TTableModel, TAliasMap>} A new context that is tailored to the state of the command that was built.
     */
    skip(offset) {
        offset = typeof (offset) === "string" ? parseInt(offset) : offset;
        if (isNaN(offset)) throw new MySqlContextSyntaxError("Must specify a raw number or a parseable number string.");
        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._options, this._schema);
        this._transferToNewContext(ctx);
        ctx._offset = offset;
        return ctx;
    }

    /**
     * Takes a limited amount of records in the query.
     * @param {number|string} limit Number or number-like string to limit the number of records your query should return.
     * @returns {MyORMContext<TTableModel, TAliasMap>} A new context that is tailored to the state of the command that was built.
     */
    take(limit) {
        limit = typeof (limit) === "string" ? parseInt(limit) : limit;
        if (isNaN(limit)) throw new MySqlContextSyntaxError("Must specify a raw number or a parseable number string.");
        /** @type {MyORMContext<TTableModel, TAliasMap>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._options, this._schema);
        this._transferToNewContext(ctx);
        ctx._limit = limit;
        return ctx;
    }

    /**
     * Permanently turns this context into a view.  
     * 
     * Synonym: `.view()`
     * 
     * When a `MyORMContext` is built using any clause building and a direct access call is made (e.g., `.select()`) then everything is destroyed.  
     * 
     * When you specify `.asView()`, it will only destroy clauses built that are made after `.asView()`.
     * @returns {this} The `MyORMContext`, ready for maintaining the state of which it was built
     * @example
     * ```js
     * const pool = MyORMContext.createPool({ host: "localhost", database: "test", user: "root", password: "root" });
     * const userContext = new MyORMContext(pool, "User");
     * // example of creating a view for only Users that have email addresses for `gmail.com`.
     * const onlyGmailUsers = userContext
     *      .where(m => m.Email.contains("@gmail.com"))
     *      .asView();
     * // example of using our view to grab all gmail users named "john".
     * const johns = await onlyGmailUsers.where(m => m.Username.contains("john")).select();
     * // the above where clause is recycled upon use of `.select()`, so now we can grab gmail users named "jane"
     * const janes = await onlyGmailUsers.where(m => m.Username.contains("jane")).select();
     * ```
     */
    asView() {
        this._promises = [Promise.all(this._promises).then(() => {
            this._isView = true;
            this._view = {
                mapBack: this._mapBack,
                aliasCallback: this._aliasCallback,
                // @ts-ignore _clone is marked private, but `MyORMContext` is the only place where it is used.
                where: this._where?._clone(),
                sortBy: this._sortByKeys,
                groupBy: this._groupBy,
                limit: this._limit,
                offset: this._offset,
                includes: JSON.parse(JSON.stringify(this._relationships))
            };
        })];
        return this;
    }

    /**
     * Executes a query on the table, using all previously built clauses to format the query.
     * 
     * __NOTE: If no aliasing took place, the records returned will appear serialized appropriately by their actual column names. This includes included tables.__
     * @returns {Promise<(TAliasMap)[]>} List of the returned records, serialized into their correct form, from the built query.
     */
    async select() {
        await Promise.all(this._promises);
        let selects = [
            ...Object.values(this._schema).map(o => `${o.Field} AS ${o.Alias}`),
            ...Object.keys(this._relationships)
                .filter(rKey => this._relationships[rKey].included)
                .flatMap(k => Object.values(this._relationships[k].schema)
                    .map(o => `${o.Field} AS ${o.Alias}`))
        ];
        if(this._groupBy) {
            selects = [...this._groupBy.map(o => {
                const key = o.replace(/`/g, "");
                const splits = key.split(".");
                let table = null;
                if(splits.length > 1) {
                    if(splits[0] in this._relationships) {
                        table = splits[0];
                    }
                }
                if(table) {
                    if(splits[1] in this._relationships[table].schema) {
                        return `${this._relationships[table].schema[splits[1]].Field} AS ${this._relationships[table].schema[splits[1]].Alias}`;
                    }                    
                } else {
                    if(key in this._schema) {
                        return `${this._schema[key].Field} AS ${this._schema[key].Alias}`;
                    }
                }
                return o;
            })];
        }
        let thisTable = `\`${this._realTableName}\``;
        let groups = this._groupBy?.map(col => col.includes(" AS ") ? "" : `${col}`).filter(s => s != "");
        const where = this._where?.toString() ?? "";
        const groupBy = groups != null && groups.length > 0 ? `\n\tGROUP BY ${groups.join('\n\t\t,')}` : "";
        const orderBy = this._sortByKeys.length > 0 ? `\n\tORDER BY ${this._sortByKeys.map(o => `${String(o.column)} ${o.direction}`).join('\n\t\t,')}` : "";
        let limit = this._limit != null ? "\n\tLIMIT ?" : "";
        let offset = this._offset != null ? "\n\tOFFSET ?" : "";

        let args = [];
        // If any 1:n relationships are involved, then we need to use a sub query, so we get our data properly
        if (Object.values(this._relationships).filter(v => v.included && v.type == "1:n").length > 0 && this._limit != null) {
            thisTable = `(SELECT * FROM ${thisTable} ${this._where?.toString(this._realTableName) ?? ""}${limit} ${offset}) AS ${thisTable}`;
            limit = offset = "";
            if(this._where) {
                args = [this._where.getArgs(this._realTableName)];
            }
            args = [...args, this._limit];
            if(this._offset) {
                args = [...args, this._offset];
            }
        }
        const from = [thisTable, ...Object.values(this._relationships)
            .filter(ic => ic.included)
            .map(ic => `\`${ic.thatTable}\` ON \`${ic.thisTable}\`.\`${ic.primaryKey}\`=\`${ic.thatTable}\`.\`${ic.foreignKey}\``)].join('\n\t\tLEFT JOIN ');
        const cmd = `SELECT ${selects.join('\n\t\t,')}`
            + `\n\tFROM ${from}`
            + ` ${where}`
            + ` ${orderBy}`
            + ` ${groupBy}`
            + ` ${limit}`
            + ` ${offset}`;
        args = [...args, ...this._where != null ? this._where.getArgs() : []];
        if (limit != "") {
            args = [...args, this._limit];
        }
        if (offset != "") {
            args = [...args, this._offset]
        }
        /** @type {TAliasMap[]|TTableModel[]} */
        let ts = await this._query(cmd, args);
        // grab the primary key
        const primaryKey = Object.keys(this._schema).filter(k => this._schema[k].Key === "PRI")[0];
        if(ts.length > 0) {
            let mappingObject = {};
            for(const key in ts[0]) {
                const splits = key.split("_");
                mappingObject = this._createMappedObject(mappingObject, splits);
            }
            if(primaryKey && Object.values(this._relationships).filter(v => v.included).length > 0) {
                let recs = ts;
                // if there is a relationship with the main table and that relationship is one-to-many, then we have to filter out the duplicate primary keyed records.
                if(Object.values(this._relationships).filter(v => v.included && v.thisTable == thisTable && v.type == "1:n")) {
                    recs = ts.filter((t, n, self) => n === self.findIndex(_t => _t[primaryKey] === t[primaryKey]));
                }
                ts = recs.map(t => this._mapResults(t, ts, /** @type {{[K in keyof TAliasMap]: string|object|((record: any, allRecords: any[]) => any[])}} */ (mappingObject)));
            }
        }

        if(this._aliasCallback) {
            ts = ts.map(t => {
                const newProxy = o => new Proxy(o, {
                    get: (target, prop) => {
                        if (prop in this._relationships) {
                            return newProxy(target[prop]);
                        }
                        return target[prop];
                    }
                });
                // @ts-ignore TypeScript is acting weird and saying this is possibly undefined...
                return this._aliasCallback(newProxy(t));
            });
        }

        return /** @type {any} */ (ts);
    }

    /**
     * Executes a query for the total number of records on the table, using all previously built clauses to format the query.
     * @returns {Promise<number>} Number specifying the total count of all records that would be queried.
     */
    async count() {
        await Promise.all(this._promises);
        const from = [`\`${this._realTableName}\``, ...Object.values(this._relationships).filter(ic => ic.included).map(ic => `\`${ic.name}\` ON \`${this._realTableName}\`.\`${ic.primaryKey}\`=\`${ic.name}\`.\`${ic.foreignKey}\``)].join('\n\t\tJOIN ');
        const where = this._where != null ? this._where.toString() : "";
        const cmd = `SELECT COUNT(*) AS \`$$count\``
            + `\n\tFROM ${from}`
            + ` ${where}`;
        let args = [...this._where != null ? this._where.getArgs() : []];
        let ts = await this._query(cmd, args);

        return ts[0].$$count;
    }

    /**
     * Inserts one or more objects into the Table this context represents.  
     * 
     * If tables were included before this command is executed, then any related data will be subsequently inserted with their appropriately mapped ids.
     * 
     * __NOTE: If the table's primary key is determined to be an identity key (auto increments), then the Id will automatically be assigned. 
     * If this is the case, you can mark the primary key property in your typescript type as `Optional` or pass in null or undefined for that property.__  
     * 
     * **This does not cascade insert included records.**
     * @param {TAliasMap|TAliasMap[]} records
     * @returns {Promise<TAliasMap[]>}
     */
    async insert(records) {
        if (!Array.isArray(records)) records = [records];
        if (records.length <= 0 || (records.length == 1 && records[0] == null)) return [];
        await Promise.all(this._promises);
        let identityKey = null;
        for(const key in this._schema) {
            if(this._schema[key].Key == "PRI" && this._schema[key].Extra == "auto_increment") {
                identityKey = key;
                break;
            }
        }
        /** @type {Partial<TTableModel>[] | TAliasMap[]} */
        let recordsMappedBack = records;
        if(this._mapBack) {
            recordsMappedBack = records.map(this._mapBack);
        }
        
        recordsMappedBack.forEach(r => delete r[identityKey]);

        // all keys being inserted.
        const allKeys = recordsMappedBack.flatMap(rec => Object.keys(rec)).filter((rec, n, self) => self.indexOf(rec) == n);
        // filter out properties mapped to objects
        const keysFiltered = allKeys.filter(col => records[0][col] instanceof Date || typeof (recordsMappedBack[0][col]) !== "object");
        // columns in the INSERT INTO (...) segment
        const cols = keysFiltered.map(k => `\`${this._realTableName}\`.\`${k}\``).join('\n\t\t,');
        // vals in the VALUES (?, ?,...) segment for each record.
        const vals = Array.from(Array(recordsMappedBack.length).keys()).map(_ => `(${Array.from(Array(keysFiltered.length).keys()).map(_ => '?').join(',')})`).join('\n\t\t,');
        // arguments that match up with ? in vals.
        const args = recordsMappedBack.flatMap(rec => keysFiltered.map(k => k in rec ? rec[k] == undefined ? null : rec[k] : null));
        // command
        const cmd = `INSERT INTO \`${this._realTableName}\`\n\t(${cols})\n\tVALUES ${vals}`;
        const insertIds = await this._insert(cmd, args);
        
        if (identityKey) {
            recordsMappedBack = recordsMappedBack.map((r, n) => ({ ...r, [identityKey]: insertIds[n] }));
        }
        if(this._aliasCallback) {
            return recordsMappedBack.map(this._aliasCallback);
        } else {
            return /** @type {TAliasMap[]} */ (recordsMappedBack);
        }
    }

    /**
     * Updates one or more records into the Table this context represents.
     * 
     * This update occurs on the primary key on the records (aliased or not) and if the primary key does not exist on that record, then an Error is thrown.  
     * 
     * **This does not cascade update included records.**
     * @param {TAliasMap|TAliasMap[]} records Record or records to update, where each record contains a primary key.
     * @returns {Promise<number>} Number of affected rows.
     */
    async update(records) {
        if (!Array.isArray(records)) records = [records];
        if (records.length <= 0 || (records.length == 1 && records[0] == null)) return 0;
        await Promise.all(this._promises);
        let primaryKey = null;
        let identityKey = null;

        // map records back to their representation of the table
        /** @type {Partial<TTableModel>[] | TAliasMap[]} */
        let recordsMappedBack = records;
        if (this._mapBack) {
            recordsMappedBack = records.map(this._mapBack);
        }

        // Get all keys that are being updated across all records.
        const allKeys = recordsMappedBack.flatMap(r => Object.keys(r)).filter((k,n,self) => self.indexOf(k) === n);

        // Create an object to hold all of the information for cases.
        let cases = allKeys.reduce((accumulator, value) => {
            return { ...accumulator, [value]: { cmd: 'CASE\n\t\t', args: [] } };
        }, {});
        // loop through all records, updating them where applicable
        for(const record of recordsMappedBack) {
            // if the primary key has not yet been identified, then find it.
            if(!primaryKey) {
                keysInRecord: for (const key in record) {
                    if (key in this._schema && this._schema[key].Key == "PRI") {
                        primaryKey = key;
                        break keysInRecord;
                    }
                }
                if (primaryKey && this._schema[primaryKey].Extra == "auto_increment") {
                    identityKey = primaryKey;
                }
            }
            if(!primaryKey || !(primaryKey in record)) {
                // If there was no primary key found in the record, then throw an Error. (TODO: This may change, it may instead just not be updated instead.)
                throw new MySqlContextSyntaxError(`Record does not have a primary key specified to update on. (Record: ${JSON.stringify(record)})`);
            } else {
                // Otherwise, add to the CASE clause.
                for(const key in record) {
                    if (record[key] == undefined || key === identityKey) continue; // Skip identity key, we can't nor do we want to update it.
                    cases[key].cmd += `\tWHEN ${primaryKey} = ? THEN ?\n\t\t`;
                    cases[key].args = [...cases[key].args, record[primaryKey], record[key]];
                }
            }
        }

        // If no primary key was identified, throw an error.
        if (!primaryKey) {
            throw new MySqlContextSyntaxError(`No primary key was identified in any of the records passed in.`);
        }
        
        Object.keys(cases).forEach(k => cases[k].cmd += `\tELSE \`${k}\`\n\t\tEND`);

        // build the where clause for the update transaction. (This may seem redundant and unnecessary since cases exist, but is vital in order to track the number of affected rows)
        this._where = Where(primaryKey, this._realTableName, this._relationships);
        this._where.in(recordsMappedBack.map(r => r[primaryKey]));

        // Delete the cases that have no sets.
        for (const key in cases) {
            if (cases[key].args.length <= 0) {
                delete cases[key];
            }
        }
        let args = Object.keys(cases).flatMap(k => cases[k].args);
        const n = await this._update(`UPDATE \`${this._realTableName}\`\n\tSET ${Object.keys(cases).map(k => `\`${k}\` = (${cases[k].cmd})`).join(',\n\t\t')}${this._where.toString(this._realTableName)}`, [...args, ...this._where.getArgs(this._realTableName)]);

        this._where = null;
        return n;
    }

    /**
     * Update all records in the Table this context represents, based on a WHERE clause built using `.where()`.
     * 
     * If you just intend to update records based on the primary key that they already hold, then use `.update()` instead.
     * 
     * If no WHERE clause is previously built, an error will be thrown, warning that the statement would result in an update on all records in the table.  
     * 
     * If this is intended, you can specify `allowUpdateOnAll` to be true in the options passed into the constructor.  
     * 
     * **This does not cascade update included records.**
     * @param {Partial<TAliasMap>} propertiesToUpdate TTableModel model object to use to update all the records.
     * @returns {Promise<number>} Number of affected rows.
     */
    async updateSelect(propertiesToUpdate) {
        if(propertiesToUpdate == null) return 0;
        await Promise.all(this._promises);
        if (this._where == null || this._where.getArgs().length <= 0) {
            throw new MySqlContextSyntaxError('No WHERE clause was built, possibly resulting in all records in the table being updated. If this was intended, pass true to the \'allUpdateOnAll\' property into options when configuring the context.');
        }

        // map record back to the representation of the table
        /** @type {Partial<TAliasMap>|Partial<TTableModel>} */
        let recordMappedBack = propertiesToUpdate;
        if (this._mapBack) {
            [recordMappedBack] = [propertiesToUpdate].map(this._mapBack);
        }

        // Serialize the value sets, removing the AUTO_INCREMENT key if it exists in the record.
        const sets = Object.keys(recordMappedBack).filter(key => recordMappedBack[key] !== undefined && (this._identityKey == null || key != this._identityKey)).map(key => {
            return `\`${key}\` = ?`;
        }).join('\n\t\t,');
        const args = Object.entries(recordMappedBack).filter(([key, value]) => value !== undefined && (this._identityKey == null || key != this._identityKey)).map(([k, v]) => v);

        const cmd = `UPDATE \`${this._realTableName}\`\n\tSET ${sets} ${this._where.toString()}`;
        const numRowsAffected = this._update(cmd, [...args, ...this._where.getArgs()]);
        return numRowsAffected;
    }

    /**
     * Deletes records from the Table this context represents, based on a built where clause to determine what should be deleted.
     * 
     * If no where clause was built, then record(s) will be deleted using their primary key to determine uniqueness.
     * 
     * __NOTE: If no primary key exists on the object, then that record will not be deleted.__  
     * 
     * **This does not cascade delete included records.**
     * @param {TAliasMap|TAliasMap[]} records
     * @returns {Promise<number>} Number of deleted rows.
     */
    async delete(records) {
        if (!Array.isArray(records)) records = [records];
        if (records.length <= 0 || (records.length == 1 && records[0] == null)) return 0;
        await Promise.all(this._promises);

        // map records back to their representation of the table
        /** @type {Partial<TTableModel>[] | TAliasMap[]} */
        let recordsMappedBack = records;
        if (this._mapBack) {
            recordsMappedBack = records.map(this._mapBack);
        }

        // get the primary key.
        let primaryKey = null;
        recordInRecordsMappedBack: for(const record of recordsMappedBack) {
            for(const key in record) {
                if (key in this._schema && this._schema[key].Key == "PRI") {
                    primaryKey = key;
                    break recordInRecordsMappedBack;
                }
            }
        }

        // If no primary key was identified, throw an error.
        if(!primaryKey) {
            throw new MySqlContextSyntaxError(`No primary key was identified in any of the records passed in.`);
        }

        // Remove all records to delete that do not have a primary key.
        // @ts-ignore TS has a problem with filter on a type that can be two different types of Arrays.
        recordsMappedBack = recordsMappedBack.filter(r => primaryKey in r);

        // build the where clause for the delete transaction
        this._where = Where(primaryKey, this._realTableName, this._relationships);
        this._where.in(recordsMappedBack.map(r => r[primaryKey]));

        const cmd = `DELETE FROM \`${this._realTableName}\`${this._where.toString(this._realTableName)}`;
        
        const n = await this._delete(cmd, this._where.getArgs(this._realTableName));
        this._where = null;
        return n;
    }

    /**
     * Delete all records in the Table this context represents, based on a WHERE clause built using `.where()`.
     * 
     * If you just intend to delete records based on the primary key that they already hold, then use `.delete()` instead.
     * 
     * If no WHERE clause is previously built, an error will be thrown, warning that the statement would result in a deletion on all records in the table.  
     * 
     * If this is intended, you can specify `allowTruncation` to be true in the options passed into the constructor, as well as alternatively using `.truncate()`.  
     * 
     * **This does not cascade delete included records.**
     * @returns {Promise<number>} Number of affected rows.
     */
    async deleteSelect() {
        await Promise.all(this._promises);
        if (this._where == null || this._where.getArgs().length <= 0) {
            throw Error('No WHERE clause was built, possibly resulting in all records in the table being deleted.'
                + '\n\tIf you are sure you know what you are doing, then use the "truncate" function.');
        }
        const cmd = `DELETE FROM \`${this._realTableName}\`${this._where.toString(this._realTableName)}`;
        return await this._delete(cmd, this._where.getArgs(this._realTableName));
    }

    /**
     * Truncate the table this context represents.
     * WARNING: This function will delete all records in the table. 
     * To avoid accidental calls to this function, an Error will be thrown warning the developer prompting them to set "allowTruncation" to true in the options.
     * @returns {Promise<number>} Number of deleted rows.
     */
    async truncate() {
        if (!this._options.allowTruncation) {
            throw Error('You are attempting to delete all records in the table. '
                + '\n\tIf you are instead attempting to delete select records, see ".delete()" or ".deleteAll()". '
                + '\n\tIf this was intended, then pass into the "options" parameter in the constructor, "allowTruncation: true"');
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
     * @template {import("./where-builder.js").AbstractModel} TAliasdType
     * @private
     * @param {MyORMContext<TTableModel, TAliasdType>} ctx 
     */
    _transferToNewContext(ctx) {
        // Since the core of MyORMContext is to build a context off of an existing context and have the option to make it a view,
        // We need to transfer all of the information over to the new context-- however, some of the data may not be finished (specifically, table information)
        // So we wait on all of the promises in the current context, then transfer them over, and with that, we store the Promise of that into the new context's promises.
        ctx._promises = [Promise.all(this._promises).then(() => {
            // @ts-ignore TAliasedType is the type going into the new context, TAliasMap in this context actually appears like TAliasedType, but TS doesn't know that.
            ctx._mapBack = this._mapBack;
            // @ts-ignore TAliasedType is the type going into the new context, TAliasMap in this context actually appears like TAliasedType, but TS doesn't know that.
            ctx._aliasCallback = this._aliasCallback;

            ctx._schema = this._schema;
            // @ts-ignore _clone is marked private, but `MyORMContext` is the only place where it is used.
            ctx._where = this._where?._clone();
            ctx._offset = this._offset;
            ctx._limit = this._limit;
            ctx._sortByKeys = this._sortByKeys;
            ctx._groupBy = this._groupBy;
            ctx._relationships = JSON.parse(JSON.stringify(this._relationships));
            
            this._mapBack = null;
            this._aliasCallback = undefined;
            this._where = null;
            this._limit = undefined;
            this._offset = undefined;
            this._groupBy = null;
            this._sortByKeys = [];
            Object.keys(this._relationships).map(ic => this._relationships[ic].included = false);

            if (this._isView) {
                // @ts-ignore TAliasedType is the type going into the new context, TAliasMap in this context actually appears like TAliasedType, but TS doesn't know that.
                this._mapBack = this._view.mapBack;
                // @ts-ignore TAliasedType is the type going into the new context, TAliasMap in this context actually appears like TAliasedType, but TS doesn't know that.
                this._aliasCallback = this._view.aliasCallback;
                
                // @ts-ignore _clone is marked private, but `MyORMContext` is the only place where it is used.
                this._where = this._view.where?._clone();
                this._limit = this._view.limit;
                this._offset = this._view.offset;
                this._groupBy = this._view.groupBy;
                this._sortByKeys = this._view.sortBy;
                this._relationships = JSON.parse(JSON.stringify(this._view.includes));
            }
        })];
    }

    /**
     * Recursively configures an informal relationship, as well as nested relationships specified by `relationshipType` using `relationshipCallback`.
     * @private
     * @param {import("./typings/contexts.js").HasOneCallback<TTableModel>|import("./typings/contexts.js").HasManyCallback<TTableModel>} relationshipCallback Used to configure the keys for the informal foreign relationship.
     * @param {"1:n"|"1:1"} relationshipType
     * @param {string} lastTableName
     */
    _configureRelationship(relationshipCallback, relationshipType, lastTableName = this._realTableName) {
        this.__configureRelationship(relationshipCallback, relationshipType, lastTableName);
    }

    /**
     * Recursively configures an informal relationship, as well as nested relationships specified by `relationshipType` using `relationshipCallback`.
     * @private
     * @param {import("./typings/contexts.js").HasOneCallback<TTableModel>|import("./typings/contexts.js").HasManyCallback<TTableModel>} relationshipCallback Used to configure the keys for the informal foreign relationship.
     * @param {"1:n"|"1:1"} relationshipType
     */
    __configureRelationship(relationshipCallback, relationshipType, lastTableName, fullAliasName="") {
        const $andThatHasOne = (callback, lastTableName, aliasName) => {
            return this.__configureRelationship(callback, "1:1", lastTableName, aliasName);
        };
        const $andThatHasMany = (callback, lastTableName, aliasName) => {
            return this.__configureRelationship(callback, "1:n", lastTableName, aliasName);
        };
        const $to = (prop, joiningTableName, originalTableCol, joiningTableCol) => {
            this._relationships[prop] = {
                thisTable: lastTableName,
                thatTable: joiningTableName,
                primaryKey: originalTableCol,
                foreignKey: joiningTableCol,
                type: relationshipType
            };
            this._promises = [...this._promises, this._describe(joiningTableName, schema => {
                this._relationships[prop].schema = schema;
            }, `${fullAliasName}${fullAliasName != "" ? "_" :""}${prop}`)];
            return {
                andThatHasOne: (callback) => $andThatHasOne(callback, joiningTableName, `${fullAliasName}${fullAliasName != "" ? "_" : ""}${prop}`),
                andThatHasMany: (callback) => $andThatHasMany(callback, joiningTableName, `${fullAliasName}${fullAliasName != "" ? "_" : ""}${prop}`)
            };
        }
        const $with = (prop, realTableName, originalTableCol) => {
            return {
                withForeign: (joiningTableCol) => $to(prop, realTableName, originalTableCol, joiningTableCol)
            };
        }
        const $from = (prop, realTableName) => {
            return {
                withKeys: (originalTableCol, joiningTableCol) => $to(prop, realTableName, originalTableCol, joiningTableCol),
                withPrimary: (thatColumnName) => $with(prop, realTableName, thatColumnName)
            };
        };
        const newProxy = () => new Proxy(/** @type {any} */({}), {
            get: (t, p) => {
                return {
                    fromTable: (realTableName) => $from(p, realTableName),
                    withKeys: (originalTableCol, joiningTableCol) => $to(p, p, originalTableCol, joiningTableCol),
                    withPrimary: (originalTableCol) => $with(p, p, originalTableCol)
                };
            }
        });
        relationshipCallback(newProxy());
        return {
            andThatHasOne: (callback) => $andThatHasOne(callback, lastTableName, fullAliasName),
            andThatHasMany: (callback) => $andThatHasMany(callback, lastTableName, fullAliasName)
        };
    }

    /**
     * Recursively creates an object used for assistance with mapping the results of a query into a serialized version of what the end-user expects.
     * @private
     * @param {any} object Mapping object being created
     * @param {string[]} splits A single key of one record from the results of the original query, split on "_".
     * @param {number} index Index of the splits, this is handled recursively within this function.
     * @param {string} prepend String to prepend onto the mapped property value, this handled recursively within this function and is used when making nested mapping objects.
     * @returns {{[key: keyof TAliasMap]: string|object|((record: any, allRecords: any[]) => any[])}} A mapping object, further used in `._mapResults` to serialize queried results.
     */
    _createMappedObject(object, splits, index = 0, prepend = '') {
        const deserializedKey = prepend + splits.join('_');
        if (index > splits.length - 1) {
            return object;
        }
        if (index == splits.length - 1) {
            return {
                ...object,
                [splits[index]]: deserializedKey
            };
        }
        // If the current split index points to an existing included relationship
        if (splits[index] in this._relationships && this._relationships[splits[index]].type === "1:n" && this._relationships[splits[index]].included) {
            // then we actually set the mapping object's property value to a function that will map results to a different mapping object.
            //   that mapping object will be created from the remaining keys that have not been worked on.
            const f = (record, allRecords) => {
                // get the primary and foreign keys in their unserialized form.
                const pKey = [...splits.slice(0, index), this._relationships[splits[index]].primaryKey].join('_');
                const fKey = [...splits.slice(0, index + 1), this._relationships[splits[index]].foreignKey].join('_');
                const relatedRecords = allRecords.filter(r => record[pKey] === r[fKey]);
                return relatedRecords.map(r => {
                    let mappingObject = {};
                    for (const key in r) {
                        // If it does not start with the relation specified by the splits, then skip.
                        if (!key.startsWith(splits.slice(0, index + 1).join('_'))) continue;
                        const _splits = key.split("_");
                        mappingObject = this._createMappedObject(mappingObject, _splits.slice(index + 1), 0, _splits.slice(0, index + 1).join('_') + '_');
                    }
                    return this._mapResults(r, allRecords, /** @type {{[K in keyof TAliasMap]: string|object|((record: any, allRecords: any[]) => any[])}} */(mappingObject));
                });
            }
            object[splits[index]] = f;
        } else {
            object[splits[index]] = this._createMappedObject(splits[index] in object ? object[splits[index]] : {}, splits, index + 1, prepend);
        }
        return object;
    }

    /**
     * Recursively serializes the `record` argument into its correct form based on `mappingObject`.
     * @private
     * @param {any} record Record to be serialized.
     * @param {any[]} allRecords All records from the query.
     * @param {{[K in keyof TAliasMap]: string|object|((record: any, allRecords: any[]) => any[])}} mappingObject Mapping object created from `._createMappedObject`.
     * @param {string[]} mappingKeys Keys from the `mappingObject`, this is handled recursively within this function.
     * @param {number} currentKeyIdx Index of the `mappingKeys`, this handled recursively within this function.
     * @returns {any}
     */
    _mapResults(record, allRecords, mappingObject, mappingKeys = Object.keys(mappingObject), currentKeyIdx = 0) {
        if (currentKeyIdx >= mappingKeys.length) return undefined;
        const currentKey = mappingKeys[currentKeyIdx];
        if (typeof (mappingObject[currentKey]) === "string") {
            // is a direct map
            return { [currentKey]: record[mappingObject[currentKey]], ...this._mapResults(record, allRecords, mappingObject, mappingKeys, currentKeyIdx + 1) };
        }
        if (typeof (mappingObject[currentKey]) === "function") {
            // is a 1:n relationship
            return {
                [currentKey]: mappingObject[currentKey](record, allRecords),
                ...this._mapResults(record, allRecords, mappingObject, mappingKeys, currentKeyIdx + 1)
            };
        }
        // is a 1:1 relationship
        return {
            [currentKey]: this._mapResults(record, allRecords, mappingObject[currentKey]),
            ...this._mapResults(record, allRecords, mappingObject, mappingKeys, currentKeyIdx + 1)
        };
    }

    // FUNCTIONS HANDLING DIRECT COMMANDS TO THE DATABASE 

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

    /**
     * Used to get the metadata of a table, by using `DESCRIBE {table}`.
     * @private
     * @param {string} table Table to get the meta data of.
     * @param {(schema: {[key: string]: {Field: string, Type: string, Null: string, Key: string, Default: string, Extra: string, Alias: string}}) => void} then
     */
    async _describe(table, then, optionalPrependAlias="") {
        const describedTable = table == this._realTableName ? "" : `${optionalPrependAlias != "" ? optionalPrependAlias : table}_`;
        /** @type {{[key: string]: {Field: string, Type: string, Null: string, Key: string, Default: string, Extra: string, Alias: string}}} */
        const schema = {};
        const [cols] = await this._pool.query(`DESCRIBE ${table}`);
        for (const col of /** @type {{Field: string, Type: string, Null: string, Key: string, Default: string, Extra: string,}[]} */ (cols)) {
            schema[col.Field] = { ...col, Field: `\`${table}\`.\`${col.Field}\``, Alias: `\`${describedTable}${col.Field}\`` };
        }
        then(schema);
    }
    
    // synonyms
    view = this.asView;
    map = this.alias;
}

const EVENT_TABLE_CONTEXT_QUERY = 'table-context-query';
const EVENT_TABLE_CONTEXT_QUERY_FAILED = 'table-context-query-failed';
const EVENT_TABLE_CONTEXT_INSERT = 'table-context-insert';
const EVENT_TABLE_CONTEXT_INSERT_FAILED = 'table-context-insert-failed';
const EVENT_TABLE_CONTEXT_UPDATE = 'table-context-update';
const EVENT_TABLE_CONTEXT_UPDATE_FAILED = 'table-context-update-failed';
const EVENT_TABLE_CONTEXT_DELETE = 'table-context-delete';
const EVENT_TABLE_CONTEXT_DELETE_FAILED = 'table-context-delete-failed';

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command to be executed.
 * @callback SuccessHandler
 * @param {import("./typings/contexts.js").OnSuccessData} data Data that was passed from the event emission.
 */

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command and that command fails.
 * @callback FailHandler
 * @param {import("./typings/contexts.js").OnFailData} data Data that was passed from the event emission.
 */