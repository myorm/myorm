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