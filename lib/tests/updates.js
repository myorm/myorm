//@ts-check

import { testTableCtx, testTableIdentCtx } from "./test.js";
import assert from "assert";

async function test1() {
    console.log("Testing [UPDATE TestTable SET BigIntCol=20000 WHERE StringCol = 'Test 1']");
    const numRowsAffected = await testTableCtx
        .where(m => m.StringCol.equals("Test 1"))
        .update(m => ({
            BigIntCol: 20000
        }));
    
    const [rec] = await testTableCtx
        .where(m => m.StringCol.equals("Test 1"))
        .select();
    console.log({numRowsAffected, rec});
    assert(numRowsAffected == 1 && rec.StringCol == "Test 1" && rec.BigIntCol == 20000);
}

async function test2() {
    console.log("Testing [UPDATE TestTableIdentity SET BoolCol = (CASE WHEN Id = 1 THEN true)]");
    const [rec] = await testTableIdentCtx.where(m => m.Id.eq(1)).select();
    rec.BoolCol = true;
    const numRowsAffected = await testTableIdentCtx.update(rec)

    const [_rec] = await testTableIdentCtx
        .where(m => m.StringCol.equals("Test 1"))
        .select();
    console.log(_rec);
    assert(numRowsAffected == 1 && _rec.StringCol == "Test 1" && _rec.BoolCol);
}

async function test3() {
    console.log("Testing [UPDATE TestTable SET BigIntCol=30000, BoolCol=true WHERE StringCol = 'Test 2']");
    const numRowsAffected = await testTableCtx
        .where(m => m.StringCol.equals("Test 1"))
        .update(m => ({
            BigIntCol: 30000,
            BoolCol: true
        }));
    
    const [rec] = await testTableCtx
        .where(m => m.StringCol.equals("Test 1"))
        .select();
    assert(numRowsAffected == 1 && rec.StringCol == "Test 1" && rec.BoolCol && rec.BigIntCol == 30000);
}

async function test4() {
    console.log("Testing [UPDATE TestTableIdentity SET BoolCol = (CASE WHEN Id = 2 THEN true), BigIntCol = (CASE WHEN Id = 2 THEN 30001)]");
    const [rec] = await testTableIdentCtx.where(m => m.Id.eq(2)).select();
    rec.BoolCol = true;
    rec.BigIntCol = 30001;
    const numRowsAffected = await testTableIdentCtx.update(rec)

    const [_rec] = await testTableIdentCtx
        .where(m => m.StringCol.equals("Test 2"))
        .select();
    assert(numRowsAffected == 1 && _rec.StringCol == "Test 2" && _rec.BoolCol && _rec.BigIntCol == 30001);
}

async function test5() {
    console.log("Testing [UPDATE TestTableIdentity SET ... CASE WHEN ...] (testing updating various columns in multiple records)");
    const rec = await testTableIdentCtx.where(m => m.Id.in([3, 4, 5, 6])).select();
    const date = new Date();
    rec[0].BoolCol = true;
    rec[0].BigIntCol = 30002;
    rec[1].BigIntCol = 30003;
    rec[1].DateCol = date;
    rec[2].BoolCol = true;
    rec[2].BigIntCol = 30004;
    rec[3].BigIntCol = 30005;
    const numRowsAffected = await testTableIdentCtx.update(rec)

    assert(numRowsAffected == 4);
}


export async function testUpdates() {
    console.log(`Testing updates...`);
    await test1();
    await test2();
    await test3();
    await test4();
    await test5();
    console.log(`Update tests passed.`);
}