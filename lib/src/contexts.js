//@ts-check
import { createPool } from "mysql2/promise";
import { MySqlContextDeleteError, MySqlContextInsertError, MySqlContextQueryError, MySqlContextSyntaxError, MySqlContextUpdateError } from './exceptions.js';
import { Where, WhereBuilder } from './where-builder.js';

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
     * @type {Partial<{[K in keyof OnlyAbstractModels<TTableModel>]: { included: boolean, name: string, primaryKey: keyof TTableModel, foreignKey: string, type: "1:1"|"1:n" }}>} 
     */ 
    _relationships = {};

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
    /** @protected @type {{ [key: string]: { Field: string; Type: string; Null: string; Key: string; Default: string; Extra: string; Alias: string; } }} */
    _schema;
    /** @protected @type {Promise[]} */
    _describing = [];

    // SYNONYMS

    map = this.alias;

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
     * @param {{ [key: string]: { Field: string; Type: string; Null: string; Key: string; Default: string; Extra: string; Alias: string; } }=} schema
     */
    constructor(configOrPool, realTableName, identityKey=null, options = {}, schema = undefined) {
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

        // get the schema from the database.
        if(schema) {
            this._schema = schema;
        } else {
            this._describe(realTableName, schema => this._schema = schema);
        }
    }

    /**
     * @param {HasManyCallback<TTableModel>} relationshipCallback Used to configure the keys for the informal foreign relationship.
     */
    async hasMany(relationshipCallback) {
        await this._configureRelationship(relationshipCallback, "1:n");
    }

    /**
     * @param {HasOneCallback<TTableModel>} relationshipCallback Used to configure the keys for the informal foreign relationship.
     */
    async hasOne(relationshipCallback) {
        await this._configureRelationship(relationshipCallback, "1:1");
    }

    /**
     * Specifies that your next Query will also pull in the specified related Record from the database.  
     * In order for your related record to be properly included, there needs to be a relationship configured using the `.hasOne` or `.hasMany` function.
     * @template {keyof OnlyAbstractModelTypes<TTableModel>} TSelectedKey
     * @template {OnlyAbstractModelTypes<TTableModel>} [TAugmentedType=OnlyAbstractModelTypes<TTableModel>]
     * @param {(model: {[K in keyof OnlyAbstractModelTypes<Required<TTableModel>>]: ThenIncludeObject<Required<TTableModel>[K] extends (infer TType)[] ? Required<TType> : Required<TTableModel>[K]>}) => void} modelCallback Callback where the argument, `model`, only has properties of non-primitive types to provide clarity to what sub-type (or table) should be included (or joined on).
     * @returns {MyORMContext<TTableModel, TAliasMap & Pick<Required<TAugmentedType>, TSelectedKey>>}
     */
    include(modelCallback) {
        const newProxy = () => new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => {
                if(p in this._relationships) {
                    this._relationships[p].included = true;
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
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options, this._schema);
        this._transferToNewContext(ctx);
        return ctx;
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
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options, this._schema);
        this._transferToNewContext(ctx);
        
        return ctx;
    }

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
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options, this._schema);
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
                if (p in this._relationships) {
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
            const config = this._relationships[ia];
            if (config === undefined) throw new MySqlContextSyntaxError(`You must configure a relationship in order to use ".include" on ${ia}`);
            config.included = true;
            toDelete = [...toDelete, ia];
            this._relationships[entries[i][0]] = config;
        }

        for (const del of toDelete) {
            delete this._relationships[del];
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
        /** 
         * @param {string?} incConfigKey
         * @returns {Required<TAugmentedType>} 
         */
        const newProxy = (incConfigKey=null) => new Proxy(/** @type {any} */({}), {
            get: (t, p, r) => {
                if (p in this._relationships) {
                    if(incConfigKey) {
                        return newProxy(`${incConfigKey}${String(p)}.`);
                    }
                    return newProxy(`${String(p)}.`);
                }
                if(incConfigKey) {
                    return `${incConfigKey}${String(p)}`;
                }
                return String(p);
            }
        });


        let aliases = aliasModelCallback(newProxy());
        
        const recurseForEach = (o, k) => {
            if(Array.isArray(o[k])) {
                return Object.keys(o[k][0]).forEach(_k => recurseForEach(o[k][0], _k));
            }
            if(typeof(o[k]) === "object") {
                
                return Object.keys(o[k]).forEach(_k => recurseForEach(o[k], _k));
            }
            const reResult = /([a-zA-Z\$_][a-zA-Z0-9\$_]*)/.exec(o[k]);
            if (!reResult) throw Error('Something went wrong when aliasing.');
            if(reResult[1] in this._relationships) {
                this._relationships[reResult[1]].Alias = k;
            }
        } 

        Object.keys(aliases).forEach(k => recurseForEach(aliases, k));
        
        // turn one-to-many (array) aliased keys to the original object.
        for(const key in aliases) {
            aliases[key] = Array.isArray(aliases[key]) ? aliases[key][0] : aliases[key];
        }
        const entries = Object.entries(aliases);
        let toDelete = [];
        for(let i = 0; i < includedAliases.length; ++i) {
            const ia = includedAliases[i];
            if(ia == null) continue;
            const config = this._relationships[ia];
            if(config === undefined) throw new MySqlContextSyntaxError(`You must configure a relationship in order to use ".include" on ${ia}`);
            config.included = true;
            toDelete = [...toDelete, ia];
            this._relationships[entries[i][0]] = config;
        }

        for(const del of toDelete) {
            delete this._relationships[del];
        }

        /** @type {MyORMContext<TTableModel, TAliasedType>} */
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options, this._schema);
        this._transferToNewContext(/** @type {any} */(ctx));
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
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options, this._schema);
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
        const ctx = new MyORMContext(this._pool, this._realTableName, this._identityKey, this._options, this._schema);
        this._transferToNewContext(ctx);
        ctx._limit = limit;
        return ctx;
    }

    /**
     * Turns this context into a view, so all of the previously built aliases and clauses will remain.
     * @returns {this}
     */
    asView() {
        this._isView = true;
        this._view = {
            where: this._where,
            aliases: this._aliases,
            sortBy: this._sortByKeys,
            isGrouped: this._grouped,
            limit: this._limit,
            offset: this._offset,
            includes: JSON.parse(JSON.stringify(this._relationships))
        };
        return this;
    }

    view = this.asView;

    /**
     * Executes a `SELECT` query on the built context.
     * @returns {Promise<(TAliasMap)[]>} List of the returned records from the built query.
     */
    async select() {
        let selects = [
            ...Object.values(this._schema).map(o => `${o.Field} AS ${o.Alias}`),
            ...Object.keys(this._relationships)
                .filter(rKey => this._relationships[rKey].included)
                .flatMap(k => Object.values(this._relationships[k].schema)
                    .map(o => `${o.Field} AS ${o.Alias}`))
        ];
        let thisTable = `\`${this._realTableName}\``;
        let groups = [];
        const where = this._where?.toString() ?? "";
        const groupBy = groups.length > 0 ? `\n\tGROUP BY ${groups.join('\n\t\t,')}` : "";
        const orderBy = this._sortByKeys.length > 0 ? `\n\tORDER BY ${this._sortByKeys.map(o => `${String(o.column)} ${o.direction}`).join('\n\t\t,')}` : "";
        let limit = this._limit != null ? "\n\tLIMIT ?" : "";
        let offset = this._offset != null ? "\n\tOFFSET ?" : "";

        let args = [];
        // If any 1:n relationships are involved, then we need to use a sub query, so we get our data properly
        if (Object.values(this._relationships).filter(v => v.included && v.type == "1:n").length > 0 && this._limit != null) {
            thisTable = `(SELECT * FROM ${thisTable} ${limit} ${offset}) AS ${thisTable}`;
            limit = offset = "";
            args = [this._limit];
            if(this._offset) {
                args = [...args, this._offset];
            }
        }
        const from = [thisTable, ...Object.values(this._relationships).filter(ic => ic.included).map(ic => `\`${ic.thatTable}\` ON \`${ic.thisTable}\`.\`${ic.primaryKey}\`=\`${ic.thatTable}\`.\`${ic.foreignKey}\``)].join('\n\t\tLEFT JOIN ');
        const cmd = `SELECT ${selects.join('\n\t\t,')}`
            + `\n\tFROM ${from}`
            + ` ${where}`
            + ` ${groupBy}`
            + ` ${orderBy}`
            + ` ${limit}`
            + ` ${offset}`;
        args = [...args, ...this._where != null ? this._where.getArgs() : []];
        if (limit != "") {
            args = [...args, this._limit];
        }
        if (offset != "") {
            args = [...args, this._offset]
        }
        let ts = await this._query(cmd, args);
        
        if(ts.length > 0) {
            let mappingObject = {};
            for(const key in ts[0]) {
                const splits = key.split("_");
                mappingObject = this._createMappedObject(mappingObject, splits);
            }
            const primaryKey = Object.keys(this._schema).filter(k => this._schema[k].Key === "PRI")[0];
            const resultsFiltered = ts.filter((t,n,self) => n === self.findIndex(_t => _t[primaryKey] === t[primaryKey]));
            const results = resultsFiltered.map(t => this._mapResults(t, ts, /** @type {{[K in keyof TAliasMap]: string|object|((record: any, allRecords: any[]) => any[])}} */(mappingObject)));
            return /** @type {any} */ (results);
        }

        return /** @type {any} */ (ts);
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
    _createMappedObject(object, splits, index=0, prepend='') {
        const deserializedKey = prepend + splits.join('_');
        if(index > splits.length-1) {
            return object;
        }
        if(index == splits.length-1) {
            return { 
                ...object, 
                [splits[index]]: deserializedKey
            };
        }
        // If the current split index points to an existing included relationship
        if(splits[index] in this._relationships && this._relationships[splits[index]].type === "1:n" && this._relationships[splits[index]].included) {
            // then we actually set the mapping object's property value to a function that will map results to a different mapping object.
            //   that mapping object will be created from the remaining keys that have not been worked on.
            const f = (record, allRecords) => {
                // get the primary and foreign keys in their unserialized form.
                const pKey = [...splits.slice(0, index), this._relationships[splits[index]].primaryKey].join('_');
                const fKey = [...splits.slice(0, index+1), this._relationships[splits[index]].foreignKey].join('_');
                const relatedRecords = allRecords.filter(r => record[pKey] === r[fKey]);
                return relatedRecords.map(r => {
                    let mappingObject = {};
                    for (const key in r) {
                        // If it does not start with the relation specified by the splits, then skip.
                        if(!key.startsWith(splits.slice(0, index+1).join('_'))) continue;
                        const _splits = key.split("_");
                        mappingObject = this._createMappedObject(mappingObject, _splits.slice(index+1), 0, _splits.slice(0, index+1).join('_') + '_');
                    }
                    return this._mapResults(r, allRecords, /** @type {{[K in keyof TAliasMap]: string|object|((record: any, allRecords: any[]) => any[])}} */ (mappingObject));
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
    _mapResults(record, allRecords, mappingObject, mappingKeys=Object.keys(mappingObject), currentKeyIdx=0) {
        if(currentKeyIdx >= mappingKeys.length) return undefined;
        const currentKey = mappingKeys[currentKeyIdx];
        if(typeof(mappingObject[currentKey]) === "string") {
            // is a direct map
            return { [currentKey]: record[mappingObject[currentKey]], ...this._mapResults(record, allRecords, mappingObject, mappingKeys, currentKeyIdx+1) };
        }
        if(typeof(mappingObject[currentKey]) === "function") {
            // is a 1:n relationship
            return { 
                [currentKey]: mappingObject[currentKey](record, allRecords),
                ...this._mapResults(record, allRecords, mappingObject, mappingKeys, currentKeyIdx + 1)
            };
        }
        // is a 1:1 relationship
        return { 
            [currentKey]: this._mapResults(record, allRecords, mappingObject[currentKey]), 
            ...this._mapResults(record, allRecords, mappingObject, mappingKeys, currentKeyIdx+1) 
        };
    }

    /**
     * Gets the total number of records that are stored in the Table this context represents.
     * @returns {Promise<number>} Number specifying the total count of all records that were queried from this command.
     */
    async count() {
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
        ctx._relationships = JSON.parse(JSON.stringify(this._relationships));

        this._where = null;
        this._aliases = undefined;
        this._limit = undefined;
        this._offset = undefined;
        this._grouped = false;
        this._sortByKeys = [];
        this._describing = [];
        Object.keys(this._relationships).map(ic => this._relationships[ic].included = false);

        if(this._isView) {
            this._where = this._view.where;
            this._aliases = this._view.aliases;
            this._limit = this._view.limit;
            this._offset = this._view.offset;
            this._grouped = this._view.isGrouped;
            this._sortByKeys = this._view.sortBy;
            this._relationships = JSON.parse(JSON.stringify(this._view.includes));
        }
    }

    /**
     * Recursively configures an informal relationship, as well as nested relationships specified by `relationshipType` using `relationshipCallback`.
     * @private
     * @param {HasOneCallback<TTableModel>|HasManyCallback<TTableModel>} relationshipCallback Used to configure the keys for the informal foreign relationship.
     * @param {"1:n"|"1:1"} relationshipType
     * @param {string} lastTableName
     */
    async _configureRelationship(relationshipCallback, relationshipType, lastTableName = this._realTableName) {
        this.__configureRelationship(relationshipCallback, relationshipType, lastTableName);
        await Promise.all(this._describing);
    }

    /**
     * Recursively configures an informal relationship, as well as nested relationships specified by `relationshipType` using `relationshipCallback`.
     * @private
     * @param {HasOneCallback<TTableModel>|HasManyCallback<TTableModel>} relationshipCallback Used to configure the keys for the informal foreign relationship.
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
            this._describing = [...this._describing, this._describe(joiningTableName, schema => {
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
                withPrimary: (thatColumnName) => $with(prop, realTableName, thatColumnName)
            };
        };
        const newProxy = () => new Proxy(/** @type {any} */({}), {
            get: (t, p) => {
                return {
                    from: (realTableName) => $from(p, realTableName),
                    withPrimary: (joiningTableCol) => $with(p, p, joiningTableCol)
                };
            }
        });
        relationshipCallback(newProxy());
        return {
            andThatHasOne: (callback) => $andThatHasOne(callback, lastTableName),
            andThatHasMany: (callback) => $andThatHasMany(callback, lastTableName)
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

/** 
 * Returns a type, derived from `T`, where `V` is not in `T`. 
 * @template T Type to filter out keys.
 * @template V Value types to filter out from `T`.
 * @template [WithNevers= {[K in keyof T]: Exclude<T[K], undefined> extends V ? never: (T[K] extends Record<string, unknown> ? Without<T[K], V> : T[K])}]
 * @typedef {Pick<WithNevers, {[K in keyof WithNevers]: WithNevers[K] extends never ? never : K}[keyof WithNevers]>} Without
 */

/** 
 * Essentially a regular object, but only with string keys, used as a general representation of the Table being worked with.
 * @typedef {{[key: string]: any}} AbstractModel 
 */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel`s.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof Required<T> as T[K] extends AbstractModel|undefined ? K : never]: Required<T[K]>}} OnlyAbstractModels
 */

/**
 * Filters out an object model type to only have keys that are valued with `AbstractModel` arrays.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof Required<T> as T[K] extends AbstractModel[]|undefined ? K : never]: T[K] extends (infer R extends AbstractModel)[]|undefined ? Required<R> : never}} OnlyAbstractModelArrays
 */

/** 
 * Filters out an object model type to only have keys that are valued with `AbstractModel` or `AbstractModel` arrays.
 * @template {AbstractModel} T The abstract model to check properties for recursive `AbstractModel`s.
 * @typedef {{[K in keyof (OnlyAbstractModels<T> & OnlyAbstractModelArrays<T>)]: (OnlyAbstractModels<T> & OnlyAbstractModelArrays<T>)[K]}} OnlyAbstractModelTypes
 */

/**
 * Removes all keys where the value in `T` for that key is of type `AbstractModel` or `AbstractModel[]`
 * @template {AbstractModel} T
 * @typedef {Exclude<T, OnlyAbstractModelTypes<T>>} OnlyNonAbstractModels
 */

/**
 * Callback definition for the `from` function to help configure the Table name for an informal foreign relationship between two tables using `.include()`.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipFrom
 * @param {string} realTableName The real table name for the foreign table being configured.
 * @returns {{withPrimary: RelationshipWith<TFrom, TTo>}} Chaining function `with` to further configure the relationship.
 */

/**
 * Callback definition for the `with` function to help configure the foreign key for the `TFrom` table.
 * @template {AbstractModel} TFrom Model object type that represents the table configuring the informal foreign relationship.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipWith
 * @param {keyof TFrom} thisColumnName Some column from `TFrom` that represents the informal foreign relationship to `TTo`.
 * @returns {{withForeign: RelationshipTo<TTo>}} Chaining function `to` to further configure the relationship.
 */

/**
 * Callback definition for the `to` function to help configure the foreign key for the `TTo` table.
 * @template {AbstractModel|AbstractModel[]} TTo Model object type that represents the table that is being configured to an informal foreign relationship.
 * @callback RelationshipTo
 * @param {TTo extends undefined ? never : keyof TTo} thatColumnName Some column from `TTo` that represents the informal foreign key pair to the previous `.with` function.
 * @returns {AndThatHasCallbacks<TTo extends (infer T extends AbstractModel)[] ? T : TTo>} Further `andThatHas_` callbacks to configure nested relationships.
 */

/**
 * Object that contains callbacks for configuring nested relationships with `TTableModel`.
 * @template {AbstractModel|AbstractModel[]} TTableModel Original `AbstractModel` table that just configured a relationship and may need configuration of cascaded relationships.
 * @typedef {object} AndThatHasCallbacks
 * @prop {(modelCallback: HasOneCallback<TTableModel>) => AndThatHasCallbacks<TTableModel>} andThatHasOne Configures a cascaded one-to-one relationship with some `AbstractModel` in `TTableModel`.
 * @prop {(modelCallback: HasManyCallback<TTableModel>) => AndThatHasCallbacks<TTableModel>} andThatHasMany Configures a cascaded one-to-many relationship with some `AbstractModel` in `TTableModel`.
*/

/**
 * Callback used for configuring a one-to-one relationship.
 * @template {AbstractModel} TTableModel
 * @callback HasOneCallback
 * @param {{[K in keyof Required<OnlyAbstractModels<TTableModel>>]: HasOneCallbackConfig<Required<TTableModel>, K>}} model Model that has `AbstractModel` types to configure a one-to-one relationship with `TTableModel`
 * @returns {void} 
 */

/**
 * Callback used for configuring a one-to-many relationship.
 * @template {AbstractModel} TTableModel
 * @callback HasManyCallback
 * @param {{[K in keyof Required<OnlyAbstractModelArrays<TTableModel>>]: HasManyCallbackConfig<Required<TTableModel>, K>}} model Model that has `AbstractModel[]` types to configure a one-to-many relationship with `TTableModel`
 * @returns {void} 
 */

/**
 * Object that contains callbacks for further configuring specific details about a one-to-one relationship.
 * @template {AbstractModel} TTableModel Table model object that is configuring a one-to-one relationship to.
 * @template {keyof OnlyAbstractModels<TTableModel>} Key Key of `TTableModel` where the value for `TTableModel[Key]` is of `AbstractModel` to configure the one-to-one relationship with.
 * @typedef {object} HasOneCallbackConfig
 * @prop {RelationshipFrom<TTableModel, OnlyAbstractModels<TTableModel>[Key]>} from Configures the real table name that this relationship is from.
 * @prop {RelationshipWith<TTableModel, OnlyAbstractModels<TTableModel>[Key]>} withPrimary Configures the key to use in this relationship from `TTableModel`
 */

/**
 * Object that contains callbacks for further configuring specific details about a one-to-many relationship.
 * @template {AbstractModel} TTableModel Table model object that is configuring a one-to-many relationship to.
 * @template {keyof OnlyAbstractModelArrays<TTableModel>} Key Key of `TTableModel` where the value for `TTableModel[Key]` is of `AbstractModel[]` to configure the one-to-many relationship with.
 * @typedef {object} HasManyCallbackConfig
 * @prop {RelationshipFrom<TTableModel, OnlyAbstractModelArrays<TTableModel>[Key]>} from Configures the real table name that this relationship is from.
 * @prop {RelationshipWith<TTableModel, OnlyAbstractModelArrays<TTableModel>[Key]>} withPrimary Configures the key to use in this relationship from `TTableModel`
 */

/**
 * Object that has a `.thenInclude` function which will include another relationship from `TTableModel` into the next `MyORMContext` command that is sent.
 * @template {AbstractModel} TTableModel Table model object that possibly table relationships.
 * @typedef {object} ThenIncludeObject
 * @prop {(modelCallback: (model: {[K in keyof Required<OnlyAbstractModelTypes<TTableModel>>]: ThenIncludeObject<Required<OnlyAbstractModelTypes<TTableModel>>[K]>}) => void) => ThenIncludeObject<TTableModel>} thenInclude Callback to execute when including a nested table from another inclusion into the context.
 */

/**
 * @template {AbstractModel} T
 * @typedef {T extends null|undefined ? never : T} NonNullableAbstractModel
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
 * @property {import('mysql2').QueryError} error Error thrown by mysql2
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

// group by aggregate functions (@TODO needs documentation)

/**
 * @template {AbstractModel} TModel
 * @typedef {Object} Aggregates
 * @prop {() => number} count
 * @prop {(modelCallback: (model: {[K in keyof TModel]: string}) => string) => number} avg
 * @prop {(modelCallback: (model: {[K in keyof TModel]: string}) => string) => number} sum
 * @prop {(modelCallback: (model: {[K in keyof TModel]: string}) => string) => number} max
 * @prop {(modelCallback: (model: {[K in keyof TModel]: string}) => string) => number} min
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
 * @prop {Partial<{[K in keyof OnlyAbstractModels<TTableModel>]: { included: boolean, name: string, primaryKey: keyof TTableModel, foreignKey: string, type: "1:1"|"1:n" }}>=} includes
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


const EVENT_TABLE_CONTEXT_QUERY = 'table-context-query';
const EVENT_TABLE_CONTEXT_QUERY_FAILED = 'table-context-query-failed';
const EVENT_TABLE_CONTEXT_INSERT = 'table-context-insert';
const EVENT_TABLE_CONTEXT_INSERT_FAILED = 'table-context-insert-failed';
const EVENT_TABLE_CONTEXT_UPDATE = 'table-context-update';
const EVENT_TABLE_CONTEXT_UPDATE_FAILED = 'table-context-update-failed';
const EVENT_TABLE_CONTEXT_DELETE = 'table-context-delete';
const EVENT_TABLE_CONTEXT_DELETE_FAILED = 'table-context-delete-failed';