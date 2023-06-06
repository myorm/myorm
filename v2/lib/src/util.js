export function serialize(records, table, schema, relationships, isGroupBy) {

}

export function deepCopy(o) {
    return JSON.parse(JSON.stringify(o));
}

function rec_Serialize(records, isGroupBy, rec=records[0], prepend="") {
    return (r) => {
        /** @type {any} */
        const mapping = {};
        const processedTables = new Set();
        for (const key in record) {
            if (key.startsWith("$")) {
                mapping[key] = r[key];
                continue;
            }
            const [table] = key.split(ALIAS_TABLE_SEPARATOR);
            if (processedTables.has(table)) continue;
            processedTables.add(table);
            if (table === key) {
                if (r[`${prepend}${key}`] != null || prepend == '') {
                    mapping[key] = r[`${prepend}${key}`];
                }
            } else {
                const entries = Object.keys(record).map(k => k.startsWith(`${table}${ALIAS_TABLE_SEPARATOR}`) ? [k.replace(`${table}${ALIAS_TABLE_SEPARATOR}`, ""), {}] : [null, null]).filter(([k]) => k != null);
                const map = rec_Serialize(records, Object.fromEntries(entries), `${prepend}${table}${ALIAS_TABLE_SEPARATOR}`);
                if (relationships[table].type === "1:1" || isGroupBy) {
                    r = map(r);
                    mapping[table] = Object.keys(r).length <= 0 ? null : r;
                } else {
                    const pKey = relationships[table].primaryKey;
                    const fKey = relationships[table].foreignKey;
                    mapping[table] = filterForUniqueRelatedRecords(records.filter(_r => r[`${prepend}${pKey}`] === _r[`${prepend}${table}${ALIAS_TABLE_SEPARATOR}${fKey}`]), table, `${prepend}${table}${ALIAS_TABLE_SEPARATOR}`).map(map);
                }
            }
        }

        return mapping;
    }
}

function filterForUniqueRelatedRecords(records, table, prepend = '') {
    let pKey = getPrimaryKey(table);
    if (pKey === undefined) return records;
    pKey = prepend + pKey;
    const uniques = new Set();
    return records.filter(r => {
        if (uniques.has(r[pKey])) {
            return false;
        }
        uniques.add(r[pKey]);
        return true;
    });
}

function getPrimaryKey(schema) {
    for (const key in schema) {
        if (schema[key].Key === "PRI") {
            return key;
        }
    }
    return undefined;
}

/** @typedef {typeof count} AggrCountCallback */
/** @typedef {typeof avg} AggrAvgCallback */
/** @typedef {typeof sum} AggrSumCallback */
/** @typedef {typeof min} AggrMinCallback */
/** @typedef {typeof max} AggrMaxCallback */

/**
 * Creates an aggregated column for the count of distinct rows of some column, `col`, passed in.
 * @template {Types.AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$count_${K & string}`}
 * The new property key that will exist in all records queried.
 */
export function count(col) {
    return /** @type {any} */ (`COUNT(DISTINCT ${String(col).replace(/`/g, "")}) AS \`$count${ALIAS_AGGREGATE_SEPARATOR}${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the average of some column, `col`, passed in.
 * @template {Types.AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$avg_${K & string}`}
 * The new property key that will exist in all records queried.
 */
export function avg(col) {
    return /** @type {any} */ (`AVG(${String(col).replace(/`/g, "")}) AS \`$avg${ALIAS_AGGREGATE_SEPARATOR}${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the maximum of some column, `col`, passed in.
 * @template {Types.AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$max_${K & string}`}
 * The new property key that will exist in all records queried.
 */
export function max(col) {
    return /** @type {any} */ (`MAX(${String(col).replace(/`/g, "")}) AS \`$max${ALIAS_AGGREGATE_SEPARATOR}${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the minimum of some column, `col`, passed in.
 * @template {Types.AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$min_${K & string}`}
 * The new property key that will exist in all records queried.
 */
export function min(col) {
    return /** @type {any} */ (`MIN(${String(col).replace(/`/g, "")}) AS \`$min${ALIAS_AGGREGATE_SEPARATOR}${String(col).replace(/`/g, "")}\``);
}

/**
 * Creates an aggregated column for the sum of some column, `col`, passed in.
 * @template {Types.AbstractModel} T
 * Model representation of the table the context represents.
 * @template {keyof T} K
 * Key's name being worked on in this aggregate. (inferred from `col`)
 * @param {K} col
 * Name of the column being worked on in this aggregate.
 * @returns {`$sum_${K & string}`}
 * The new property key that will exist in all records queried.
 */
export function sum(col) {
    return /** @type {any} */ (`SUM(${String(col).replace(/`/g, "")}) AS \`$sum${ALIAS_AGGREGATE_SEPARATOR}${String(col).replace(/`/g, "")}\``);
}