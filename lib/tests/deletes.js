//@ts-check

import { testTableCtx } from "./test.js";
import assert from "assert";

async function test1() {
    console.log("Testing [UPDATE TestTable SET BigIntCol=20000 WHERE StringCol = 'Test 1']");
    const numRowsAffected = await testTableCtx
        .where(m => m.StringCol.equals("Test 1"))
        .deleteSelect();
    
    const [rec] = await testTableCtx
        .where(m => m.StringCol.equals("Test 1"))
        .select();
    assert(numRowsAffected == 1 && rec.BigIntCol == 20000);
}

async function test2() {

}

async function test3() {

}

export async function testDeletes() {
    console.log(`Testing deletes...`);
    await test1();
    await test2();
    await test3();
    console.log(`Delete tests passed.`);
}