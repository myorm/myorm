//@ts-check

import { MyORMDeleteError, MyORMInsertError, MyORMQueryError, MyORMSyntaxError, MyORMUpdateError } from './exceptions.js';
import { Where } from './where-builder.js';
import { CommandListener } from './events.js';
import * as Types from './types.js';

/** 
 * Object that holds context to a specific Table in your MySQL database.
 * @template {Types.AbstractModel} TTableModel 
 * Model that represents the actual Table this Context represents.
 * @template {Types.AbstractModel} [TAliasMap=Types.OnlyNonAbstractModels<TTableModel>] 
 * Type representing the model of what the User will receive or pass in when using any transaction function.
 */
export class MyORMContext {
    /**
     * Adapter this context will work on.
     * @protected @type {Types.MyORMAdapter<TTableModel>}
     */
    _adapter;

    /** 
     * Name of the table as it appears in the database
     * @protected @type {string} 
     */ 
    _realTableName;

    /** 
     * `MyORMContext` options for various behavior across the table.
     * @protected @type {Types.TableContextOptions} 
     */ 
    _options;

    /** 
     * State of the context. This will never alter, as each context will have a state that it will always be at.  
     * This is for programmatic views and transferring.
     * @protected 
     * @type {any} 
     */
    _state = { relationships: {} };

    /** 
     * Table's schema as described by MySQL's `DESCRIBE` command.
     * @protected @type {{ [key: string]: { Field: string; Type: string; Null: string; Key: string; Default: string; Extra: string; Alias: string; } }} 
     */
    _schema;

    /**
     * Emitter for event handling.
     * @private @type {CommandListener}
     */
    _emitter;

    /**
     * Promise that handles all asynchronous tasks that occur before any transactions are called.  
     * If any task needs to be handled that is asynchronous, do `this._promise.then(() => { ...yourTask })`.
     * @protected
     * @type {Promise<void>}
     */
    _promise;

    /**
     * Creates a new MyORMContext object given a valid `MyORM` adapter.
     * @param {Types.MyORMAdapter<TTableModel>} adapter Adapter that handles serialization and command execution for built commands. 
     * @param {string} realTableName Name of the table in your database this context is connecting to.
     * @param {Types.TableContextOptions} options Context options that enable certain features, such as truncation, updating all, or sorting query result keys.
     * @param {{ [key: string]: { Field: string; Type: string; Null: string; Key: string; Default: string; Extra: string; Alias: string; } }=} schema Schema as described when first initializing this object. This is only meant for internal use.
     * @param {CommandListener=} emitter An existing emitter
     */
    constructor(adapter, realTableName, options = {}, schema = undefined, emitter = undefined) {
        this._emitter = emitter ?? new CommandListener(realTableName);
        this._adapter = adapter;
        this._realTableName = realTableName;
        this._options = { 
            allowTruncation: false, 
            allowUpdateOnAll: false, 
            sortKeys: false, 
            ...options 
        };

        // get the schema from the database.
        if(schema) {
            this._promise = Promise.resolve();
            this._schema = schema;
        } else {
            this._promise = this._describe(realTableName).then(schema => {
                this._schema = schema;
            });
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
     * @param {Types.HasManyCallback<TTableModel>} relationshipCallback 
     * Used to configure the keys for the informal foreign relationship.
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
     * @param {Types.HasOneCallback<TTableModel>} relationshipCallback 
     * Used to configure the keys for the informal foreign relationship.
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
     * @template {Types.OnlyAbstractModelTypes<TTableModel>} [TAugmentedType=Types.OnlyAbstractModelTypes<TTableModel>] 
     * TTableModel augmented so it only displays Abstract Model types. This will be inferred.
     * @param {Types.ThenIncludeCallbackConfig<Types.AllKeysRequired<TTableModel>>} modelCallback 
     * Callback where the argument, `model`, only has properties of non-primitive types to provide clarity to what sub-type (or table) should be included (or joined on).
     * @returns {MyORMContext<TTableModel, TAliasMap & Required<TAugmentedType>>} 
     * A new context with the all previously configured clauses and the updated inclusions.
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
        return this._transfer(ctx => {
            const newProxy = () => new Proxy(/** @type {any} */({}), {
                get: (t, p, r) => {
                    if (p in ctx._state.relationships) {
                        ctx._state.relationships[p].included = true;
                    } else {
                        throw new MyORMSyntaxError(`${String(p)} is not an existing relationship on this table. Did you configure a relationship using .hasOne() or .hasMany()?`);
                    }
                    return {
                        thenInclude: (modelCallback) => {
                            return modelCallback(newProxy());
                        }
                    };
                }
            });
            modelCallback(newProxy());
        });
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
     * @param {(m: Types.ChainObject<TTableModel>) => void} whereCallback 
     * Builder function to help build a WHERE clause.
     * @returns {MyORMContext<TTableModel, TAliasMap>} 
     * A new context with the all previously configured clauses and the updated filter.
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
        return this._transfer(ctx => {
            const newProxy = (table) => new Proxy(/** @type {any} */({}), {
                get: (t, p, r) => {
                    if (p in ctx._state.relationships) {
                        return newProxy(ctx._state.relationships[p].thatTable);
                    }
                    if (ctx._state.where) {
                        // @ts-ignore This is private, but this is an exception so Views can work appropriately.
                        ctx._state.where._current = { property: `${table}.${String(p)}`, chain: "AND" };
                        return ctx._state.where;
                    }
                    ctx._state.where = Where(String(p), table, ctx._state.relationships, "WHERE");
                    return ctx._state.where;
                }
            });
            whereCallback(newProxy(this._realTableName));
        });
    }

    /**
     * Filter a query to return a specific set of records on the negation of all conditions provided.  
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
     * @param {(m: Types.ChainObject<TTableModel>) => void} whereCallback 
     * Builder function to help build a WHERE clause.
     * @returns {MyORMContext<TTableModel, TAliasMap>} 
     * A new context with the all previously configured clauses and the updated filter.
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
    whereNot(whereCallback) {
        return this._transfer(ctx => {
            const newProxy = (table) => new Proxy(/** @type {any} */({}), {
                get: (t, p, r) => {
                    if (p in this._state.relationships) {
                        return newProxy(ctx._state.relationships[p].thatTable);
                    }
                    if (this._state.where) {
                        // @ts-ignore This is private, but this is an exception so Views can work appropriately.
                        this._state.where._current = { property: `${table}.${String(p)}`, chain: "AND NOT" };
                        return this._state.where;
                    }
                    this._state.where = Where(String(p), table, ctx._state.relationships, "WHERE NOT");
                    return this._state.where;
                }
            });
            whereCallback(newProxy(this._realTableName));
        });
    }

    /**
     * Sorts the records in the order specified by the keys being presented in the callback. 
     * 
     * Specify the direction by chaining onto the property ".asc()" or ".desc()". If no function is specified, then ascending is default.  
     * 
     * If you'd like to sort by multiple keys, specify them in an array.  
     * 
     * __NOTE: This also works on keys from included tables, including one-to-many relationships, just reference the included model further until you reach the property desired.__
     * @param {Types.SortByCallback<TTableModel>} orderByCallback 
     * Callback to help present the keys you'd like to sort on.
     * @returns {MyORMContext<TTableModel, TAliasMap>} 
     * A new context with the all previously configured clauses and the updated sorting configuration.
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
        return this._transfer(ctx => {
            this._state.sortByKeys = [];
            const newProxy = (table = `\`${ctx._realTableName}\`.`) => new Proxy(/** @type {any} */({}), {
                get: (t, p) => {
                    if (p in this._state.relationships) {
                        return newProxy(`\`${ctx._state.relationships[p].thatTable}\`.`);
                    }
                    /** @type {Types.SortByKeyConfig & Types.DirectionCallbacks} */
                    const sbk = {
                        column: String(p).startsWith("$") ? `\`${String(p)}\`` : `${table}\`${String(p)}\``,
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
            this._state.sortByKeys = Array.isArray(sbKeys) ? sbKeys : [sbKeys];
        });
    }

    /**
     * Aggregates the results into groups specified by the keys given.  
     * 
     * Unlike all other model callbacks provided for clause building, the model callback for grouping provides an additional parameter, `aggregate`, which is an object
     * that provides MySQL aggregate functions to use. The following functions provided by `aggregate` are:
     *   - `.total()`: Get the total number of records stored in that group.
     *   - `.count(modelCallback)`: Get the total count of distinct values for the column referenced in `modelCallback` stored in that group.
     *   - `.max(modelCallback)`: Get the maximum value for the column referenced in `modelCallback` stored in that group.
     *   - `.min(modelCallback)`: Get the minimum value for the column referenced in `modelCallback` stored in that group.
     *   - `.sum(modelCallback)`: Get the total sum of all values for the column referenced in `modelCallback` stored in that group.
     *   - `.avg(modelCallback)`: Get the average of all values for the column referenced in `modelCallback` stored in that group.  
     * 
     * When an aggregate function is utilized, the Context is augmented to create a new property of type `number` on the Model in the format of `${aggregate_fn}_{column_name}`. 
     *   You can reference the results of these aggregates through these properties.
     * 
     * __WARNING: Although, the properties are reflected to be `number` types, SQL may return a number-like string instead.__
     * @template {Types.GroupedColumnsModel<TTableModel>} TGroupedColumns
     * Object representing all of the columns being grouped on. (inferred by `groupByCallback` return type)
     * @param {(model: Types.GroupByCallbackModel<Types.AllKeysRequired<TTableModel>>, aggregates: Types.Aggregates) => (keyof TGroupedColumns & string)[]|keyof TGroupedColumns & string} groupByCallback
     * Callback that returns a string or an array of strings, where each string is either a column of `TTableModel` or an augmented aggregate string.
     * @returns {MyORMContext<Types.ReconstructAbstractModel<TTableModel, TGroupedColumns>, Types.ReconstructAbstractModel<TTableModel, TGroupedColumns>>} A new context with the all previously configured clauses and the updated groupings.
     * A new context with the all previously configured clauses, but with an updated `TTableModel`, so it scopes future clauses only on the specified grouped columns.
     * @example
     * ```js
     * const userContext = new MyORMContext(adapter, "User");
     * 
     * // group by one property
     * await userContext
     *      .groupBy(m => m.LastName)
     *      .select();
     * 
     * // group by multiple properties
     * await userContext
     *      .groupBy(m => [m.FirstName, m.LastName])
     *      .select();
     * 
     * // aggregates [groups of users by country with various aggregates for their age, and info about users with distinct last names.]
     * const userGroups = await userContext
     *      .groupBy((m, { total, count, avg, max, min, sum }) => [
     *          m.Country,
     *          total(),
     *          count(m.LastName),
     *          avg(m.BirthDate),
     *          max(m.BirthDate),
     *          min(m.BirthDate),
     *          sum(m.BirthDate),
     *      ])
     *      .select();
     * userGroups[0].Country; 
     * userGroups[0].$total;
     * userGroups[0].$count_LastName; 
     * userGroups[0].$avg_BirthDate;
     * userGroups[0].$max_BirthDate;
     * userGroups[0].$min_BirthDate;
     * userGroups[0].$sum_BirthDate;
     * ```
     */
    groupBy(groupByCallback) {
        return this._transfer((ctx) => {
            /** @returns {Required<TTableModel>} */
            const newProxy = (table = `\`${ctx._realTableName}\`.`, fullAlias = "") => new Proxy(/** @type {any} */({}), {
                get: (t, p, r) => {
                    if (p in ctx._state.relationships) {
                        if (ctx._state.relationships[p].included) {
                            return newProxy(`\`${ctx._state.relationships[p].thatTable}\`.`, `${fullAlias}${String(p)}_`);
                        } else {
                            throw new MyORMSyntaxError(`Cannot group a property from a related table that hasn't been included. (table: ${String(p)})`);
                        }
                    }
                    return `${table}\`${fullAlias}${String(p)}\``;
                }
            });

            const proxy = newProxy();

            // removes sub properties that use underscore (`_`)
            /** @param {string} col */
            function removeSubProps(col) {
                const [table, column] = col.replace(/`/g, "").split(".");
                const columns = column.split("_");
                return `\`${table}\`.\`${columns[columns.length - 1]}\``;
            }

            const aggrs = ctx._adapter.onSerialization(ctx._createAdapterToolsDetail(), ctx._createAdapterContextDetail()).forAggregates({
                transformColForParamUse: removeSubProps,
                transformColForAliasUse: col => String(col).split(".")[1].replace(/`/g, "")
            })

            const groups = groupByCallback(proxy, aggrs);
            ctx._state.groupBy = (Array.isArray(groups) ? groups : [groups]).map(col => {
                if (col.includes(" AS ")) return col;
                return removeSubProps(col);
            });
        });
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
     * @template {Types.AbstractModel} TAliasedType 
     * Aliased type that is derived from the return value of `aliasModelCallback`.
     * @template {Types.NonPrimitiveTypesAsRequired<TTableModel>} [TRequiredModel=Types.NonPrimitiveTypesAsRequired<TTableModel>]
     * @param {((model: TRequiredModel) => TAliasedType)} aliasModelCallback 
     * Callback that should return an object that would represent your desired aliased type.
     * @returns {MyORMContext<TTableModel, Types.NonPrimitiveTypesAsOptional<Types.UndefinedAsOptional<TAliasedType>>>} 
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
        return this._transfer((ctx) => {
            // @ts-ignore This is being assigned to this here because it is meant to be transferred to the new context.
            ctx._state.mapForward = aliasModelCallback;
            const newProxy = (table = "") =>
                new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if (p in ctx._state.relationships && ctx._state.relationships[p].included) {
                            if (!table.endsWith(`${String(p)}.`)) {
                                table = `${table}${String(p)}.`;
                            }
                            if (ctx._state.relationships[p].type === "1:n") {
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
            ctx._state.mapBack = (x) => {
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
     * Skips a given amount of records in the query.
     * @param {number|string} offset 
     * Number or number-like string to offset the records your query would return.
     * @returns {MyORMContext<TTableModel, TAliasMap>} 
     * A new context that is tailored to the state of the command that was built.
     */
    skip(offset) {
        offset = typeof (offset) === "string" ? parseInt(offset) : offset;
        if (isNaN(offset)) throw new MyORMSyntaxError("Must specify a raw number or a parseable number string.");
        return this._transfer((ctx) => {
            ctx._state.offset = offset;
        });
    }

    /**
     * Takes a limited amount of records in the query.
     * @param {number|string} limit 
     * Number or number-like string to limit the number of records your query should return.
     * @returns {MyORMContext<TTableModel, TAliasMap>} 
     * A new context that is tailored to the state of the command that was built.
     */
    take(limit) {
        limit = typeof (limit) === "string" ? parseInt(limit) : limit;
        if (isNaN(limit)) throw new MyORMSyntaxError("Must specify a raw number or a parseable number string.");
        return this._transfer((ctx) => {
            ctx._state.limit = limit;
        });
    }

    /**
     * Executes a query on the table, using all previously built clauses to format the query.
     * @returns {Promise<(TAliasMap)[]>} 
     * List of the returned records, serialized into their correct form, from the built query.
     */
    async select() {
        await this._promise;
        const queryData = this._getClauseData();
        const { cmd, args } = this._adapter.onSerialization(
            this._createAdapterToolsDetail(), 
            this._createAdapterContextDetail()
        ).forQuery(queryData);

        /** @type {TAliasMap[]|TTableModel[]} */
        let ts = await this._query(cmd, args);
        ts = this._serialize(this._realTableName, ts);
        ts = this._alias(ts);
        return ts;
    }

    /**
     * Executes a query for the total number of records on the table, using all previously built clauses to format the query.
     * @returns {Promise<number>} 
     * Number specifying the total count of all records that would be queried.
     */
    async count() {
        await this._promise;
        const queryData = this._getClauseData();
        const { cmd, args } = this._adapter.onSerialization(
            this._createAdapterToolsDetail(), 
            this._createAdapterContextDetail(true, true)
        ).forQuery(queryData);
        const result = await this._count(cmd, args);
        return result;
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
     * @param {TAliasMap|TAliasMap[]} records Records to insert into the table
     * @returns {Promise<TAliasMap[]>} The same records inserted along with default values added (if applicable)
     */
    async insert(records) {
        if (!Array.isArray(records)) records = [records];
        if (records.length <= 0 || (records.length == 1 && records[0] == null)) return [];
        await this._promise;
        let primaryKey = this._getPrimaryKey();
        let identityKey = this._isIdentityKey(primaryKey) ? primaryKey ?? null : null;
        
        // Map the records to their table representation.
        /** @type {(Partial<TTableModel> | TAliasMap)[]} */
        let recordsMappedBack = records;
        if(this._state.mapBack) {
            recordsMappedBack = records.map(this._state.mapBack);
        }

        if(identityKey != null) {
            recordsMappedBack.forEach(r => {
                if(identityKey != null) delete r[identityKey];
            });
        }

        // all keys being inserted.
        const allKeys = recordsMappedBack.flatMap(rec => Object.keys(rec)).filter((rec, n, self) => self.indexOf(rec) == n);
        // filter out properties mapped to objects
        const keysFiltered = allKeys.filter(col => records[0][col] instanceof Date || typeof (recordsMappedBack[0][col]) !== "object");
        // columns in the INSERT INTO (...) segment
        const cols = keysFiltered.map(k => `\`${this._realTableName}\`.\`${k}\``);
        // vals in the VALUES (?, ?,...) segment for each record.
        const vals = recordsMappedBack.map(rec => keysFiltered.map(k => k in rec ? rec[k] !== undefined ? rec[k] : null : null));
        const { cmd, args } = this._adapter.onSerialization(
            this._createAdapterToolsDetail(), 
            this._createAdapterContextDetail(false)
        ).forInsert({
            columns: cols,
            values: vals
        });
        
        const insertIds = await this._insert(cmd, args);
        
        if (identityKey) {
            recordsMappedBack = recordsMappedBack.map((r, n) => {
                //@ts-ignore, this will always be a number, but TS won't know that.
                if(identityKey) r[identityKey] = insertIds[n];
                return r;
            });
        }

        // Map the records to their aliased representation.
        if(this._state.mapForward) {
            return recordsMappedBack.map((r) => {
				const newProxy = () =>
					new Proxy(r, {
						get: (t, p, r) => {
                            if(typeof p === "symbol") throw Error('Internal Error: Property is not a string.');
							if (p === "map") {
								return (m) => {};
							}
							if (p in t) {
								return t[p];
							}
							return newProxy();
						},
					});
                // @ts-ignore this._aliasCallback will not be undefined here.
				let aliased = this._state.mapForward(newProxy());
				// @ts-ignore, we are just filtering out objects/undefineds here.
                aliased = Object.fromEntries(
					Object.entries(aliased).filter(
						([k, v]) => typeof v !== "object" && v !== undefined
					)
				);
				return aliased;
			});
        }

        return /** @type {TAliasMap[]} */ (recordsMappedBack);
    }

    /**
     * Updates one or more records into the Table this context represents.
     * 
     * This update occurs on the primary key on the records (aliased or not) and if the primary key does not exist on that record, then an Error is thrown.  
     * 
     * **This does not cascade update included records.**
     * @param {TAliasMap|TAliasMap[]} records 
     * Record or records to update, where each record contains a primary key.
     * @returns {Promise<number>} 
     * Number of affected rows.
     */
    async update(records) {
        if (!Array.isArray(records)) records = [records];
        if (records.length <= 0 || (records.length == 1 && records[0] == null)) return 0;
        await this._promise;

        // Map the records to their table representation.
        /** @type {(Partial<TTableModel> | TAliasMap)[]} */
        let recordsMappedBack = records;
        if(this._state.mapBack) {
            recordsMappedBack = records.map(this._state.mapBack);
        }

        // Get all keys that are being updated across all records.
        const allKeys = recordsMappedBack.flatMap(r => Object.keys(r)).filter((k,n,self) => self.indexOf(k) === n);

        const { cmd, args } = this._adapter.onSerialization(
            this._createAdapterToolsDetail(), 
            this._createAdapterContextDetail(false)
        ).forUpdate({
            columns: allKeys,
            records: recordsMappedBack
        });

        return this._update(cmd, args);
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
     * @param {Partial<TAliasMap>} propertiesToUpdate 
     * TTableModel model object to use to update all the records.
     * @returns {Promise<number>} 
     * Number of affected rows.
     */
    async updateSelect(propertiesToUpdate) {
        if(propertiesToUpdate == null) return 0;
        await this._promise;
        if ((this._state.where == null || this._state.where.getArgs().length <= 0) && !this._options.allowUpdateOnAll) {
            throw new MyORMSyntaxError('No WHERE clause was built, possibly resulting in all records in the table being updated. If this was intended, pass true to the \'allUpdateOnAll\' property into options when configuring the context.');
        }

        // map record back to the representation of the table
        /** @type {Partial<TAliasMap>|Partial<TTableModel>} */
        let recordMappedBack = propertiesToUpdate;
        if (this._state.mapBack) {
            [recordMappedBack] = [propertiesToUpdate].map(this._state.mapBack);
        }

        const primaryKey = this._getPrimaryKey();
        const identityKey = this._isIdentityKey(primaryKey) ? primaryKey : null;

        // Serialize the value sets, removing the AUTO_INCREMENT key if it exists in the record.
        const sets = Object.keys(recordMappedBack).filter(key => recordMappedBack[key] !== undefined && (identityKey == null || key != identityKey)).map(key => {
            return `\`${key}\` = ?`;
        });

        const { cmd, args } = this._adapter.onSerialization(this._createAdapterToolsDetail(), this._createAdapterContextDetail()).forUpdate({ 
            columns: sets,
            records: [propertiesToUpdate],
            where: this._state.where?.toString(this._realTableName),
            whereArgs: this._state.where?.getArgs(this._realTableName) 
        })
        
        return this._update(cmd, args);
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
     * Record or records to delete, where each record contains a primary key.
     * @returns {Promise<number>} 
     * Number of deleted rows.
     */
    async delete(records) {
        if (!Array.isArray(records)) records = [records];
        if (records.length <= 0 || (records.length == 1 && records[0] == null)) return 0;
        await this._promise;

        // map records back to their representation of the table
        /** @type {(Partial<TTableModel> | TAliasMap)[]} */
        let recordsMappedBack = records;
        if (this._state.mapBack) {
            recordsMappedBack = records.map(this._state.mapBack);
        }

        const { cmd, args } = this._adapter.onSerialization(this._createAdapterToolsDetail(), this._createAdapterContextDetail(false)).forDelete({
            records: recordsMappedBack
        });
        return await this._delete(cmd, args);
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
     * @returns {Promise<number>} 
     * Number of affected rows.
     */
    async deleteSelect() {
        await this._promise;
        if (this._state.where == null || this._state.where.getArgs().length <= 0) {
            throw Error('No WHERE clause was built, possibly resulting in all records in the table being deleted.'
                + '\n\tIf you are sure you know what you are doing, then use the "truncate" function.');
        }
        
        const { cmd, args } = this._adapter.onSerialization(this._createAdapterToolsDetail(), this._createAdapterContextDetail()).forDelete({
            where: this._state.where.toString(this._realTableName),
            whereArgs: this._state.where.getArgs(this._realTableName)
        });
        return await this._delete(cmd, args);
    }

    /**
     * Truncate the table this context represents.
     * WARNING: This function will delete all records in the table. 
     * To avoid accidental calls to this function, an Error will be thrown warning the developer prompting them to set "allowTruncation" to true in the options.
     * @returns {Promise<number>} 
     * Number of deleted rows.
     */
    async truncate() {
        if (!this._options.allowTruncation) {
            throw Error('You are attempting to delete all records in the table. '
                + '\n\tIf you are instead attempting to delete select records, see ".delete()" or ".deleteSelect()". '
                + '\n\tIf this was intended, then pass into the "options" parameter in the constructor, "allowTruncation: true"');
        }
        const { cmd, args } = this._adapter.onSerialization(this._createAdapterToolsDetail(), this._createAdapterContextDetail()).forTruncate();
        const ts = await this._delete(cmd, args);
        return ts;
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context whenever ANY command is successfully executed on the pool.
     * @param {SuccessHandler} callback 
     * Function that executes when a command is sucessfully executed on this context.
     */
    onSuccess(callback) {
        this.onQuerySuccess(callback);
        this.onInsertSuccess(callback);
        this.onUpdateSuccess(callback);
        this.onDeleteSuccess(callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context whenever ANY command fails execution on the pool.
     * @param {FailHandler} callback 
     * Function that executes when a command has been executed and has failed on this context.
     */
    onFail(callback) {
        this.onQueryFail(callback);
        this.onInsertFail(callback);
        this.onUpdateFail(callback);
        this.onDeleteFail(callback);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command is successfully executed on the pool.
     * @param {SuccessHandler} success 
     * Function that executes when a query command is executed on this context.
     */
    onQuerySuccess(success) {
        this._emitter.onQuerySuccess(success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Insert command is successfully executed on the pool.
     * @param {SuccessHandler} success 
     * Function that executes when an insert command is executed on this context.
     */
    onInsertSuccess(success) {
        this._emitter.onInsertSuccess(success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Update command is successfully executed on the pool.
     * @param {SuccessHandler} success 
     * Function that executes when an update command is executed on this context.
     */
    onUpdateSuccess(success) {
        this._emitter.onUpdateSuccess(success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Delete command is successfully executed on the pool.
     * @param {SuccessHandler} success 
     * Function that executes when a delete command is executed on this context.
     */
    onDeleteSuccess(success) {
        this._emitter.onDeleteSuccess(success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command has been executed and has failed on the pool.
     * @param {FailHandler} fail 
     * Function that executes when a query command is fails execution on this context.
     */
    onQueryFail(fail) {
        this._emitter.onQueryFail(fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Insert command has been executed and has failed on the pool.
     * @param {FailHandler} fail 
     * Function that executes when an insert command is fails execution on this context.
     */
    onInsertFail(fail) {
        this._emitter.onInsertFail(fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Update command has been executed and has failed on the pool.
     * @param {FailHandler} fail 
     * Function that executes when an update command is fails execution on this context.
     */
    onUpdateFail(fail) {
        this._emitter.onUpdateFail(fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Delete command has been executed and has failed on the pool.
     * @param {FailHandler} fail 
     * Function that executes when a delete command is fails execution on this context.
     */
    onDeleteFail(fail) {
        this._emitter.onDeleteFail(fail);
    }

    /**
     * Use this function to transfer the state of this context to a new context.
     * @private
     * @param {(ctx: MyORMContext<TTableModel, any>) => void} callback 
     * Function that is called before the state is transferred over to the new context.  This should be used to initialize all new states.  
     * If something is overridden, then the new property will take precedence over the old property, overriding it.
     * @returns {any} 
     * The new `MyORMContext` with the most updated state.
     */
    _transfer(callback) {
        let ctx = new MyORMContext(this._adapter, this._realTableName, this._options, this._schema, this._emitter);
        ctx._promise = this._promise.then(() => {
            ctx._state = this._state;
            callback(ctx);
            ctx._schema = this._schema;
            ctx._state = { ...this._state, ...ctx._state };
            ctx._state.relationships = this._state.relationships;
        });
        return ctx;
    }

    /**
     * Use this function to configure a relationship between two tables.
     * @private
     * @param {Types.HasOneCallback<TTableModel>|Types.HasManyCallback<TTableModel>} relationshipCallback 
     * Used to configure the keys for the informal foreign relationship.
     * @param {"1:n"|"1:1"} relationshipType 
     * Type of relationship being configured
     */
    _configureRelationship(relationshipCallback, relationshipType, lastTableName = this._realTableName, fullAliasName="") {
        const $andThatHasOne = (callback, lastTableName, aliasName) => {
            return this._configureRelationship(callback, "1:1", lastTableName, aliasName);
        };
        const $andThatHasMany = (callback, lastTableName, aliasName) => {
            return this._configureRelationship(callback, "1:n", lastTableName, aliasName);
        };
        const $to = (prop, joiningTableName, originalTableCol, joiningTableCol) => {
            this._state.relationships[prop] = {
                thisTable: lastTableName,
                thatTable: joiningTableName,
                primaryKey: originalTableCol,
                foreignKey: joiningTableCol,
                type: relationshipType
            };
            this._promise = this._promise.then(async () => {
                const schema = await this._describe(joiningTableName, `${fullAliasName}${fullAliasName != "" ? "_" :""}${prop}`);
                this._state.relationships[prop].schema = schema;
            });
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
     * **Recursive**  
     * Use this function to create a mapping object which is used to assist with mapping the results of a query into a serialized version of what the end-user would expect.
     * @private
     * @param {any} object 
     * Mapping object being created
     * @param {string[]} splits 
     * A single key of one record from the results of the original query, split on "_".
     * @param {number} index 
     * Index of the splits, this is handled recursively within this function.
     * @param {string} prepend 
     * String to prepend onto the mapped property value, this handled recursively within this function and is used when making nested mapping objects.
     * @returns {{[key: keyof TAliasMap]: string|object|((record: any, allRecords: any[]) => any[])}} 
     * A mapping object, further used in `._mapResults` to serialize queried results.
     */
    _createMapping(object, splits, index = 0, prepend = '') {
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
        if (splits[index] in this._state.relationships 
            && this._state.relationships[splits[index]].type === "1:n" 
            && this._state.relationships[splits[index]].included
            && !("groupBy" in this._state) // groupBy will never return an array.
        ) {
            // then we actually set the mapping object's property value to a function that will map results to a different mapping object.
            //   that mapping object will be created from the remaining keys that have not been worked on.
            const f = (record, allRecords) => {
                // get the primary and foreign keys in their unserialized form.
                const pKey = [...splits.slice(0, index), this._state.relationships[splits[index]].primaryKey].join('_');
                const fKey = [...splits.slice(0, index + 1), this._state.relationships[splits[index]].foreignKey].join('_');
                const relatedRecords = allRecords.filter(r => record[pKey] === r[fKey]);
                return relatedRecords.map(r => {
                    let mappingObject = {};
                    for (const key in r) {
                        // If it does not start with the relation specified by the splits, then skip.
                        if (!key.startsWith(splits.slice(0, index + 1).join('_'))) continue;
                        const _splits = key.split("_");
                        mappingObject = this._createMapping(mappingObject, _splits.slice(index + 1), 0, _splits.slice(0, index + 1).join('_') + '_');
                    }
                    return this._mapResults(r, allRecords, /** @type {{[K in keyof TAliasMap]: string|object|((record: any, allRecords: any[]) => any[])}} */(mappingObject));
                });
            }
            object[splits[index]] = f;
        } else {
            object[splits[index]] = this._createMapping(splits[index] in object ? object[splits[index]] : {}, splits, index + 1, prepend);
        }
        return object;
    }

    /**
     * **Recursive**  
     * Use this function to serialize `record` into a mapped form based on `mappingObject`.
     * @private
     * @param {any} record 
     * Record to be serialized.
     * @param {any[]} allRecords 
     * All records from the query.
     * @param {{[K in keyof TAliasMap]: string|object|((record: any, allRecords: any[]) => any[])}} mappingObject Mapping object created from `._createMapping`.
     * @param {string[]} mappingKeys 
     * Keys from the `mappingObject`, this is handled recursively within this function.
     * @param {number} currentKeyIdx 
     * Index of the `mappingKeys`, this handled recursively within this function.
     * @returns {any}
     * Mapped record based on what the User gave in `.alias()`.
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

    /**
     * Use this function to get all the data that was built using clause functions.
     * @private
     * @param {string} table 
     * Name of the table to filter the where clauses on. (default: "",  or all conditions)
     */
    _getClauseData(table="") {
        let selects = [
            ...Object.values(this._schema).map(o => `${o.Field} AS ${o.Alias}`),
            ...Object.keys(this._state.relationships)
                .filter(rKey => this._state.relationships[rKey].included)
                .flatMap(k => Object.values(this._state.relationships[k].schema)
                    .map(o => `${o.Field} AS ${o.Alias}`))
        ];
        if (this._state.groupBy) {
            selects = [...this._state.groupBy.map(o => {
                const key = o.replace(/`/g, "");
                const splits = key.split(".");
                let table = null;
                if (splits.length > 1) {
                    if (splits[0] in this._state.relationships) {
                        table = splits[0];
                    }
                }
                if (table) {
                    if (splits[1] in this._state.relationships[table].schema) {
                        o = `${this._state.relationships[table].schema[splits[1]].Field} AS ${this._state.relationships[table].schema[splits[1]].Alias}`;
                    }
                } else {
                    if (key in this._schema) {
                        o = `${this._schema[key].Field} AS ${this._schema[key].Alias}`;
                    }
                }
                return o;
            })];
        }
        let where = this._state.where?.toString(table);
        let groupBy = this._state.groupBy?.map(col => 
            col.includes(" AS ") // if it includes "AS" then it was an aggregate function, so then this won't be added to the group by clause.
                ? "" 
                : `${col}`
            ).filter(s => s != "");
        let orderBy = this._state.sortByKeys;
        let limit = this._state.limit;
        let offset = this._state.offset;
        let includes = Object.values(this._state.relationships)
            .filter(m => m.included)
            .map(ic => `\`${ic.thatTable}\` ON \`${ic.thisTable}\`.\`${ic.primaryKey}\`=\`${ic.thatTable}\`.\`${ic.foreignKey}\``)
        let from = [this._realTableName, ...includes];
        return {
            selects,
            from,
            where,
            groupBy,
            orderBy,
            limit,
            offset,
            whereArgs: this._state.where?.getArgs(table) ?? []
        }
    }

    /**
     * Use this function to serialize a list of SQL query results into the end-user's expected structure.
     * @private
     * @param {string} thisTable 
     * Name of the table the records are being serialized under.
     * @param {any[]} records
     * Array of records that are to be serialized.
     */
    _serialize(thisTable, records) {
        // Serialize the results into their user-expected form.
        // If the query occurred with a GROUP BY clause, then no serialization should occur.
        if (records.length > 0) {
            let primaryKey = this._getPrimaryKey();
            let mappingObject = {};
            for (const key in records[0]) {
                if(key.startsWith("$")) {
                    mappingObject = {...mappingObject, [key]: key};
                    continue;
                }
                const splits = key.split("_");
                mappingObject = this._createMapping(mappingObject, splits);
            }
            if (primaryKey && Object.values(this._state.relationships).filter(v => v.included).length > 0) {
                let recs = records;
                // if there is a relationship with the main table and that relationship is one-to-many, 
                //   then we have to filter out the duplicate primary keyed records.
                // @TODO This currently filters out duplicate primary keyed records, 
                //   but if the relationship was configured on a non-primary key, then this would yield incorrect results.
                const relationships = Object.values(this._state.relationships).filter(v => v.included && v.thisTable == thisTable && v.type == "1:n");
                if (relationships.length > 0 && !("groupBy" in this._state)) {
                    recs = records.filter((t, n, self) => n === self.findIndex(_t => _t[primaryKey] === t[primaryKey]));
                }
                records = recs.map(t => this._mapResults(t, records, /** @type {any} */(mappingObject)));
            }
        }
        return records;
    }

    /**
     * Applies the alias callback function (if it was provided) to the list of `records`.
     * @private
     * @param {TAliasMap[]|TTableModel[]} records 
     * Records being aliased.
     * @returns {TAliasMap[]} 
     * Same records returned in their aliased state.
     */
    _alias(records) {
        // Apply the alias callback, if one was provided.
        if (this._state.mapForward) {
            records = records.map(t => {
                const newProxy = o => new Proxy(o, {
                    get: (target, prop) => {
                        if (prop in this._state.relationships) {
                            return newProxy(target[prop]);
                        }
                        return target[prop];
                    }
                });
                // @ts-ignore TypeScript is acting weird and saying this is possibly undefined...
                return this._state.mapForward(newProxy(t));
            });
        }
        return /** @type {any} */ (records);
    }

    // Transactional functions-- These are functions that call the adapter to get results from the database.

    /**
     * Use this function to execute a query (for COUNT(*)) command against the Table this context represents.
     * @protected
     * @param {string} cmd 
     * Command to execute
     * @param {any[]} args 
     * Arguments to pass to avoid sql injections.
     * @returns {Promise<number>} 
     * Number of records (count) from the query.
     */
    async _count(cmd, args) {
        try {
            const result = await this._adapter.handleCount(cmd, args);
            this._emitter.emitQuerySuccess(this._createEventDetail(cmd, args));
            return /** @type {any} */ (result);
        } catch (err) {
            const detail = this._createEventDetail(cmd, args, err);
            this._emitter.emitQueryFail(detail);
            throw new MyORMQueryError(`An error occurred when attempting to query from ${`${detail.schema}`}.`, err);
        }
    }

    /**
     * Use this function to execute a query command against the Table this context represents.
     * @protected
     * @param {string} cmd 
     * Command to execute
     * @param {any[]} args 
     * Arguments to pass to avoid sql injections.
     * @returns {Promise<TTableModel[]>} 
     * Array of objects of the type `TTableModel`.
     */
    async _query(cmd, args) {
        try {
            const result = await this._adapter.handleQuery(cmd, args);
            this._emitter.emitQuerySuccess(this._createEventDetail(cmd, args));
            return /** @type {any} */ (result);
        } catch (err) {
            const detail = this._createEventDetail(cmd, args, err);
            this._emitter.emitQueryFail(detail);
            throw new MyORMQueryError(`An error occurred when attempting to query from ${`${detail.schema}`}.`, err);
        }
    }

    /**
     * Use this function to execute an insert command against the Table this context represents.
     * @private
     * @param {string} cmd 
     * Command to execute
     * @param {any[]=} args 
     * Arguments to pass to avoid sql injections.
     * @returns {Promise<number[]>} 
     * The insertId of the first item inserted.
     */
    async _insert(cmd, args = undefined) {
        try {
            const result = await this._adapter.handleInsert(cmd, args);
            this._emitter.emitInsertSuccess(this._createEventDetail(cmd, args));
            return result;
        } catch (err) {
            const detail = this._createEventDetail(cmd, args, err);
            this._emitter.emitInsertFail(detail);
            throw new MyORMInsertError(`An error occurred when attempting to insert into ${detail.schema}.`, err);
        }
    }

    /**
     * Use this function to execute an update command against the Table this context represents.
     * @private
     * @param {string} cmd 
     * Command to execute
     * @param {any[]=} args 
     * Arguments to pass to avoid sql injections.
     * @returns {Promise<number>} 
     * Number of rows that were updated.
     */
    async _update(cmd, args = undefined) {
        try {
            const result = await this._adapter.handleUpdate(cmd, args);
            this._emitter.emitUpdateSuccess(this._createEventDetail(cmd, args, undefined, result));
            return result;
        } catch (err) {
            const detail = this._createEventDetail(cmd, args, err);
            this._emitter.emitUpdateFail(detail);
            throw new MyORMUpdateError(`An error occurred when attempting to update ${detail.schema}.`, err);
        }
    }

    /**
     * Use this function to execute a delete command against the Table this context represents.
     * @private
     * @param {string} cmd 
     * Delete command to execute
     * @param {any[]=} args 
     * Arguments to pass to avoid sql injections.
     * @returns {Promise<number>} 
     * Number of rows that were deleted.
     */
    async _delete(cmd, args = undefined) {
        try {
            const result = await this._adapter.handleDelete(cmd, args);
            this._emitter.emitDeleteSuccess(this._createEventDetail(cmd, args, undefined, result));
            return result;
        } catch (err) {
            const detail = this._createEventDetail(cmd, args, err);
            this._emitter.emitDeleteFail(detail);
            throw new MyORMDeleteError(`An error occurred when attempting to delete from ${detail.schema}.`, err);
        }
    }

    /**
     * Use this function to execute a describe command against the Table this context represents.
     * @private
     * @param {string} table 
     * Table to get the metadata of.
     */
    async _describe(table, optionalPrependAlias="") {
        const describedTable = table == this._realTableName ? "" : `${optionalPrependAlias != "" ? optionalPrependAlias : table}_`;
        /** @type {{[key: string]: Types.SchemaField}} */
        let schema = {};
        const { cmd, args } = this._adapter.onSerialization(this._createAdapterToolsDetail(), this._createAdapterContextDetail()).forDescribe(({ table }));
        const schemaFields = await this._adapter.handleDescribe(cmd, args);
        for(const field of schemaFields) {
            schema[field.Field] = { ...field, Field: `\`${table}\`.\`${field.Field}\``, Alias: `\`${describedTable}${field.Field}\`` };
        }
        return schema;
    }
    
    // synonyms

    map = this.alias;
    orderBy = this.sortBy;
    
    // utility

    /**
     * Use this function to get the primary key of the table. If no primary key exists, then `undefined` is returned.
     * @private
     * @returns {(keyof TTableModel & string)=} 
     * Some key in the table that is described as the primary key.
     */
    _getPrimaryKey() {
        for(const key in this._schema) {
            if(this._schema[key].Key === "PRI") {
                return key;
            }
        }
        return undefined;
    }

    /**
     * Use this function to check if `key` is an identity key. (The key auto increments in the database)
     * @private
     * @param {(keyof TTableModel & string)=} key 
     * Some key in the table.
     * @returns {boolean} 
     * True if the key is an auto increment key. False if the key does not exist in the schema or does not have an `AUTO_INCREMENT` attribute.
     */
    _isIdentityKey(key) {
        if(key === undefined || !(key in this._schema)) return false;
        return this._schema[key].Extra === "auto_increment";
    }

    /**
     * Use this to create a detail to be passed into an emitted Event for end-user handling.  
     * This is to be passed into the `.on_Success()` or `.on_Fail()` functions.
     * @private
     * @param {string} cmd 
     * Command passed into the adapter
     * @param {any[]=} args 
     * Respective arguments to the `cmd`.
     * @param {Error=} err 
     * Error that was thrown.
     * @param {number=} numRowsAffected 
     * Number of rows affected
     * @returns {any} 
     * `OnSuccessData` or `OnFailData` based on if `err` is defined as some JS Error.
     */
    _createEventDetail(cmd, args, err=undefined, numRowsAffected=undefined) {
        let cmdRaw = cmd;
        args?.forEach(a => cmdRaw = cmdRaw.replace("?", typeof a === "string" || a instanceof Date ? `'${a}'` : a));
        args?.forEach(a => cmdRaw = cmdRaw.replace("?", typeof a === "string" || a instanceof Date ? `'${a}'` : a));

        if(err) {
            return {
                error: err,
                dateIso: new Date().toISOString(),
                cmdRaw,
                cmdSanitized: cmd,
                args: args ?? []
            };
        } else {
            return {
                numRowsAffected,
                dateIso: new Date().toISOString(),
                cmdRaw,
                cmdSanitized: cmd,
                args: args ?? []
            };
        }
    }

    /**
     * Use this function to get information as a detail about the context in general.  
     * This is to be passed into `<Adapter>.onSerialization()` function.
     * @private
     * @returns {Types.OnSerializationTools<TTableModel>}
     * Object containing data that can be used throughout all serialization functions.
     */
    _createAdapterToolsDetail() {
        return { MyORMError: MyORMSyntaxError, Where, Schema: this._schema, Relationships: this._state.relationships };
    }

    /**
     * Use this function to get information as a detail about the command being executed.  
     * This is to be passed into the `<Adapter>.handle()` functions.
     * @private
     * @param {boolean} isExplicit 
     * True if the command being executed is an explicit transaction (uses built clauses), otherwise false. (default: true)
     * @param {boolean} isCount 
     * True if the command being executed is "count", otherwise false. (default: false)
     * @returns {Types.CommandContext} 
     * Contextual data associated with the command so the adapter has extra information.
     */
    _createAdapterContextDetail(isExplicit = true, isCount = false) {
        const pKey = this._getPrimaryKey();
        const cmdCtx = {
            mainTableName: this._realTableName,
            primaryKey: pKey,
            isIdentityKey: this._isIdentityKey(pKey),
            isCount,
            isExplicit, 
            hasOneToOne: Object.values(this._state.relationships).filter(v => v.included && v.type == "1:1").length > 0,
            hasOneToMany: Object.values(this._state.relationships).filter(v => v.included && v.type == "1:n").length > 0
        };
        return cmdCtx;
    }
}

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command to be executed.
 * @callback SuccessHandler
 * @param {Types.OnSuccessData} data Data that was passed from the event emission.
 */

/**
 * Callback function on a Connection Pool handled by the emission of when a context sends a command and that command fails.
 * @callback FailHandler
 * @param {Types.OnFailData} data Data that was passed from the event emission.
 */