//@ts-check

import { testTableCtx, testTableIdentCtx } from "./test.js";
import assert from "assert";

async function test1() {
    console.log("Testing [INSERT INTO TestTable (StringCol) VALUES ('Test 1')]");
    const [rec] = await testTableCtx.insert({
        StringCol: 'Test 1'
    });

    const recs = await testTableCtx.select();
    assert(recs.length == 1 && rec.StringCol == recs[0].StringCol);
}

async function test2() {
    console.log("Testing [INSERT INTO TestTable (StringCol, BigIntCol) VALUES ('Test 2', 20001)]");
    const [rec] = await testTableCtx.insert({
        StringCol: 'Test 2',
        BigIntCol: 20001
    });
    const recs = await testTableCtx.sortBy(m => m.BigIntCol).select();
    console.log({recs});
    assert(recs.length == 2 && rec.StringCol == recs[1].StringCol);
}

async function test3() {
    console.log("Testing [INSERT INTO TestTable (StringCol, BigIntCol, BoolCol) VALUES ('Test 3', 20002, null), ('Test 4', 20003, true), ('Test 5', 20004, false), ('Test 6', null, true)]");
    const recs = await testTableCtx.insert([{
        StringCol: 'Test 3',
        BigIntCol: 20002
    }, {
        StringCol: 'Test 4',
        BigIntCol: 20003,
        BoolCol: true
    }, {
        StringCol: 'Test 5',
        BigIntCol: 20004,
        BoolCol: false
    }, {
        StringCol: 'Test 6',
        BoolCol: true
    }]);

    const _recs = await testTableCtx.sortBy(m => m.BigIntCol).select();
    assert(_recs.length == 6 && _recs.filter(r => recs.map(rec => rec.StringCol).includes(r.StringCol)));
}

async function test4() {
    console.log("Testing [INSERT INTO TestTableIdentity (StringCol) VALUES ('Test 1')]");
    const [rec] = await testTableIdentCtx.insert({
        StringCol: 'Test 1'
    });

    const recs = await testTableIdentCtx.select();
    assert(recs.length == 1 && rec.Id == 1);
}

async function test5() {
    console.log("Testing [INSERT INTO TestTableIdentity (StringCol, BigIntCol) VALUES ('Test 2', 20001)]");
    const [rec] = await testTableIdentCtx.insert({
        StringCol: 'Test 2',
        BigIntCol: 20001
    });

    const recs = await testTableIdentCtx.sortBy(m => m.BigIntCol).select();
    assert(recs.length == 2 && rec.Id == 2);
}

async function test6() {
    console.log("Testing [INSERT INTO TestTableIdentity (StringCol, BigIntCol, BoolCol) VALUES ('Test 3', 20002, null), ('Test 4', 20003, true), ('Test 5', 20004, false), ('Test 6', null, true)]");
    const recs = await testTableIdentCtx.insert([{
        StringCol: 'Test 3',
        BigIntCol: 20002
    }, {
        StringCol: 'Test 4',
        BigIntCol: 20003,
        BoolCol: true
    }, {
        StringCol: 'Test 5',
        BigIntCol: 20004,
        BoolCol: false
    }, {
        StringCol: 'Test 6',
        BoolCol: true
    }]);

    assert(recs.map(r => r.Id).filter(id => [3, 4, 5, 6].includes(id ?? 0)));
}

export async function testInserts() {
    console.log(`Testing inserts...`);
    await test1();
    await test2();
    await test3();
    await test4();
    await test5();
    await test6();
    console.log(`Insert tests passed.`);
}