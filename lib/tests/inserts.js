//@ts-check

import { messageCtx, testTableCtx, testTableIdentCtx, triangleCtx } from "./test.js";
import assert from "assert";

async function test1() {
    console.log("Testing insert for table with no primary key. (only required columns)");
    const [rec] = await testTableCtx.insert({
        StringCol: 'Test 1'
    });

    const recs = await testTableCtx.select();
    assert(recs.length == 1 && rec.StringCol == recs[0].StringCol);
}

async function test2() {
    console.log("Testing insert for table with no primary key. (mix of required and optional columns)");
    const [rec] = await testTableCtx.insert({
        StringCol: 'Test 2',
        BigIntCol: 20001
    });
    const recs = await testTableCtx.sortBy(m => m.BigIntCol).select();
    console.log({recs});
    assert(recs.length == 2 && rec.StringCol == recs[1].StringCol);
}

async function test3() {
    console.log("Testing insert for table with no primary key. (mix of required and optional columns in a blend of different records)");
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
    console.log("Testing insert for table with primary key. (only required columns)");
    const [rec] = await testTableIdentCtx.insert({
        StringCol: 'Test 1'
    });

    const recs = await testTableIdentCtx.select();
    assert(recs.length == 1 && rec.Id == 1);
}

async function test5() {
    console.log("Testing insert for table with primary key. (mix of required and optional columns)");
    const [rec] = await testTableIdentCtx.insert({
        StringCol: 'Test 2',
        BigIntCol: 20001
    });

    const recs = await testTableIdentCtx.sortBy(m => m.BigIntCol).select();
    assert(recs.length == 2 && rec.Id == 2);
}

async function test6() {
    console.log("Testing insert for table with primary key. (mix of required and optional columns in a blend of different records)");
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

async function test7() {
    console.log("Testing insert into table with defaulted columns.");
    const recs = await messageCtx.insert([
        { },
        { },
    ]);
    console.log({recs});
    assert(recs[0].Content === "hello!" && recs[1].Content === "hello!");
    assert(!recs[0].IsAcknowledged && !recs[1].IsAcknowledged);
}

async function test8() {
    console.log("Testing insert into table with defaulted columns, overridden by user.");
    const recs = await messageCtx.insert([
        { Content: "this was overridden by user" },
        { Type: 1 },
        { IsAcknowledged: true }
    ]);

    assert(recs[0].Content === "this was overridden by user" && recs[1].Content === "hello!" && recs[2].Content === "hello!");
    assert(recs[0].Type === 0 && recs[1].Type === 1 && recs[2].Type === 0);
    assert(!recs[0].IsAcknowledged && !recs[1].IsAcknowledged && recs[2].IsAcknowledged);
}

async function test9() {
    console.log("Testing insert into table with defaulted columns, overridden by user. (mix of all)");
    const recs = await messageCtx.insert([
        { Content: "this was overridden by user", Type: 22, IsAcknowledged: false },
        { Type: 1, IsAcknowledged: true },
        { }
    ]);

    assert(recs[0].Content === "this was overridden by user" && recs[1].Content === "hello!" && recs[2].Content === "hello!");
    assert(recs[0].Type === 22 && recs[1].Type === 1 && recs[2].Type === 0);
    assert(!recs[0].IsAcknowledged && recs[1].IsAcknowledged && !recs[2].IsAcknowledged);
}

async function test10() {
    console.log("Testing insert into table with virtual columns.");
    const recs = await triangleCtx.insert([
        { EdgeA: 1, EdgeB: 2 },
        { EdgeA: 3, EdgeB: 4 },
        { EdgeA: 5, EdgeB: 6 },
    ]);

    assert(recs[0].EdgeC === Math.sqrt(Math.pow(1, 2) + Math.pow(2, 2)) && recs[1].EdgeC == Math.sqrt(Math.pow(3, 2) + Math.pow(4, 2)) && Math.sqrt(Math.pow(5, 2) + Math.pow(6, 2)));
}

export async function testInserts() {
    console.log(`Testing inserts...`);
    await test1();
    await test2();
    await test3();
    await test4();
    await test5();
    await test6();
    await test7();
    await test8();
    await test9();
    await test10();
    console.log(`Insert tests passed.`);
}