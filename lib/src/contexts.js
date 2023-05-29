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
     * @type {Types.MyORMAdapter<TTableModel>}
     */
    #adapter;

    /** 
     * Name of the table as it appears in the database
     * @type {string} 
     */ 
    #realTableName;

    /** 
     * `MyORMContext` options for various behavior across the table.
     * @type {Types.TableContextOptions} 
     */ 
    #options;

    /** 
     * State of the context. This will never alter, as each context will have a state that it will always be at.  
     * This is for programmatic views and transferring.
     * @type {import('./types.js').State<Partial<TTableModel>, TAliasMap>} 
     */
    #state = { relationships: {} };

    /** 
     * Table's schema as described by MySQL's `DESCRIBE` command.
     * @type {{ [key: string]: Types.SchemaField }} 
     */
    #schema;

    /**
     * Emitter for event handling.
     * @type {CommandListener}
     */
    #emitter;

    /**
     * Promise that handles all asynchronous tasks that occur before any transactions are called.  
     * If any task needs to be handled that is asynchronous, do `this._promise.then(() => { ...yourTask })`.
     * @type {Promise<void>}
     */
    #promise;

    /**
     * Creates a new MyORMContext object given a valid `MyORM` adapter.
     * @param {Types.MyORMAdapter<TTableModel>} adapter Adapter that handles serialization and command execution for built commands. 
     * @param {string} realTableName Name of the table in your database this context is connecting to.
     * @param {Types.TableContextOptions} options Context options that enable certain features, such as truncation, updating all, or sorting query result keys.
     * @param {{ [key: string]: { Field: string; Type: string; Null: string; Key: string; Default: string; Extra: string; Alias: string; } }=} schema Schema as described when first initializing this object. This is only meant for internal use.
     * @param {CommandListener=} emitter An existing emitter
     */
    constructor(adapter, realTableName, options = {}, schema = undefined, emitter = undefined) {
        this.#emitter = emitter ?? new CommandListener(realTableName);
        this.#adapter = adapter;
        this.#adapter.options = { ...this.#adapter.options };
        this.#realTableName = realTableName;
        this.#options = { 
            allowTruncation: false, 
            allowUpdateOnAll: false, 
            sortKeys: false, 
            ...options 
        };

        // get the schema from the database.
        if(schema) {
            this.#promise = Promise.resolve();
            this.#schema = schema;
        } else {
            this.#promise = this.#describe(realTableName).then(schema => {
                this.#schema = schema;
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
        this.#configureRelationship(relationshipCallback, "1:n");
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
        this.#configureRelationship(relationshipCallback, "1:1");
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
        return this.#transfer(ctx => {
            const newProxy = () => new Proxy(/** @type {any} */({}), {
                get: (t, p, r) => {
                    if (p in ctx.#state.relationships) {
                        ctx.#state.relationships[p].included = true;
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
        return this.#transfer(ctx => {
            const newProxy = (table) => new Proxy(/** @type {any} */({}), {
                get: (t, p, r) => {
                    if (p in ctx.#state.relationships) {
                        return newProxy(ctx.#state.relationships[p].thatTable);
                    }
                    if (ctx.#state.where) {
                        // @ts-ignore This is private, but this is an exception so Views can work appropriately.
                        ctx.#state.where._current = { property: `${table}.${String(p)}`, chain: "AND" };
                        return ctx.#state.where;
                    }
                    ctx.#state.where = Where(String(p), table, ctx.#state.relationships, "WHERE");
                    return ctx.#state.where;
                }
            });
            whereCallback(newProxy(this.#realTableName));
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
        return this.#transfer(ctx => {
            const newProxy = (table) => new Proxy(/** @type {any} */({}), {
                get: (t, p, r) => {
                    if (p in this.#state.relationships) {
                        return newProxy(ctx.#state.relationships[p].thatTable);
                    }
                    if (this.#state.where) {
                        // @ts-ignore This is private, but this is an exception so Views can work appropriately.
                        this.#state.where._current = { property: `${table}.${String(p)}`, chain: "AND NOT" };
                        return this.#state.where;
                    }
                    this.#state.where = Where(String(p), table, ctx.#state.relationships, "WHERE NOT");
                    return this.#state.where;
                }
            });
            whereCallback(newProxy(this.#realTableName));
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
        return this.#transfer(ctx => {
            this.#state.sortBy = [];
            const newProxy = (table = `\`${ctx.#realTableName}\`.`) => new Proxy(/** @type {any} */({}), {
                get: (t, p) => {
                    if (p in this.#state.relationships) {
                        return newProxy(`\`${ctx.#state.relationships[p].thatTable}\`.`);
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
            this.#state.sortBy = Array.isArray(sbKeys) ? sbKeys : [sbKeys];
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
        return this.#transfer((ctx) => {
            /** @returns {Required<TTableModel>} */
            const newProxy = (table = `\`${ctx.#realTableName}\`.`, fullAlias = "") => new Proxy(/** @type {any} */({}), {
                get: (t, p, r) => {
                    if (p in ctx.#state.relationships) {
                        if (ctx.#state.relationships[p].included) {
                            return newProxy(`\`${ctx.#state.relationships[p].thatTable}\`.`, `${fullAlias}${String(p)}_`);
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

            const aggrs = ctx.#adapter
                .onSerialization(
                    ctx.#createAdapterToolsDetail(), 
                    ctx.#createAdapterContextDetail()
                ).forAggregates({
                    transformColForParamUse: removeSubProps,
                    transformColForAliasUse: col => String(col).split(".")[1].replace(/`/g, "")
                }
            )

            const groups = groupByCallback(proxy, aggrs);
            ctx.#state.groupBy = (Array.isArray(groups) ? groups : [groups]).map(col => {
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
        return this.#transfer((ctx) => {
            // @ts-ignore This is being assigned to this here because it is meant to be transferred to the new context.
            ctx.#state.mapForward = aliasModelCallback;
            const newProxy = (table = "") =>
                new Proxy(/** @type {any} */({}), {
                    get: (t, p, r) => {
                        if (p in ctx.#state.relationships && ctx.#state.relationships[p].included) {
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
     * Skips a given amount of records in the query.
     * @param {number|string} offset 
     * Number or number-like string to offset the records your query would return.
     * @returns {MyORMContext<TTableModel, TAliasMap>} 
     * A new context that is tailored to the state of the command that was built.
     */
    skip(offset) {
        offset = typeof (offset) === "string" ? parseInt(offset) : offset;
        if (isNaN(offset)) throw new MyORMSyntaxError("Must specify a raw number or a parseable number string.");
        return this.#transfer((ctx) => {
            ctx.#state.offset = offset;
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
        return this.#transfer((ctx) => {
            ctx.#state.limit = limit;
        });
    }

    /**
     * Executes a query on the table, using all previously built clauses to format the query.
     * @returns {Promise<(TAliasMap)[]>} 
     * List of the returned records, serialized into their correct form, from the built query.
     */
    async select() {
        await this.#promise;
        const queryData = this.#getClauseData();
        const { cmd, args } = this.#adapter.onSerialization(
            this.#createAdapterToolsDetail(), 
            this.#createAdapterContextDetail()
        ).forQuery(queryData);

        /** @type {TAliasMap[]|TTableModel[]} */
        let ts = await this.#query(cmd, args);
        ts = this.#serialize(ts);
        ts = this.#alias(ts);
        return ts;
    }

    /**
     * Executes a query for the total number of records on the table, using all previously built clauses to format the query.
     * @returns {Promise<number>} 
     * Number specifying the total count of all records that would be queried.
     */
    async count() {
        await this.#promise;
        const queryData = this.#getClauseData();
        const { cmd, args } = this.#adapter.onSerialization(
            this.#createAdapterToolsDetail(), 
            this.#createAdapterContextDetail(true, true)
        ).forQuery(queryData);
        const result = await this.#count(cmd, args);
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
        await this.#promise;
        let primaryKey = this.#getPrimaryKey();
        let identityKey = this.#isIdentityKey(primaryKey) ? primaryKey ?? null : null;
        
        // Map the records to their table representation.
        /** @type {(Partial<TTableModel> | TAliasMap)[]} */
        let recordsMappedBack = records;
        if(this.#state.mapBack) {
            recordsMappedBack = records.map(this.#state.mapBack);
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
        const cols = keysFiltered.map(k => `\`${this.#realTableName}\`.\`${k}\``);
        // vals in the VALUES (?, ?,...) segment for each record.
        const vals = recordsMappedBack.map(rec => keysFiltered.map(k => k in rec ? rec[k] !== undefined ? rec[k] : null : null));
        const { cmd, args } = this.#adapter.onSerialization(
            this.#createAdapterToolsDetail(), 
            this.#createAdapterContextDetail(false)
        ).forInsert({
            columns: cols,
            values: vals
        });
        
        const insertIds = await this.#insert(cmd, args);
        
        if (identityKey) {
            recordsMappedBack = recordsMappedBack.map((r, n) => {
                //@ts-ignore, this will always be a number, but TS won't know that.
                if(identityKey) r[identityKey] = insertIds[n];
                return r;
            });
        }

        // Map the records to their aliased representation.
        if(this.#state.mapForward) {
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
				let aliased = this.#state.mapForward(newProxy());
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
        await this.#promise;

        // Map the records to their table representation.
        /** @type {(Partial<TTableModel> | TAliasMap)[]} */
        let recordsMappedBack = records;
        if(this.#state.mapBack) {
            recordsMappedBack = records.map(this.#state.mapBack);
        }

        // Get all keys that are being updated across all records.
        const allKeys = recordsMappedBack.flatMap(r => Object.keys(r)).filter((k,n,self) => self.indexOf(k) === n);

        const { cmd, args } = this.#adapter.onSerialization(
            this.#createAdapterToolsDetail(), 
            this.#createAdapterContextDetail(false)
        ).forUpdate({
            columns: allKeys,
            records: recordsMappedBack
        });

        return this.#update(cmd, args);
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
        await this.#promise;
        if ((this.#state.where == null || this.#state.where.getArgs().length <= 0) && !this.#options.allowUpdateOnAll) {
            throw new MyORMSyntaxError('No WHERE clause was built, possibly resulting in all records in the table being updated. If this was intended, pass true to the \'allUpdateOnAll\' property into options when configuring the context.');
        }

        // map record back to the representation of the table
        /** @type {Partial<TAliasMap>|Partial<TTableModel>} */
        let recordMappedBack = propertiesToUpdate;
        if (this.#state.mapBack) {
            [recordMappedBack] = [/** @type {TAliasMap} */(propertiesToUpdate)].map(this.#state.mapBack);
        }

        const primaryKey = this.#getPrimaryKey();
        const identityKey = this.#isIdentityKey(primaryKey) ? primaryKey : null;

        // Serialize the value sets, removing the AUTO_INCREMENT key if it exists in the record.
        const sets = Object.keys(recordMappedBack)
            .filter(key => recordMappedBack[key] !== undefined && (identityKey == null || key != identityKey))
            .map(key => {
            return `\`${key}\` = ?`;
        });

        const { cmd, args } = this.#adapter.onSerialization(this.#createAdapterToolsDetail(), this.#createAdapterContextDetail()).forUpdate({ 
            columns: sets,
            records: [propertiesToUpdate],
            where: this.#state.where?.toString(this.#realTableName),
            whereArgs: this.#state.where?.getArgs(this.#realTableName) 
        })
        
        return this.#update(cmd, args);
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
        await this.#promise;

        // map records back to their representation of the table
        /** @type {(Partial<TTableModel> | TAliasMap)[]} */
        let recordsMappedBack = records;
        if (this.#state.mapBack) {
            recordsMappedBack = records.map(this.#state.mapBack);
        }

        const { cmd, args } = this.#adapter.onSerialization(this.#createAdapterToolsDetail(), this.#createAdapterContextDetail(false)).forDelete({
            records: recordsMappedBack
        });
        return await this.#delete(cmd, args);
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
        await this.#promise;
        if (this.#state.where == null || this.#state.where.getArgs().length <= 0) {
            throw Error('No WHERE clause was built, possibly resulting in all records in the table being deleted.'
                + '\n\tIf you are sure you know what you are doing, then use the "truncate" function.');
        }
        
        const { cmd, args } = this.#adapter.onSerialization(this.#createAdapterToolsDetail(), this.#createAdapterContextDetail()).forDelete({
            where: this.#state.where.toString(this.#realTableName),
            whereArgs: this.#state.where.getArgs(this.#realTableName)
        });
        return await this.#delete(cmd, args);
    }

    /**
     * Truncate the table this context represents.
     * WARNING: This function will delete all records in the table. 
     * To avoid accidental calls to this function, an Error will be thrown warning the developer prompting them to set "allowTruncation" to true in the options.
     * @returns {Promise<number>} 
     * Number of deleted rows.
     */
    async truncate() {
        if (!this.#options.allowTruncation) {
            throw Error('You are attempting to delete all records in the table. '
                + '\n\tIf you are instead attempting to delete select records, see ".delete()" or ".deleteSelect()". '
                + '\n\tIf this was intended, then pass into the "options" parameter in the constructor, "allowTruncation: true"');
        }
        const { cmd, args } = this.#adapter.onSerialization(this.#createAdapterToolsDetail(), this.#createAdapterContextDetail()).forTruncate();
        const ts = await this.#delete(cmd, args);
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
        this.#emitter.onQuerySuccess(success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Insert command is successfully executed on the pool.
     * @param {SuccessHandler} success 
     * Function that executes when an insert command is executed on this context.
     */
    onInsertSuccess(success) {
        this.#emitter.onInsertSuccess(success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Update command is successfully executed on the pool.
     * @param {SuccessHandler} success 
     * Function that executes when an update command is executed on this context.
     */
    onUpdateSuccess(success) {
        this.#emitter.onUpdateSuccess(success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Delete command is successfully executed on the pool.
     * @param {SuccessHandler} success 
     * Function that executes when a delete command is executed on this context.
     */
    onDeleteSuccess(success) {
        this.#emitter.onDeleteSuccess(success);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Query command has been executed and has failed on the pool.
     * @param {FailHandler} fail 
     * Function that executes when a query command is fails execution on this context.
     */
    onQueryFail(fail) {
        this.#emitter.onQueryFail(fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Insert command has been executed and has failed on the pool.
     * @param {FailHandler} fail 
     * Function that executes when an insert command is fails execution on this context.
     */
    onInsertFail(fail) {
        this.#emitter.onInsertFail(fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever an Update command has been executed and has failed on the pool.
     * @param {FailHandler} fail 
     * Function that executes when an update command is fails execution on this context.
     */
    onUpdateFail(fail) {
        this.#emitter.onUpdateFail(fail);
    }

    /**
     * Adds a listener event to the Connection Pool associated with this context 
     * whenever a Delete command has been executed and has failed on the pool.
     * @param {FailHandler} fail 
     * Function that executes when a delete command is fails execution on this context.
     */
    onDeleteFail(fail) {
        this.#emitter.onDeleteFail(fail);
    }

    /**
     * Use this function to transfer the state of this context to a new context.
     * @param {(ctx: MyORMContext<TTableModel, any>) => void} callback 
     * Function that is called before the state is transferred over to the new context.  This should be used to initialize all new states.  
     * If something is overridden, then the new property will take precedence over the old property, overriding it.
     * @returns {any} 
     * The new `MyORMContext` with the most updated state.
     */
    #transfer(callback) {
        let ctx = new MyORMContext(this.#adapter, this.#realTableName, this.#options, this.#schema, this.#emitter);
        ctx.#promise = this.#promise.then(() => {
            //@ts-ignore Ignoring because TS doesn't know the types between the two contexts.
            ctx.#state = { ...this.#state };
            callback(ctx);
            ctx.#schema = this.#schema;
            //@ts-ignore Ignoring because TS doesn't know the types between the two contexts.
            ctx.#state = { ...this.#state, ...ctx.#state };
            ctx.#state.relationships = this.#state.relationships;
        });
        return ctx;
    }

    /**
     * Use this function to configure a relationship between two tables.
     * @param {Types.HasOneCallback<TTableModel>|Types.HasManyCallback<TTableModel>} relationshipCallback 
     * Used to configure the keys for the informal foreign relationship.
     * @param {"1:n"|"1:1"} relationshipType 
     * Type of relationship being configured
     */
    #configureRelationship(relationshipCallback, relationshipType, lastTableName = this.#realTableName, fullAliasName="") {
        const $andThatHasOne = (callback, lastTableName, aliasName) => {
            return this.#configureRelationship(callback, "1:1", lastTableName, aliasName);
        };
        const $andThatHasMany = (callback, lastTableName, aliasName) => {
            return this.#configureRelationship(callback, "1:n", lastTableName, aliasName);
        };
        const $to = (prop, joiningTableName, originalTableCol, joiningTableCol) => {
            this.#state.relationships[prop] = {
                thisTable: lastTableName,
                thatTable: joiningTableName,
                primaryKey: originalTableCol,
                foreignKey: joiningTableCol,
                type: relationshipType,
                schema: {}
            };
            this.#promise = this.#promise.then(async () => {
                const schema = await this.#describe(joiningTableName, `${fullAliasName}${fullAliasName != "" ? "<|" :""}${prop}`);
                this.#state.relationships[prop].schema = schema;
            });
            return {
                andThatHasOne: (callback) => $andThatHasOne(callback, joiningTableName, `${fullAliasName}${fullAliasName != "" ? "<|" : ""}${prop}`),
                andThatHasMany: (callback) => $andThatHasMany(callback, joiningTableName, `${fullAliasName}${fullAliasName != "" ? "<|" : ""}${prop}`)
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
     * Use this function to get all the data that was built using clause functions.
     * @param {string} table 
     * Name of the table to filter the where clauses on. (default: "",  or all conditions)
     */
    #getClauseData(table="") {
        let selects = [
            ...Object.values(this.#schema).map(o => `${o.Field} AS ${o.Alias}`),
            ...Object.keys(this.#state.relationships)
                .filter(rKey => this.#state.relationships[rKey].included)
                .flatMap(k => Object.values(this.#state.relationships[k].schema)
                    .map(o => `${o.Field} AS ${o.Alias}`))
        ];
        if (this.#state.groupBy) {
            selects = [...this.#state.groupBy.map(o => {
                const key = o.replace(/`/g, "");
                const splits = key.split(".");
                let table = null;
                if (splits.length > 1) {
                    if (splits[0] in this.#state.relationships) {
                        table = splits[0];
                    }
                }
                if (table) {
                    if (splits[1] in this.#state.relationships[table].schema) {
                        o = `${this.#state.relationships[table].schema[splits[1]].Field} AS ${this.#state.relationships[table].schema[splits[1]].Alias}`;
                    }
                } else {
                    if (key in this.#schema) {
                        o = `${this.#schema[key].Field} AS ${this.#schema[key].Alias}`;
                    }
                }
                return o;
            })];
        }
        let where = this.#state.where?.toString(table);
        let groupBy = this.#state.groupBy?.map(col => 
            col.includes(" AS ") // if it includes "AS" then it was an aggregate function, so then this won't be added to the group by clause.
                ? "" 
                : `${col}`
            ).filter(s => s != "");
        let orderBy = this.#state.sortBy;
        let limit = this.#state.limit;
        let offset = this.#state.offset;
        let includes = Object.values(this.#state.relationships)
            .filter(m => m.included)
            .map(ic => `\`${ic.thatTable}\` ON \`${ic.thisTable}\`.\`${ic.primaryKey}\`=\`${ic.thatTable}\`.\`${ic.foreignKey}\``)
        let from = [this.#realTableName, ...includes];
        return {
            selects,
            from,
            where,
            groupBy,
            orderBy,
            limit,
            offset,
            whereArgs: this.#state.where?.getArgs(table) ?? []
        }
    }

    /**
     * Returns a function to be used in a JavaScript `<Array>.map()` function that recursively maps relating records into a single record.
     * @param {any[]} records All records returned from a SQL query.
     * @param {any} record Record that is being worked on (this is handled recursively)
     * @param {string} prepend String to prepend onto the key for the original record's value.
     * @returns {(record: any) => TTableModel} Function for use in a JavaScript `<Array>.map()` function for use on an array of the records filtered to only uniques by main primary key.
     */
    #map(records, record=records[0], prepend="") {
        return r => {
            /** @type {any} */
            const mapping = {};
            const processedTables = new Set();
            for(const key in record) {
                if(key.startsWith("$")) {
                    mapping[key] = r[key];
                    continue;
                }
                const [table] = key.split("<|");
                if(processedTables.has(table)) continue;
                processedTables.add(table);
                if(table === key) {
                    mapping[key] = r[`${prepend}${key}`];
                } else {
                    const entries = Object.keys(record).map(k => k.startsWith(`${table}<|`) ? [k.replace(`${table}<|`, ""), {}] : [null, null]).filter(([k]) => k != null);
                    if (this.#state.relationships[table].type === "1:1") {
                        const map = this.#map(records, Object.fromEntries(entries), `${prepend}${table}<|`);
                        mapping[table] = map(r);
                    } else {
                        const pKey = this.#state.relationships[table].primaryKey;
                        const fKey = this.#state.relationships[table].foreignKey;
                        const map = this.#map(records, Object.fromEntries(entries), `${prepend}${table}<|`);
                        mapping[table] = records.filter(_r => r[pKey] === _r[`${prepend}${table}<|${fKey}`]).map(map);
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
        return this.#filterForUniqueRelatedRecords(records).map(map);
    }

    /**
     * Filters out duplicates of records that have the same primary key.
     * @param {any[]} records Records to filter.
     * @returns {any[]} A new array of records, where duplicates by primary key are filtered out. If no primary key is defined, then `records` is returned, untouched.
     */
    #filterForUniqueRelatedRecords(records) {
        const pKey = this.#getPrimaryKey();
        if(pKey === undefined) return records;
        const uniques = new Set();
        return records.filter(r => {
            if(uniques.has(r[pKey])) {
                return false;
            }
            uniques.add(r[pKey]);
            return true;
        });
    }

    /**
     * Applies the alias callback function (if it was provided) to the list of `records`.
     * @param {TAliasMap[]|TTableModel[]} records 
     * Records being aliased.
     * @returns {TAliasMap[]} 
     * Same records returned in their aliased state.
     */
    #alias(records) {
        // Apply the alias callback, if one was provided.
        if (this.#state.mapForward) {
            records = records.map(t => {
                const newProxy = o => new Proxy(o, {
                    get: (target, prop) => {
                        if (prop in this.#state.relationships) {
                            return newProxy(target[prop]);
                        }
                        return target[prop];
                    }
                });
                // @ts-ignore TypeScript is acting weird and saying this is possibly undefined...
                return this.#state.mapForward(newProxy(t));
            });
        }
        return /** @type {any} */ (records);
    }

    // Transactional functions-- These are functions that call the adapter to get results from the database.

    /**
     * Use this function to execute a query (for COUNT(*)) command against the Table this context represents.
     * @param {string} cmd 
     * Command to execute
     * @param {any[]} args 
     * Arguments to pass to avoid sql injections.
     * @returns {Promise<number>} 
     * Number of records (count) from the query.
     */
    async #count(cmd, args) {
        try {
            const result = await this.#adapter.handleCount(cmd, args);
            this.#emitter.emitQuerySuccess(this.#createEventDetail(cmd, args));
            return /** @type {any} */ (result);
        } catch (err) {
            const detail = this.#createEventDetail(cmd, args, err);
            this.#emitter.emitQueryFail(detail);
            throw new MyORMQueryError(`An error occurred when attempting to query from ${`${detail.schema}`}.`, err);
        }
    }

    /**
     * Use this function to execute a query command against the Table this context represents.
     * @param {string} cmd 
     * Command to execute
     * @param {any[]} args 
     * Arguments to pass to avoid sql injections.
     * @returns {Promise<TTableModel[]>} 
     * Array of objects of the type `TTableModel`.
     */
    async #query(cmd, args) {
        try {
            const result = await this.#adapter.handleQuery(cmd, args);
            this.#emitter.emitQuerySuccess(this.#createEventDetail(cmd, args));
            return /** @type {any} */ (result);
        } catch (err) {
            const detail = this.#createEventDetail(cmd, args, err);
            this.#emitter.emitQueryFail(detail);
            throw new MyORMQueryError(`An error occurred when attempting to query from ${`${detail.schema}`}.`, err);
        }
    }

    /**
     * Use this function to execute an insert command against the Table this context represents.
     * @param {string} cmd 
     * Command to execute
     * @param {any[]=} args 
     * Arguments to pass to avoid sql injections.
     * @returns {Promise<number[]>} 
     * The insertId of the first item inserted.
     */
    async #insert(cmd, args = undefined) {
        try {
            const result = await this.#adapter.handleInsert(cmd, args);
            this.#emitter.emitInsertSuccess(this.#createEventDetail(cmd, args));
            return result;
        } catch (err) {
            const detail = this.#createEventDetail(cmd, args, err);
            this.#emitter.emitInsertFail(detail);
            throw new MyORMInsertError(`An error occurred when attempting to insert into ${detail.schema}.`, err);
        }
    }

    /**
     * Use this function to execute an update command against the Table this context represents.
     * @param {string} cmd 
     * Command to execute
     * @param {any[]=} args 
     * Arguments to pass to avoid sql injections.
     * @returns {Promise<number>} 
     * Number of rows that were updated.
     */
    async #update(cmd, args = undefined) {
        try {
            const result = await this.#adapter.handleUpdate(cmd, args);
            this.#emitter.emitUpdateSuccess(this.#createEventDetail(cmd, args, undefined, result));
            return result;
        } catch (err) {
            const detail = this.#createEventDetail(cmd, args, err);
            this.#emitter.emitUpdateFail(detail);
            throw new MyORMUpdateError(`An error occurred when attempting to update ${detail.schema}.`, err);
        }
    }

    /**
     * Use this function to execute a delete command against the Table this context represents.
     * @param {string} cmd 
     * Delete command to execute
     * @param {any[]=} args 
     * Arguments to pass to avoid sql injections.
     * @returns {Promise<number>} 
     * Number of rows that were deleted.
     */
    async #delete(cmd, args = undefined) {
        try {
            const result = await this.#adapter.handleDelete(cmd, args);
            this.#emitter.emitDeleteSuccess(this.#createEventDetail(cmd, args, undefined, result));
            return result;
        } catch (err) {
            const detail = this.#createEventDetail(cmd, args, err);
            this.#emitter.emitDeleteFail(detail);
            throw new MyORMDeleteError(`An error occurred when attempting to delete from ${detail.schema}.`, err);
        }
    }

    /**
     * Use this function to execute a describe command against the Table this context represents.
     * @param {string} table 
     * Table to get the metadata of.
     * @returns {Promise<{[key: string]: Types.SchemaField}>}
     */
    async #describe(table, optionalPrependAlias="") {
        const describedTable = table == this.#realTableName ? "" : `${optionalPrependAlias != "" ? optionalPrependAlias : table}<|`;
        /** @type {{[key: string]: Types.SchemaField}} */
        let schema = {};
        const { cmd, args } = this.#adapter
            .onSerialization(
                this.#createAdapterToolsDetail(), 
                this.#createAdapterContextDetail()
            ).forDescribe({ table });
        const schemaFields = await this.#adapter.handleDescribe(cmd, args);
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
     * Use this function to get the primary key of the table. If no primary key exists, then `undefined` is returned.'
     * @param {string?} table
     * @returns {(keyof TTableModel & string)=} 
     * Some key in the table that is described as the primary key.
     */
    #getPrimaryKey(table=null) {
        if(table == null || table === this.#realTableName) {
            for(const key in this.#schema) {
                if(this.#schema[key].Key === "PRI") {
                    return key;
                }
            }
        } else {
            for (const key in this.#state.relationships[table]) {
                if (this.#state.relationships[table][key].Key === "PRI") {
                    return key;
                }
            }
        }
        return undefined;
    }

    /**
     * Use this function to check if `key` is an identity key. (The key auto increments in the database)
     * @param {(keyof TTableModel & string)=} key 
     * Some key in the table.
     * @returns {boolean} 
     * True if the key is an auto increment key. False if the key does not exist in the schema or does not have an `AUTO_INCREMENT` attribute.
     */
    #isIdentityKey(key) {
        if(key === undefined || !(key in this.#schema)) return false;
        return this.#schema[key].Extra === "auto_increment";
    }

    /**
     * Use this to create a detail to be passed into an emitted Event for end-user handling.  
     * This is to be passed into the `.on_Success()` or `.on_Fail()` functions.
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
    #createEventDetail(cmd, args, err=undefined, numRowsAffected=undefined) {
        let cmdRaw = cmd;
        if (!("eventHandling" in this.#adapter.options) || this.#adapter.options.eventHandling) {
            args?.forEach(a => cmdRaw = cmdRaw.replace("?", typeof a === "string" || a instanceof Date ? `'${a}'` : a));
        }

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
     * @returns {Types.OnSerializationTools<TTableModel>}
     * Object containing data that can be used throughout all serialization functions.
     */
    #createAdapterToolsDetail() {
        return { MyORMError: MyORMSyntaxError, Where, Schema: this.#schema, Relationships: this.#state.relationships };
    }

    /**
     * Use this function to get information as a detail about the command being executed.  
     * This is to be passed into the `<Adapter>.handle()` functions.
     * @param {boolean} isExplicit 
     * True if the command being executed is an explicit transaction (uses built clauses), otherwise false. (default: true)
     * @param {boolean} isCount 
     * True if the command being executed is "count", otherwise false. (default: false)
     * @returns {Types.CommandContext} 
     * Contextual data associated with the command so the adapter has extra information.
     */
    #createAdapterContextDetail(isExplicit = true, isCount = false) {
        const pKey = this.#getPrimaryKey();
        const cmdCtx = {
            mainTableName: this.#realTableName,
            primaryKey: pKey,
            isIdentityKey: this.#isIdentityKey(pKey),
            isCount,
            isExplicit, 
            hasOneToOne: Object.values(this.#state.relationships).filter(v => v.included && v.type == "1:1").length > 0,
            hasOneToMany: Object.values(this.#state.relationships).filter(v => v.included && v.type == "1:n").length > 0
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